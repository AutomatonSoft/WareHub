param(
  [string]$EnvFile = '.env',
  [string]$ComposeFile = 'deploy/stage/docker-compose.yml',
  [string]$OutputDir = 'docs/stage-migration-verification',
  [string]$ServiceName = 'services'
)

$ErrorActionPreference = 'Stop'

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Save-Output {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  New-Item -ItemType Directory -Force (Split-Path -Parent $Path) | Out-Null
  $Lines | Set-Content -Encoding UTF8 $Path
}

Require-Command -Name 'docker'

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}
if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force $OutputDir | Out-Null

Write-Host '=== stage compose config validation ==='
$cfg = & cmd /c "docker compose -f `"$ComposeFile`" --env-file `"$EnvFile`" config 2>&1"
Save-Output -Path (Join-Path $OutputDir "stage-migration-$stamp-01-compose-config.txt") -Lines $cfg
if ($LASTEXITCODE -ne 0) {
  throw 'docker compose config failed. See saved report.'
}
Write-Host 'compose config: OK'

Write-Host '=== resolving stage services container id ==='
$psRaw = & cmd /c "docker compose -f `"$ComposeFile`" --env-file `"$EnvFile`" ps -q $ServiceName 2>&1"
$containerId = ($psRaw | Where-Object { $_ -match '^[0-9a-f]{12,}$' } | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($containerId)) {
  $msg = @(
    'SKIP: stage services container is not running.',
    'No migration-plan checks were executed.',
    'To run full verification, start stage stack first.'
  )
  Save-Output -Path (Join-Path $OutputDir "stage-migration-$stamp-02-skip.txt") -Lines $msg
  Write-Host $msg[0]
  exit 0
}

Write-Host "stage services container: $containerId"

$steps = @(
  @{ Name = 'showmigrations'; Command = 'python manage.py showmigrations'; File = "stage-migration-$stamp-03-showmigrations.txt" },
  @{ Name = 'migrate-plan'; Command = 'python manage.py migrate --plan'; File = "stage-migration-$stamp-04-migrate-plan.txt" },
  @{ Name = 'makemigrations-check'; Command = 'python manage.py makemigrations --check --dry-run --noinput'; File = "stage-migration-$stamp-05-makemigrations-check.txt" }
)

foreach ($step in $steps) {
  Write-Host "=== $($step.Name) ==="
  $out = & cmd /c "docker exec $containerId sh -lc `"$($step.Command)`" 2>&1"
  Save-Output -Path (Join-Path $OutputDir $step.File) -Lines $out
  if ($LASTEXITCODE -ne 0) {
    throw "Step failed: $($step.Name). See saved report."
  }
  $out | Write-Host
}

Write-Host "Stage migration verification completed. Reports: $OutputDir (stamp $stamp)"

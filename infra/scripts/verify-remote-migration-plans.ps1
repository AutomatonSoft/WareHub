param(
  [Parameter(Mandatory = $true)]
  [Alias('Host')]
  [string]$ServerHost,
  [Parameter(Mandatory = $true)]
  [string]$User,
  [string]$SshPort = '22',
  [string]$RemoteRepoPath = '/opt/sofortbot-infra',
  [string[]]$RemoteRepoPathCandidates = @('/opt/sofortbot-infra', '/home/deploy/sofortbot-infra', '~/sofortbot-infra'),
  [string]$RemoteEnvFile = '.env',
  [string]$OutputDir = 'docs/remote-migration-verification',
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

Require-Command -Name 'ssh'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ([System.IO.Path]::IsPathRooted($OutputDir)) {
  $resolvedOutputDir = $OutputDir
} else {
  $resolvedOutputDir = Join-Path $repoRoot $OutputDir
}

$resolvedRemoteRepoPath = $null
$pathCandidates = @($RemoteRepoPath) + @($RemoteRepoPathCandidates | Where-Object { $_ -ne $RemoteRepoPath })
foreach ($candidate in $pathCandidates) {
  $probeCmd = "test -d '$candidate'"
  & ssh -p $SshPort "$User@$ServerHost" $probeCmd 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $resolvedRemoteRepoPath = $candidate
    break
  }
}

if ([string]::IsNullOrWhiteSpace($resolvedRemoteRepoPath)) {
  $tested = ($pathCandidates -join ', ')
  throw "Remote repo path not found. Checked: $tested"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null
$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("Remote Migration Verification")
$summary.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$summary.Add("Host: $ServerHost")
$summary.Add("Remote repo: $resolvedRemoteRepoPath")
$summary.Add('')

$environments = @(
  @{ Name = 'stage'; Compose = 'deploy/stage/docker-compose.yml' },
  @{ Name = 'prod'; Compose = 'deploy/prod/docker-compose.yml' }
)

foreach ($env in $environments) {
  $name = $env.Name
  $compose = $env.Compose
  Write-Host "=== remote $name migration verification ==="

  $cmdConfig = "cd '$resolvedRemoteRepoPath' && docker compose -f '$compose' --env-file '$RemoteEnvFile' config"
  $cfg = & ssh -p $SshPort "$User@$ServerHost" $cmdConfig 2>&1
  Save-Output -Path (Join-Path $resolvedOutputDir "remote-$name-migration-$stamp-01-compose-config.txt") -Lines $cfg
  if ($LASTEXITCODE -ne 0) {
    throw "Remote $name compose config failed."
  }
  Write-Host "$name compose config: OK"

  $cmdPs = "cd '$resolvedRemoteRepoPath' && docker compose -f '$compose' --env-file '$RemoteEnvFile' ps -q $ServiceName"
  $psRaw = & ssh -p $SshPort "$User@$ServerHost" $cmdPs 2>&1
  $containerId = ($psRaw | Where-Object { $_ -match '^[0-9a-f]{12,}$' } | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    $skip = @(
      "SKIP: remote $name services container is not running.",
      'No migration-plan checks were executed.',
      "To run full verification, start $name stack first."
    )
    Save-Output -Path (Join-Path $resolvedOutputDir "remote-$name-migration-$stamp-02-skip.txt") -Lines $skip
    $summary.Add("[$name] status=SKIP reason=services container is not running")
    Write-Host $skip[0]
    continue
  }

  Write-Host "$name services container: $containerId"
  $steps = @(
    @{ Name = 'showmigrations'; Command = 'python manage.py showmigrations'; File = "remote-$name-migration-$stamp-03-showmigrations.txt" },
    @{ Name = 'migrate-plan'; Command = 'python manage.py migrate --plan'; File = "remote-$name-migration-$stamp-04-migrate-plan.txt" },
    @{ Name = 'makemigrations-check'; Command = 'python manage.py makemigrations --check --dry-run --noinput'; File = "remote-$name-migration-$stamp-05-makemigrations-check.txt" }
  )

  foreach ($step in $steps) {
    Write-Host "=== $name/$($step.Name) ==="
    $cmdStep = "docker exec $containerId sh -lc `"$($step.Command)`""
    $out = & ssh -p $SshPort "$User@$ServerHost" $cmdStep 2>&1
    Save-Output -Path (Join-Path $resolvedOutputDir $step.File) -Lines $out
    if ($LASTEXITCODE -ne 0) {
      throw "Remote step failed: $name/$($step.Name)"
    }
    $out | Write-Host
  }

  $summary.Add("[$name] status=OK container=$containerId")
}

$summaryPath = Join-Path $resolvedOutputDir "remote-migration-verification-summary-$stamp.txt"
$summary | Set-Content -Encoding UTF8 $summaryPath
Write-Host "Summary saved: $summaryPath"

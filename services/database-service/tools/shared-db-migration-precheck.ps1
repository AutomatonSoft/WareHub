param(
  [string]$ContainerName = 'sofortbot-services-dev',
  [string]$OutputDir = 'docs'
)

$ErrorActionPreference = 'Stop'

function Invoke-Step {
  param(
    [string]$Title,
    [string]$Command,
    [string]$OutFile
  )

  Write-Host "=== $Title ==="
  $output = & docker exec $ContainerName sh -lc $Command 2>&1
  $output | Set-Content -Encoding UTF8 $OutFile
  $output | Write-Host
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not available in PATH.'
}

$containerState = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $containerState -ne 'true') {
  throw "Container '$ContainerName' is not running."
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Invoke-Step -Title 'Django check' -Command 'python manage.py check' -OutFile (Join-Path $OutputDir "migration-check-$stamp-01-check.txt")
Invoke-Step -Title 'makemigrations --check --dry-run --noinput' -Command 'python manage.py makemigrations --check --dry-run --noinput' -OutFile (Join-Path $OutputDir "migration-check-$stamp-02-makemigrations-check.txt")
Invoke-Step -Title 'showmigrations' -Command 'python manage.py showmigrations' -OutFile (Join-Path $OutputDir "migration-check-$stamp-03-showmigrations.txt")
Invoke-Step -Title 'migrate --plan' -Command 'python manage.py migrate --plan' -OutFile (Join-Path $OutputDir "migration-check-$stamp-04-migrate-plan.txt")

Write-Host "Saved reports in '$OutputDir' with stamp $stamp"

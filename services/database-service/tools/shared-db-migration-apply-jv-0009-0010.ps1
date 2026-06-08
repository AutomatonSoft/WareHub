param(
  [string]$ContainerName = 'sofortbot-services-dev',
  [string]$OutputDir = 'docs',
  [switch]$ConfirmApply
)

$ErrorActionPreference = 'Stop'

function Run-InContainer {
  param([string]$Command)
  & docker exec $ContainerName sh -lc $Command 2>&1
}

function Save-Step {
  param(
    [string]$Title,
    [string]$Command,
    [string]$OutFile
  )
  Write-Host "=== $Title ==="
  $output = Run-InContainer -Command $Command
  $output | Set-Content -Encoding UTF8 $OutFile
  $output | Write-Host
  return ($output -join "`n")
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker is not available in PATH.'
}

$containerState = docker inspect -f "{{.State.Running}}" $ContainerName 2>$null
if ($LASTEXITCODE -ne 0 -or $containerState -ne 'true') {
  throw "Container '$ContainerName' is not running."
}

if (-not $ConfirmApply) {
  throw 'Refusing to run migration apply without -ConfirmApply switch.'
}

New-Item -ItemType Directory -Force $OutputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

$checkOut = Save-Step -Title 'Django check' -Command 'python manage.py check' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-01-check.txt")
$makemigrationsOut = Save-Step -Title 'makemigrations --check --dry-run --noinput' -Command 'python manage.py makemigrations --check --dry-run --noinput' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-02-makemigrations-check.txt")
$showBefore = Save-Step -Title 'showmigrations (before)' -Command 'python manage.py showmigrations' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-03-showmigrations-before.txt")
$planBefore = Save-Step -Title 'migrate --plan (before)' -Command 'python manage.py migrate --plan' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-04-migrate-plan-before.txt")

if ($makemigrationsOut -notmatch 'No changes detected') {
  throw 'makemigrations --check failed: model drift detected. Abort apply.'
}

if ($planBefore -notmatch 'jv_services\.0009_state_rename_xljv_models_to_jv' -or $planBefore -notmatch 'jv_services\.0010_alter_jvbatchjob_site_family') {
  throw 'Expected jv_services 0009/0010 not found in migration plan. Abort apply.'
}

Write-Host '=== apply migrate jv_services 0010 ==='
$applyOut = Run-InContainer -Command 'python manage.py migrate jv_services 0010'
$applyOut | Set-Content -Encoding UTF8 (Join-Path $OutputDir "migration-apply-$stamp-05-apply.txt")
$applyOut | Write-Host

$showAfter = Save-Step -Title 'showmigrations (after)' -Command 'python manage.py showmigrations' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-06-showmigrations-after.txt")
$planAfter = Save-Step -Title 'migrate --plan (after)' -Command 'python manage.py migrate --plan' -OutFile (Join-Path $OutputDir "migration-apply-$stamp-07-migrate-plan-after.txt")

if ($showAfter -match '\[ \] 0009_state_rename_xljv_models_to_jv' -or $showAfter -match '\[ \] 0010_alter_jvbatchjob_site_family') {
  throw 'Post-apply verification failed: 0009/0010 still unapplied.'
}

if ($planAfter -match 'jv_services\.0009_state_rename_xljv_models_to_jv|jv_services\.0010_alter_jvbatchjob_site_family') {
  throw 'Post-apply plan still includes 0009/0010. Verification failed.'
}

Write-Host "Migration apply completed and verified. Reports saved in '$OutputDir' with stamp $stamp"

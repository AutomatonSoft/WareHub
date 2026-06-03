param(
  [string]$EnvFile = '.env'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile"
}

$required = @(
  'ORCHESTRATOR_IMAGE',
  'ORCHESTRATOR_STAGE_TAG',
  'ORCHESTRATOR_APP_VERSION',
  'STAGE_PUBLIC_SERVICES_API_BASE_URL',
  'PROD_PUBLIC_SERVICES_API_BASE_URL',
  'STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL',
  'PROD_PUBLIC_ORCHESTRATOR_API_BASE_URL'
)

$values = @{}
Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^(?<k>[A-Za-z_][A-Za-z0-9_]*)=(?<v>.*)$') {
    $values[$matches.k] = $matches.v
  }
}

$missing = @()
foreach ($key in $required) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  Write-Host 'Missing required env keys:'
  $missing | ForEach-Object { Write-Host "- $_" }
  exit 1
}

Write-Host 'All required env keys are present.'

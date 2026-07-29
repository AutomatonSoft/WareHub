[CmdletBinding()]
param(
  [switch]$Force,
  [ValidateRange(0, 60000)][int]$DelayMs = 0,
  [ValidateRange(1, 16)][int]$Workers = 8,
  [ValidateRange(1, 2000)][int]$Limit
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$rootEnvPath = Join-Path $repoRoot ".env"
$pythonExe = Join-Path $repoRoot ".venv\database-service\Scripts\python.exe"
$serviceDirectory = Join-Path $repoRoot "services\database-service"

if (-not (Test-Path -LiteralPath $rootEnvPath)) { throw "Missing root .env: $rootEnvPath" }
if (-not (Test-Path -LiteralPath $pythonExe)) { throw "Missing database-service virtual environment. Run .\start-dev.ps1 first." }

$envValues = @{}
foreach ($rawLine in Get-Content -LiteralPath $rootEnvPath) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith("#")) { continue }
  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -le 0) { continue }
  $key = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
  $envValues[$key] = $value
}

foreach ($key in @("DEV_MONGO_USER", "DEV_MONGO_PASSWORD", "DEV_MONGO_DATABASE")) {
  if ([string]::IsNullOrWhiteSpace($envValues[$key])) { throw "$key must be set in root .env." }
}

$env:OTTO_CATEGORY_CACHE_MONGO_URI = ""
$env:OTTO_CATEGORY_CACHE_MONGO_HOST = "localhost"
$env:OTTO_CATEGORY_CACHE_MONGO_PORT = if ($envValues["DEV_MONGO_PORT"]) { $envValues["DEV_MONGO_PORT"] } else { "8938" }
$env:OTTO_CATEGORY_CACHE_MONGO_USERNAME = $envValues["DEV_MONGO_USER"]
$env:OTTO_CATEGORY_CACHE_MONGO_PASSWORD = $envValues["DEV_MONGO_PASSWORD"]
$env:OTTO_CATEGORY_CACHE_MONGO_DATABASE = $envValues["DEV_MONGO_DATABASE"]

$arguments = @("manage.py", "sync_otto_category_attributes", "--delay-ms", $DelayMs, "--workers", $Workers)
if ($Force) { $arguments += "--force" }
if ($PSBoundParameters.ContainsKey("Limit")) { $arguments += @("--limit", $Limit) }

Push-Location $serviceDirectory
try {
  & $pythonExe @arguments
  exit $LASTEXITCODE
} finally {
  Pop-Location
}

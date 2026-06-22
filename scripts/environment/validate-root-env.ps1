[CmdletBinding()]
param(
  [string]$RootEnvPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Get-EnvironmentRepoRoot -ScriptPath $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RootEnvPath)) {
  $RootEnvPath = Join-Path $repoRoot ".env"
}

$buildScript = Join-Path $PSScriptRoot "build-stage-env.ps1"
$composeFile = Join-Path $repoRoot "infra\deploy\stage\docker-compose.yml"
$gatewayValidator = Join-Path $repoRoot "infra\scripts\verify-gateway-only-ports.py"
$generatedPath = New-TemporaryEnvFilePath -Prefix "warehub-root-env-validate"

try {
  & $buildScript -RootEnvPath $RootEnvPath -OutFile $generatedPath

  & docker compose --env-file $generatedPath -f $composeFile config --quiet
  Assert-SuccessfulExitCode -ExitCode $LASTEXITCODE -Action "Stage docker compose config"

  & python $gatewayValidator --compose $composeFile --env-file $generatedPath --expected-gateway-port 8940
  Assert-SuccessfulExitCode -ExitCode $LASTEXITCODE -Action "Gateway-only port validation"

  Write-Host "Root env validation passed: $RootEnvPath"
} finally {
  if (Test-Path -LiteralPath $generatedPath) {
    Remove-Item -LiteralPath $generatedPath -Force -ErrorAction SilentlyContinue
  }
}

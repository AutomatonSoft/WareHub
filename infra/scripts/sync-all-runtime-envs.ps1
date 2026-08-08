param(
  [string]$StageSourceEnvFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.env'),

  [string]$ProdSourceEnvFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.env'),

  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$syncScript = Join-Path $PSScriptRoot 'sync-runtime-env-to-github.ps1'

function Invoke-EnvSync {
  param(
    [ValidateSet('stage', 'prod')]
    [string]$Environment,

    [string]$SourceEnvFile,

    [switch]$DryRun
  )

  if (-not (Test-Path -LiteralPath $SourceEnvFile -PathType Leaf)) {
    throw "Source env file not found for ${Environment}: $SourceEnvFile"
  }

  $arguments = @(
    '-File', $syncScript,
    '-Environment', $Environment,
    '-SourceEnvFile', $SourceEnvFile
  )
  if ($DryRun) {
    $arguments += '-DryRun'
  }

  & pwsh @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Env sync failed for $Environment."
  }
}

# Validate both independent environment sources before changing any GitHub secret.
Invoke-EnvSync -Environment stage -SourceEnvFile $StageSourceEnvFile -DryRun
Invoke-EnvSync -Environment prod -SourceEnvFile $ProdSourceEnvFile -DryRun

if (-not $Apply) {
  Write-Host 'Stage and production env sources are valid. No GitHub secrets were changed; rerun with -Apply to sync both.'
  exit 0
}

Invoke-EnvSync -Environment stage -SourceEnvFile $StageSourceEnvFile
Invoke-EnvSync -Environment prod -SourceEnvFile $ProdSourceEnvFile
Write-Host 'Stage and production GitHub environment secrets were synchronized. No deploy was started.'

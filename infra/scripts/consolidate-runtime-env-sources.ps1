param(
  [string]$MasterEnvFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.env'),

  [string]$ProdEnvFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.env.prod.local'),

  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Read-EnvEntries {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Env file not found: $Path"
  }

  $entries = [ordered]@{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      $entries[$matches.key] = $matches.value
    }
  }
  return $entries
}

$stageEntries = Read-EnvEntries -Path $MasterEnvFile
$prodEntries = Read-EnvEntries -Path $ProdEnvFile
$versionKeys = @(
  'BACKEND_APP_VERSION',
  'FRONTEND_APP_VERSION',
  'SERVICES_APP_VERSION',
  'MOBILE_APP_VERSION',
  'ORCHESTRATOR_APP_VERSION'
)

foreach ($key in $versionKeys) {
  if (-not $stageEntries.Contains($key) -or -not $prodEntries.Contains($key)) {
    throw "Both env files must define $key before consolidation."
  }
}

$missingFromMaster = @($prodEntries.Keys | Where-Object { -not $stageEntries.Contains($_) -and $_ -notin $versionKeys })
$conflictsKeptFromMaster = @(
  $stageEntries.Keys | Where-Object {
    $prodEntries.Contains($_) -and $stageEntries[$_] -cne $prodEntries[$_] -and $_ -notin $versionKeys
  }
)

Write-Host "Master-only additions from production source: $($missingFromMaster.Count)"
Write-Host "Conflicting non-version values retained from master: $($conflictsKeptFromMaster.Count)"
Write-Host 'Version values will be stored as STAGE_*_APP_VERSION and PROD_*_APP_VERSION.'

if (-not $Apply) {
  Write-Host 'Dry run only. Rerun with -Apply to update the master env file.'
  exit 0
}

$lines = [System.Collections.Generic.List[string]]::new()
foreach ($line in Get-Content -LiteralPath $MasterEnvFile) {
  $replaced = $false
  foreach ($key in $versionKeys) {
    if ($line -match "^\s*$key=") {
      $stageKey = "STAGE_$key"
      [void]$lines.Add("$stageKey=$($stageEntries[$key])")
      $replaced = $true
      break
    }
  }
  if (-not $replaced) {
    [void]$lines.Add($line)
  }
}

foreach ($key in $versionKeys) {
  [void]$lines.Add("PROD_$key=$($prodEntries[$key])")
}
foreach ($key in $missingFromMaster) {
  [void]$lines.Add("$key=$($prodEntries[$key])")
}

[System.IO.File]::WriteAllText($MasterEnvFile, (($lines -join "`n") + "`n"))
Write-Host "Updated master env file: $MasterEnvFile"

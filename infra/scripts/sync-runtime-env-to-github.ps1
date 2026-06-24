param(
  [ValidateSet('stage', 'prod')]
  [string]$Environment = 'stage',

  [string]$SourceEnvFile = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path '.env'),

  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Get-EnvEntries {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Env file not found: $Path"
  }

  $values = [ordered]@{}
  $lines = Get-Content -LiteralPath $Path
  for ($index = 0; $index -lt $lines.Count; $index++) {
    $line = $lines[$index]
    if (($index -eq 0) -and $line) {
      $line = $line.TrimStart([char]0xFEFF)
    }

    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') {
      continue
    }

    if ($line -match '^\s*export\s+') {
      $line = $line -replace '^\s*export\s+', ''
    }

    if ($line -notmatch '^\s*(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      throw "Malformed env line in $Path at line $($index + 1)."
    }

    $values[$matches.key] = $matches.value
  }

  return $values
}

function Write-EnvFile {
  param(
    [string]$Path,
    [System.Collections.Specialized.OrderedDictionary]$Values
  )

  $lines = foreach ($key in $Values.Keys) {
    '{0}={1}' -f $key, $Values[$key]
  }

  [System.IO.File]::WriteAllText($Path, (($lines -join "`n") + "`n"))
}

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-CheckedExternal {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,

    [Parameter(Mandatory = $true)]
    [string]$FailureMessage
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

$repoRoot = Get-RepoRoot
$templatePath = Join-Path $repoRoot ("infra\deploy\{0}\env.{0}.sanitized.template" -f $Environment)
$validatorPath = Join-Path $repoRoot 'infra\scripts\verify-required-env.ps1'
$secretName = if ($Environment -eq 'stage') { 'STAGE_ENV_FILE' } else { 'PROD_ENV_FILE' }

$sourceEntries = Get-EnvEntries -Path $SourceEnvFile
$templateEntries = Get-EnvEntries -Path $templatePath
$overrideEntries = [ordered]@{}

foreach ($key in $templateEntries.Keys) {
  if ($sourceEntries.Contains($key)) {
    $overrideEntries[$key] = $sourceEntries[$key]
  }
}

$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('warehub-env-sync-' + [System.Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $tempDir -Force

try {
  $overridePath = Join-Path $tempDir '.env.override'
  $runtimePath = Join-Path $tempDir '.env.runtime'

  Write-EnvFile -Path $overridePath -Values $overrideEntries

  Invoke-CheckedExternal -FailureMessage "Failed to build runtime env file." -Command {
    & python (Join-Path $repoRoot 'infra\scripts\build-runtime-env.py') `
      --template $templatePath `
      --override $overridePath `
      --output $runtimePath
  }

  Invoke-CheckedExternal -FailureMessage "Runtime env validation failed for '$Environment'." -Command {
    & powershell -ExecutionPolicy Bypass -File $validatorPath `
      -EnvFile $runtimePath `
      -Environment $Environment `
      -InputKind Runtime
  }

  $missingFromSource = @()
  foreach ($key in $templateEntries.Keys) {
    if (-not $sourceEntries.Contains($key)) {
      $missingFromSource += $key
    }
  }

  Write-Host ("Prepared {0} override with {1} keys from {2}" -f $Environment, $overrideEntries.Count, $SourceEnvFile)

  if ($DryRun) {
    Write-Host "Dry run mode: GitHub secret upload skipped."
    Write-Host ("Override file: {0}" -f $overridePath)
    Write-Host ("Validated runtime file: {0}" -f $runtimePath)
    if ($missingFromSource.Count -gt 0) {
      Write-Host ("Keys not present in source env and therefore taken from template defaults: {0}" -f ($missingFromSource -join ', '))
    }
    return
  }

  if (-not (Test-CommandExists -Name 'gh')) {
    throw "GitHub CLI 'gh' is not installed or not available in PATH."
  }

  Invoke-CheckedExternal -FailureMessage "GitHub CLI is not authenticated. Run 'gh auth login' first." -Command {
    & gh auth status
  }

  Get-Content -LiteralPath $overridePath | & gh secret set $secretName --env $Environment
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to upload $secretName to GitHub environment '$Environment'."
  }

  Write-Host ("Uploaded {0} to GitHub environment '{1}'." -f $secretName, $Environment)
}
finally {
  if (Test-Path -LiteralPath $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}

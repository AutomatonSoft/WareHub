[CmdletBinding()]
param(
  [string]$RootEnvPath,
  [string]$TemplatePath,
  [string]$OutFile
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Get-EnvironmentRepoRoot -ScriptPath $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RootEnvPath)) {
  $RootEnvPath = Join-Path $repoRoot ".env"
}
if ([string]::IsNullOrWhiteSpace($TemplatePath)) {
  $TemplatePath = Join-Path $repoRoot "infra\deploy\stage\env.stage.sanitized.template"
}
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = New-TemporaryEnvFilePath -Prefix "warehub-stage-generated"
}

$rootEnv = ConvertFrom-DotenvFile -Path $RootEnvPath
if ($rootEnv.Findings.Count -gt 0) {
  throw "Root env is invalid:`n- $($rootEnv.Findings -join "`n- ")"
}

$templateEnv = ConvertFrom-DotenvFile -Path $TemplatePath
if ($templateEnv.Findings.Count -gt 0) {
  throw "Stage template is invalid:`n- $($templateEnv.Findings -join "`n- ")"
}

$lines = [System.Collections.Generic.List[string]]::new()
[void]$lines.Add("# Generated from repo-root .env. Do not edit manually.")

$missingKeys = [System.Collections.Generic.List[string]]::new()
$placeholderKeys = [System.Collections.Generic.List[string]]::new()
foreach ($key in $templateEnv.KeyOrder) {
  if (-not $rootEnv.Values.ContainsKey($key)) {
    [void]$missingKeys.Add($key)
    continue
  }

  if (Test-EnvPlaceholderValue -Value $rootEnv.Values[$key]) {
    [void]$placeholderKeys.Add($key)
    continue
  }

  [void]$lines.Add("${key}=$($rootEnv.Values[$key])")
}

if ($missingKeys.Count -gt 0) {
  throw "Root .env is missing stage env keys required to build runtime output:`n- $($missingKeys -join "`n- ")"
}

if ($placeholderKeys.Count -gt 0) {
  throw "Root .env still contains placeholder values for required stage runtime keys:`n- $($placeholderKeys -join "`n- ")"
}

Write-DotenvFile -Path $OutFile -Lines @($lines)

$validatorPath = Join-Path $repoRoot "infra\scripts\verify-required-env.ps1"
$powerShellExecutable = Resolve-EnvironmentPowerShellExecutable
& $powerShellExecutable -NoProfile -ExecutionPolicy Bypass -File $validatorPath -EnvFile $OutFile -Environment stage -InputKind Runtime
Assert-SuccessfulExitCode -ExitCode $LASTEXITCODE -Action "Stage runtime env validation"

Write-Host "Generated stage env: $OutFile"

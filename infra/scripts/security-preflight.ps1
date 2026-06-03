param(
  [string]$RepoPath = '.',
  [string]$OutputDir = 'docs/security',
  [switch]$IncludeGitHistory
)

$ErrorActionPreference = 'Stop'

$resolvedRepo = (Resolve-Path $RepoPath).Path
$scriptsDir = Join-Path $resolvedRepo 'scripts'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $resolvedRepo $OutputDir }
New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null
$summaryPath = Join-Path $resolvedOutputDir "security-preflight-summary-$stamp.txt"

$checks = @(
  @{ Name = 'env-example-placeholders'; Script = 'verify-env-example-placeholders.ps1'; Args = @() },
  @{ Name = 'env-tracking'; Script = 'verify-env-tracking.ps1'; Args = @('-RepoPath', $resolvedRepo) },
  @{ Name = 'secret-scan'; Script = 'scan-secrets.ps1'; Args = @('-TargetPath', '..') + ($(if ($IncludeGitHistory) { @('-IncludeGitHistory') } else { @() })) }
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Security Preflight Summary')
$lines.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$lines.Add("Repo: $resolvedRepo")
$lines.Add('')

$hasFailure = $false
foreach ($check in $checks) {
  $scriptPath = Join-Path $scriptsDir $check.Script
  if (-not (Test-Path $scriptPath)) {
    $lines.Add("[$($check.Name)] status=FAILED reason=script_not_found path=$scriptPath")
    $hasFailure = $true
    continue
  }

  & powershell -ExecutionPolicy Bypass -File $scriptPath @($check.Args)
  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    $lines.Add("[$($check.Name)] status=OK")
  } else {
    $lines.Add("[$($check.Name)] status=FAILED exit_code=$exitCode")
    $hasFailure = $true
  }
}

$lines.Add('')
$lines.Add("overall_status=$(if ($hasFailure) { 'FAILED' } else { 'OK' })")
$lines | Set-Content -Encoding UTF8 $summaryPath
Write-Host "Summary saved: $summaryPath"

if ($hasFailure) {
  exit 1
}


param(
  [string]$RepoPath = '.',
  [string]$OutputDir = 'docs/ops',
  [switch]$UseRemote,
  [string]$ServerHost,
  [string]$ServerUser,
  [string]$SshPort = '22',
  [string]$RemoteRepoPath = '/home/server/sofotbot/infra',
  [string]$RemoteEnvFile = '.env'
)

$ErrorActionPreference = 'Stop'

$resolvedRepo = (Resolve-Path $RepoPath).Path
$scriptsDir = Join-Path $resolvedRepo 'scripts'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $resolvedRepo $OutputDir }
New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null
$summaryPath = Join-Path $resolvedOutputDir "ops-preflight-summary-$stamp.txt"

$checks = @(
  @{ Name = 'required-env'; Script = 'verify-required-env.ps1'; Args = @() }
)

if ($UseRemote) {
  if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'When -UseRemote is set, ssh must be available in PATH.'
  }
  if ([string]::IsNullOrWhiteSpace($ServerHost) -or [string]::IsNullOrWhiteSpace($ServerUser)) {
    throw 'When -UseRemote is set, -ServerHost and -ServerUser are required.'
  }
  $checks += @{
    Name = 'remote-migration-plans'
    Script = 'verify-remote-migration-plans.ps1'
    Args = @(
      '-ServerHost', $ServerHost,
      '-User', $ServerUser,
      '-SshPort', $SshPort,
      '-RemoteRepoPath', $RemoteRepoPath,
      '-RemoteEnvFile', $RemoteEnvFile
    )
  }
} else {
  $checks += @{
    Name = 'local-migration-plans'
    Script = 'verify-all-migration-plans.ps1'
    Args = @()
  }
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Ops Preflight Summary')
$lines.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$lines.Add("Repo: $resolvedRepo")
$lines.Add("Mode: $(if ($UseRemote) { 'remote' } else { 'local' })")
$lines.Add('')

$hasFailure = $false
Push-Location $resolvedRepo
try {
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
}
finally {
  Pop-Location
}

$lines.Add('')
$lines.Add("overall_status=$(if ($hasFailure) { 'FAILED' } else { 'OK' })")
$lines | Set-Content -Encoding UTF8 $summaryPath
Write-Host "Summary saved: $summaryPath"

if ($hasFailure) {
  exit 1
}

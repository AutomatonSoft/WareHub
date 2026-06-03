param(
  [string]$RepoPath = '.',
  [string]$OutputDir = 'docs/quality-gate',
  [ValidateSet('local', 'remote')]
  [string]$OpsMode = 'local',
  [switch]$ApiFull,
  [switch]$ApiStrict,
  [string[]]$ApiSkipAllowList = @('database-makemigrations-check', 'database-migrate-plan'),
  [int]$ApiStepTimeoutSeconds = 90,
  [switch]$SecurityIncludeGitHistory,
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
$summaryPath = Join-Path $resolvedOutputDir "quality-gate-summary-$stamp.txt"

$apiMode = if ($ApiFull) { 'full' } else { 'quick' }

$checks = @(
  @{
    Name = 'security-preflight'
    Script = 'security-preflight.ps1'
    Args = @('-RepoPath', $resolvedRepo) + ($(if ($SecurityIncludeGitHistory) { @('-IncludeGitHistory') } else { @() }))
  }
)

$opsArgs = @('-RepoPath', $resolvedRepo)
if ($OpsMode -eq 'remote') {
  $opsArgs += @(
    '-UseRemote',
    '-ServerHost', $ServerHost,
    '-ServerUser', $ServerUser,
    '-SshPort', $SshPort,
    '-RemoteRepoPath', $RemoteRepoPath,
    '-RemoteEnvFile', $RemoteEnvFile
  )
}
$checks += @{
  Name = 'ops-preflight'
  Script = 'ops-preflight.ps1'
  Args = $opsArgs
}

$apiArgs = @(
  '-WorkspaceRoot', '../..',
  '-Mode', $apiMode,
  '-StepTimeoutSeconds', $ApiStepTimeoutSeconds,
  '-SkipAllowList', ($ApiSkipAllowList -join ',')
)
if ($ApiStrict) {
  $apiArgs += '-FailOnSkip'
}
$checks += @{
  Name = 'api-contract-preflight'
  Script = 'api-contract-preflight.ps1'
  Args = $apiArgs
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('Quality Gate Summary')
$lines.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$lines.Add("Repo: $resolvedRepo")
$lines.Add("OpsMode: $OpsMode")
$lines.Add("ApiMode: $apiMode")
$lines.Add("ApiStrict: $($ApiStrict.IsPresent)")
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


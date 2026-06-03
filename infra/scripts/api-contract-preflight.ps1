param(
  [string]$WorkspaceRoot = '../..',
  [string]$OutputDir = 'docs/api-contract',
  [int]$StepTimeoutSeconds = 90,
  [switch]$FailOnSkip,
  [string[]]$SkipAllowList = @(),
  [ValidateSet('quick', 'full')]
  [string]$Mode = 'quick'
)

$ErrorActionPreference = 'Stop'

function New-Dir([string]$Path) {
  New-Item -ItemType Directory -Force $Path | Out-Null
}

function Run-Step {
  param(
    [string]$Name,
    [string]$Workdir,
    [string]$Command,
    [string]$LogPath,
    [int]$TimeoutSeconds
  )

  if (-not (Test-Path $Workdir)) {
    "SKIP: missing workdir $Workdir" | Set-Content -Encoding UTF8 $LogPath
    return @{ Status = 'SKIP'; ExitCode = 0 }
  }

  $job = Start-Job -ScriptBlock {
    param($cmd)
    $cmdOutput = & cmd /c $cmd 2>&1
    $exitCode = $LASTEXITCODE
    [pscustomobject]@{
      Output = @($cmdOutput)
      ExitCode = $exitCode
    }
  } -ArgumentList $Command

  $completed = Wait-Job -Job $job -Timeout $TimeoutSeconds
  if ($null -eq $completed) {
    Stop-Job -Job $job | Out-Null
    Remove-Job -Job $job | Out-Null
    "SKIP: timeout after $TimeoutSeconds seconds" | Set-Content -Encoding UTF8 $LogPath
    return @{ Status = 'SKIP'; ExitCode = 124 }
  }

  $resultObj = Receive-Job -Job $job
  Remove-Job -Job $job | Out-Null
  $resultObj.Output | Set-Content -Encoding UTF8 $LogPath

  if ($resultObj.ExitCode -eq 0) {
    return @{ Status = 'OK'; ExitCode = 0 }
  }
  return @{ Status = 'FAILED'; ExitCode = $resultObj.ExitCode }
}

$infraRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$workspace = (Resolve-Path (Join-Path $PSScriptRoot $WorkspaceRoot)).Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $infraRoot $OutputDir }
$normalizedSkipAllowList = @()
foreach ($entry in $SkipAllowList) {
  if ([string]::IsNullOrWhiteSpace($entry)) { continue }
  $parts = $entry.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $normalizedSkipAllowList += $parts
}
$normalizedSkipAllowList = $normalizedSkipAllowList | Select-Object -Unique
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
New-Dir $resolvedOutputDir

$frontendDir = Join-Path $workspace 'sofortbot-frontend'
$servicesDbDir = Join-Path $workspace 'sofortbot-services\services\database_service'
$orchestratorDir = Join-Path $workspace 'sofortbot-services\services\sb-sofort-orchestrator-service'

$steps = @(
  @{ Name = 'frontend-openapi-check'; Workdir = $frontendDir; Command = 'cd /d "' + $frontendDir + '" && npm run openapi:check' },
  @{ Name = 'frontend-orchestrator-openapi-check'; Workdir = $frontendDir; Command = 'cd /d "' + $frontendDir + '" && npm run openapi:orchestrator:check' },
  @{ Name = 'database-check'; Workdir = $servicesDbDir; Command = 'cd /d "' + $servicesDbDir + '" && python manage.py check' },
  @{ Name = 'database-makemigrations-check'; Workdir = $servicesDbDir; Command = 'cd /d "' + $servicesDbDir + '" && python manage.py makemigrations --check --dry-run --noinput' },
  @{ Name = 'database-migrate-plan'; Workdir = $servicesDbDir; Command = 'cd /d "' + $servicesDbDir + '" && python manage.py migrate --plan' },
  @{ Name = 'orchestrator-pytest'; Workdir = $orchestratorDir; Command = 'cd /d "' + $orchestratorDir + '" && pytest -q' }
)

if ($Mode -eq 'full') {
  $steps += @{ Name = 'orchestrator-ruff'; Workdir = $orchestratorDir; Command = 'cd /d "' + $orchestratorDir + '" && ruff check src tests tools' }
}

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add('API Contract Preflight Summary')
$summary.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$summary.Add("Workspace: $workspace")
$summary.Add("Mode: $Mode")
$summary.Add('')

$failed = $false
$okCount = 0
$skipCount = 0
$skipAllowedCount = 0
foreach ($step in $steps) {
  $logPath = Join-Path $resolvedOutputDir ("api-contract-preflight-$stamp-" + $step.Name + '.txt')
  $result = Run-Step -Name $step.Name -Workdir $step.Workdir -Command $step.Command -LogPath $logPath -TimeoutSeconds $StepTimeoutSeconds
  $summary.Add("[$($step.Name)] status=$($result.Status) log=$logPath")
  if ($result.Status -eq 'FAILED') {
    $summary.Add("[$($step.Name)] exit_code=$($result.ExitCode)")
    $failed = $true
  } elseif ($result.Status -eq 'OK') {
    $okCount += 1
  } else {
    $skipCount += 1
    $isAllowedSkip = $normalizedSkipAllowList -contains $step.Name
    if ($isAllowedSkip) {
      $skipAllowedCount += 1
      $summary.Add("[$($step.Name)] skip_allowed=true")
    } else {
      $summary.Add("[$($step.Name)] skip_allowed=false")
    }
  }
}

$allSkipped = ($skipCount -eq $steps.Count)
$disallowedSkipCount = $skipCount - $skipAllowedCount
$overall = if ($failed -or $allSkipped -or ($FailOnSkip -and $disallowedSkipCount -gt 0)) { 'FAILED' } else { 'OK' }
$summary.Add('')
$summary.Add("ok_steps=$okCount")
$summary.Add("skipped_steps=$skipCount")
$summary.Add("allowed_skipped_steps=$skipAllowedCount")
$summary.Add("disallowed_skipped_steps=$disallowedSkipCount")
$summary.Add("fail_on_skip=$($FailOnSkip.IsPresent)")
$summary.Add("skip_allow_list=$([string]::Join(',', $normalizedSkipAllowList))")
$summary.Add("overall_status=$overall")
$summaryPath = Join-Path $resolvedOutputDir "api-contract-preflight-summary-$stamp.txt"
$summary | Set-Content -Encoding UTF8 $summaryPath
Write-Host "Summary saved: $summaryPath"

if ($overall -ne 'OK') {
  exit 1
}

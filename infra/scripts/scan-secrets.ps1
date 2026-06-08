param(
  [string]$TargetPath = '..',
  [string]$OutputDir = 'docs/security',
  [switch]$IncludeGitHistory
)

$ErrorActionPreference = 'Stop'

function Require-Path {
  param([string]$PathToCheck)
  if (-not (Test-Path $PathToCheck)) {
    throw "Target path not found: $PathToCheck"
  }
}

function New-ReportPath {
  param(
    [string]$Dir,
    [string]$Name
  )
  New-Item -ItemType Directory -Force $Dir | Out-Null
  return (Join-Path $Dir $Name)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scanPath = (Resolve-Path (Join-Path $PSScriptRoot $TargetPath)).Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $repoRoot $OutputDir }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Require-Path -PathToCheck $scanPath

$summary = New-Object System.Collections.Generic.List[string]
$summary.Add("Secret Scan Summary")
$summary.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$summary.Add("Target: $scanPath")
$summary.Add('')

$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if ($null -ne $gitleaks) {
  $reportJson = New-ReportPath -Dir $resolvedOutputDir -Name "gitleaks-workingtree-$stamp.json"
  $args = @('detect', '--source', $scanPath, '--redact', '--report-format', 'json', '--report-path', $reportJson)
  & gitleaks @args
  $detectCode = $LASTEXITCODE
  if ($detectCode -eq 0) {
    $summary.Add('[gitleaks working tree] status=clean')
  } elseif ($detectCode -eq 1) {
    $summary.Add("[gitleaks working tree] status=findings report=$reportJson")
  } else {
    throw "gitleaks detect failed with exit code $detectCode"
  }

  if ($IncludeGitHistory) {
    $histReportJson = New-ReportPath -Dir $resolvedOutputDir -Name "gitleaks-history-$stamp.json"
    $histArgs = @('detect', '--source', $scanPath, '--redact', '--log-opts', '--all', '--report-format', 'json', '--report-path', $histReportJson)
    & gitleaks @histArgs
    $histCode = $LASTEXITCODE
    if ($histCode -eq 0) {
      $summary.Add('[gitleaks history] status=clean')
    } elseif ($histCode -eq 1) {
      $summary.Add("[gitleaks history] status=findings report=$histReportJson")
    } else {
      throw "gitleaks history scan failed with exit code $histCode"
    }
  }
} else {
  $summary.Add('[gitleaks] status=not_installed using=fallback_regex_scan')
  $fallbackPatterns = @(
    'OPENAI_API_KEY\s*=\s*sk-',
    'SENTRY_AUTH_TOKEN\s*=',
    'PASSWORD\s*=',
    'SECRET_KEY\s*=',
    'FTP_.*PASS\s*=',
    'POSTGRES_PASSWORD\s*='
  )
  $fallbackReport = New-ReportPath -Dir $resolvedOutputDir -Name "fallback-secret-scan-$stamp.txt"
  $hits = @()
  foreach ($pattern in $fallbackPatterns) {
    $result = & rg -n --hidden --glob '!.git' --glob '!node_modules' --glob '!**/dist/**' --glob '!**/.next/**' --glob '!**/build/**' --glob '!**/coverage/**' $pattern $scanPath 2>$null
    if ($LASTEXITCODE -eq 0 -and $result) {
      $hits += "PATTERN: $pattern"
      $hits += $result
      $hits += ''
    }
  }
  if ($hits.Count -eq 0) {
    $hits = @('No fallback regex hits found.')
    $summary.Add('[fallback regex scan] status=clean')
  } else {
    $summary.Add("[fallback regex scan] status=findings report=$fallbackReport")
  }
  $hits | Set-Content -Encoding UTF8 $fallbackReport
}

$summaryPath = New-ReportPath -Dir $resolvedOutputDir -Name "secret-scan-summary-$stamp.txt"
$summary | Set-Content -Encoding UTF8 $summaryPath
Write-Host "Summary saved: $summaryPath"


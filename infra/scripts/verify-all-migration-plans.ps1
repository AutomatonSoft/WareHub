param(
  [string]$StageScript = 'scripts/verify-stage-migration-plan.ps1',
  [string]$ProdScript = 'scripts/verify-prod-migration-plan.ps1',
  [string]$SummaryDir = 'docs/migration-verification'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $StageScript)) {
  throw "Stage script not found: $StageScript"
}
if (-not (Test-Path $ProdScript)) {
  throw "Prod script not found: $ProdScript"
}

New-Item -ItemType Directory -Force $SummaryDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$summaryPath = Join-Path $SummaryDir "migration-verification-summary-$stamp.txt"

$lines = @()
$lines += "Migration Verification Summary"
$lines += "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
$lines += ""

Write-Host '=== stage migration verification ==='
$stageOut = & powershell -ExecutionPolicy Bypass -File $StageScript 2>&1
$stageCode = $LASTEXITCODE
$stageOut | Write-Host
$lines += "[stage] exit_code=$stageCode"
$lines += $stageOut
$lines += ""

Write-Host '=== prod migration verification ==='
$prodOut = & powershell -ExecutionPolicy Bypass -File $ProdScript 2>&1
$prodCode = $LASTEXITCODE
$prodOut | Write-Host
$lines += "[prod] exit_code=$prodCode"
$lines += $prodOut
$lines += ""

$overall = if ($stageCode -eq 0 -and $prodCode -eq 0) { 'OK' } else { 'FAILED' }
$lines += "overall_status=$overall"
$lines | Set-Content -Encoding UTF8 $summaryPath

Write-Host "Summary saved: $summaryPath"

if ($overall -ne 'OK') {
  exit 1
}

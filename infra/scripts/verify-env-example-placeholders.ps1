param(
  [string]$EnvExamplePath = '.env.example',
  [string]$OutputDir = 'docs/security'
)

$ErrorActionPreference = 'Stop'

function Is-PlaceholderValue {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $true }

  $v = $Value.Trim().ToLowerInvariant()
  if ($v.StartsWith('<') -and $v.EndsWith('>')) { return $true }
  if ($v.Contains('change-me')) { return $true }
  if ($v.StartsWith('your_')) { return $true }
  if ($v.Contains('example.com')) { return $true }
  if ($v -eq 'v0.0.0') { return $true }
  return $false
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = if ([System.IO.Path]::IsPathRooted($EnvExamplePath)) { $EnvExamplePath } else { Join-Path $repoRoot $EnvExamplePath }
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $repoRoot $OutputDir }

if (-not (Test-Path $envPath)) {
  throw ".env.example not found: $envPath"
}

New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$reportPath = Join-Path $resolvedOutputDir "env-example-placeholder-check-$stamp.txt"

$sensitiveKeyPattern = '(PASS|PASSWORD|TOKEN|SECRET|API_KEY|DSN)'
$violations = New-Object System.Collections.Generic.List[string]

$lines = Get-Content -Path $envPath
for ($i = 0; $i -lt $lines.Count; $i++) {
  $lineNo = $i + 1
  $line = $lines[$i]
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line.TrimStart().StartsWith('#')) { continue }
  if (-not $line.Contains('=')) { continue }

  $parts = $line.Split('=', 2)
  $key = $parts[0].Trim()
  $value = $parts[1].Trim()

  if ($key -match $sensitiveKeyPattern) {
    if (-not (Is-PlaceholderValue -Value $value)) {
      $violations.Add("line=$lineNo key=$key has non-placeholder value")
    }
  }
}

$out = New-Object System.Collections.Generic.List[string]
$out.Add("Env Example Placeholder Check")
$out.Add("Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')")
$out.Add("File: $envPath")
$out.Add('')

if ($violations.Count -eq 0) {
  $out.Add('status=OK no sensitive non-placeholder values detected')
  $out | Set-Content -Encoding UTF8 $reportPath
  Write-Host "Check passed. Report: $reportPath"
  exit 0
}

$out.Add('status=FAILED sensitive keys with non-placeholder values detected')
$out.Add('')
$out.AddRange($violations)
$out | Set-Content -Encoding UTF8 $reportPath
Write-Host "Check failed. Report: $reportPath"
exit 1


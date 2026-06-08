param(
  [string]$RepoPath = '.',
  [string]$OutputDir = 'docs/launch-signoff',
  [string]$DateStamp = ''
)

$ErrorActionPreference = 'Stop'

$resolvedRepo = (Resolve-Path $RepoPath).Path
$resolvedOutputDir = if ([System.IO.Path]::IsPathRooted($OutputDir)) { $OutputDir } else { Join-Path $resolvedRepo $OutputDir }
New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null

if ([string]::IsNullOrWhiteSpace($DateStamp)) {
  $DateStamp = Get-Date -Format 'yyyy-MM-dd'
}

$templateDir = Join-Path $resolvedRepo 'docs'
$templates = @(
  'STAGE_SMOKE_SIGNOFF_TEMPLATE.md',
  'ROLLBACK_DRILL_SIGNOFF_TEMPLATE.md',
  'MVP_GO_NO_GO_APPROVAL_TEMPLATE.md'
)

$created = New-Object System.Collections.Generic.List[string]
foreach ($template in $templates) {
  $src = Join-Path $templateDir $template
  if (-not (Test-Path $src)) {
    throw "Template not found: $src"
  }
  $nameBase = [System.IO.Path]::GetFileNameWithoutExtension($template).Replace('_TEMPLATE', '')
  $dstName = "$DateStamp-$nameBase.md"
  $dst = Join-Path $resolvedOutputDir $dstName
  Copy-Item -LiteralPath $src -Destination $dst -Force
  $created.Add($dst)
}

$indexPath = Join-Path $resolvedOutputDir "$DateStamp-SIGNOFF-PACK-INDEX.md"
$index = New-Object System.Collections.Generic.List[string]
$index.Add("# SIGNOFF_PACK_INDEX")
$index.Add("")
$index.Add("Date: $DateStamp")
$index.Add("")
$index.Add("Generated files:")
foreach ($file in $created) {
  $index.Add("- $file")
}
$index | Set-Content -Encoding UTF8 $indexPath

Write-Host "Sign-off pack prepared:"
Write-Host $indexPath


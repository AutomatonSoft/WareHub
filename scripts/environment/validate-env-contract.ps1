[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootEnvExamplePath = Join-Path $repoRoot ".env.example"

if (-not (Test-Path -LiteralPath $rootEnvExamplePath)) {
  throw "Missing root env example: $rootEnvExamplePath"
}

function Get-DotenvKeys {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $keys = New-Object System.Collections.Generic.HashSet[string]
  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separatorIndex = $line.IndexOf("=")
    if ($separatorIndex -le 0) {
      continue
    }

    $key = $line.Substring(0, $separatorIndex).Trim()
    if ($key -match '^[A-Za-z_][A-Za-z0-9_]*$') {
      $null = $keys.Add($key)
    }
  }

  return $keys
}

function Add-Matches {
  param(
    [Parameter(Mandatory = $true)]$Set,
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string[]]$Patterns
  )

  foreach ($pattern in $Patterns) {
    foreach ($match in [regex]::Matches($Content, $pattern)) {
      $value = $match.Groups[1].Value
      if ($value) {
        $null = $Set.Add($value)
      }
    }
  }
}

$filesToScan = @(
  "infra/local/docker-compose.dev.yml",
  "apps/frontend/next.config.mjs",
  "apps/frontend/.env.example",
  "apps/backend/src/main.rs",
  "apps/backend/src/app_router.rs",
  "apps/backend/src/email.rs",
  "apps/backend/src/auth/handlers_password_reset.rs",
  "apps/backend/.env.example",
  "services/database-service/database_service/settings.py",
  "services/database-service/.env.example",
  "services/orchestrator/src/sofort_orchestrator/infra/settings.py",
  "services/orchestrator/.env.example",
  "infra/.env.example"
)

$regexPatterns = @(
  'process\.env\.([A-Z0-9_]+)',
  'process\.env\[[''"]([A-Z0-9_]+)[''"]\]',
  'os\.getenv\([''"]([A-Z0-9_]+)[''"]',
  'env::var\("([A-Z0-9_]+)"\)',
  'std::env::var\("([A-Z0-9_]+)"\)',
  '\$\{([A-Z0-9_]+)(?::-[^}]*)?\}'
)

$documentedPatternPlaceholders = @(
  'JV_SITE_KEYS',
  'XL_SOURCE_<SITE>_DB_HOST',
  'XL_SOURCE_<SITE>_DB_USER',
  'XL_SOURCE_<SITE>_DB_PASSWORD',
  'XL_SOURCE_<SITE>_DB_NAME',
  'XL_SOURCE_<SITE>_DB_PORT',
  'XL_SOURCE_<SITE>_DB_PREFIX',
  'JV_SOURCE_<SITE>_DB_HOST',
  'JV_SOURCE_<SITE>_DB_USER',
  'JV_SOURCE_<SITE>_DB_PASSWORD',
  'JV_SOURCE_<SITE>_DB_NAME',
  'JV_SOURCE_<SITE>_DB_PORT',
  'JV_SOURCE_<SITE>_DB_PREFIX',
  'FTP_<SITE>_URL',
  'FTP_<SITE>_DOMIN',
  'FTP_<SITE>_HOST',
  'FTP_<SITE>_USER',
  'FTP_<SITE>_PASS',
  'FTP_<SITE>_PORT'
)

$exampleKeys = Get-DotenvKeys -Path $rootEnvExamplePath
$referencedKeys = New-Object System.Collections.Generic.HashSet[string]

foreach ($relativePath in $filesToScan) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "Missing file during env validation: $relativePath"
  }

  $content = Get-Content -Raw -LiteralPath $fullPath
  Add-Matches -Set $referencedKeys -Content $content -Patterns $regexPatterns
}

$missingKeys = @($referencedKeys | Where-Object { -not $exampleKeys.Contains($_) } | Sort-Object -Unique)

Write-Host "Env contract validation summary"
Write-Host "  Root .env.example keys: $($exampleKeys.Count)"
Write-Host "  Referenced exact env keys: $($referencedKeys.Count)"
Write-Host "  Documented pattern placeholders: $($documentedPatternPlaceholders.Count)"

if ($missingKeys.Count -gt 0) {
  Write-Host ""
  Write-Host "Missing exact keys in root .env.example:"
  foreach ($key in $missingKeys) {
    Write-Host "  $key"
  }
  exit 1
}

Write-Host ""
Write-Host "All scanned exact env references are covered by root .env.example."
Write-Host "Dynamic site-specific families are documented as placeholders:"
foreach ($placeholder in $documentedPatternPlaceholders) {
  Write-Host "  $placeholder"
}

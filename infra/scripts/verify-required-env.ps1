param(
  [Parameter(Mandatory = $true)]
  [string]$EnvFile,

  [ValidateSet('stage', 'prod')]
  [string]$Environment = 'stage',

  [ValidateSet('Template', 'Runtime')]
  [string]$InputKind = 'Runtime'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

if ($Environment -ne 'stage') {
  Write-Error "Required env validation is currently defined for stage only."
  exit 1
}

$stageRequiredKeys = @(
  'BACKEND_IMAGE',
  'BACKEND_STAGE_TAG',
  'FRONTEND_IMAGE',
  'FRONTEND_STAGE_TAG',
  'GATEWAY_IMAGE',
  'GATEWAY_STAGE_TAG',
  'MOBILE_IMAGE',
  'MOBILE_STAGE_TAG',
  'SERVICES_IMAGE',
  'SERVICES_STAGE_TAG',
  'ORCHESTRATOR_IMAGE',
  'ORCHESTRATOR_STAGE_TAG',
  'STAGE_DOMAIN',
  'STAGE_GATEWAY_PORT',
  'STAGE_PUBLIC_API_BASE_URL',
  'STAGE_PUBLIC_SERVICES_API_BASE_URL',
  'STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL',
  'STAGE_POSTGRES_DB',
  'STAGE_POSTGRES_USER',
  'STAGE_POSTGRES_PASSWORD',
  'STAGE_SMTP_HOST',
  'STAGE_SMTP_PORT',
  'STAGE_SMTP_USERNAME',
  'STAGE_SMTP_PASSWORD',
  'STAGE_SMTP_FROM',
  'STAGE_SMTP_INSECURE',
  'STAGE_PASSWORD_RESET_CODE_TTL_MINUTES',
  'STAGE_PASSWORD_RESET_LOG_CODES',
  'SERVICES_SECRET_KEY',
  'STAGE_RUN_MIGRATIONS_ON_STARTUP',
  'STAGE_SERVICES_ALLOWED_HOSTS',
  'STAGE_BACKEND_AUTH_BASE_URL',
  'STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS',
  'STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL',
  'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS',
  'ORCHESTRATOR_HTTP_RETRIES',
  'ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS',
  'ORCHESTRATOR_SERVICE_NAME',
  'ORCHESTRATOR_LOG_LEVEL',
  'AFTERBUY_JV_LOGIN',
  'AFTERBUY_JV_PASS',
  'AFTERBUY_XL_LOGIN',
  'AFTERBUY_XL_PASS',
  'AFTERBUY_JV_LOGIN_URL',
  'AFTERBUY_XL_LOGIN_URL',
  'AFTERBUY_JV_COOKIE_CACHE_FILE',
  'AFTERBUY_XL_COOKIE_CACHE_FILE',
  'BACKEND_UPLOAD_STORAGE_BACKEND'
)

$ftpRequiredKeys = @(
  'BACKEND_UPLOAD_FTP_HOST',
  'BACKEND_UPLOAD_FTP_USER',
  'BACKEND_UPLOAD_FTP_PASS',
  'BACKEND_UPLOAD_FTP_PORT',
  'BACKEND_UPLOAD_FTP_ROOT_DIR',
  'BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR',
  'BACKEND_UPLOAD_FTP_AVATAR_DIR',
  'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL'
)

$optionalPresentKeys = @(
  'BACKEND_STAGE_SENTRY_DSN'
)

$sampleRateKeys = @(
  'BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE',
  'FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE',
  'FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE',
  'FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE'
)

$portKeys = @(
  'STAGE_GATEWAY_PORT',
  'STAGE_SMTP_PORT',
  'BACKEND_UPLOAD_FTP_PORT'
)

$booleanKeys = @(
  'STAGE_SMTP_INSECURE',
  'STAGE_PASSWORD_RESET_LOG_CODES',
  'STAGE_RUN_MIGRATIONS_ON_STARTUP'
)

$integerKeys = @(
  'STAGE_PASSWORD_RESET_CODE_TTL_MINUTES',
  'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS',
  'ORCHESTRATOR_HTTP_RETRIES',
  'ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS'
)

$runtimePlaceholderMarkers = @(
  'CHANGE_ME',
  '__SET_OUTSIDE_GIT__',
  'TODO',
  'TODO_UNKNOWN',
  'TODO_SECRET'
)

function ConvertTo-ComparableValue {
  param([string]$Value)

  $trimmed = $Value.Trim()
  if (($trimmed.Length -ge 2) -and (
      (($trimmed.StartsWith('"')) -and ($trimmed.EndsWith('"'))) -or
      (($trimmed.StartsWith("'")) -and ($trimmed.EndsWith("'")))
    )) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function Test-ContainsRuntimePlaceholder {
  param([string]$Value)

  foreach ($marker in $runtimePlaceholderMarkers) {
    if ($Value.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }

  return $false
}

function Add-Finding {
  param(
    [System.Collections.Generic.List[string]]$Findings,
    [string]$Message
  )

  [void]$Findings.Add($Message)
}

$findings = [System.Collections.Generic.List[string]]::new()
$values = @{}
$lineNumbers = @{}
$firstLineNumbers = @{}

$content = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $EnvFile))
$lines = [System.Text.RegularExpressions.Regex]::Split($content, "`r`n|`n|`r")

for ($index = 0; $index -lt $lines.Count; $index++) {
  $lineNumber = $index + 1
  $line = $lines[$index]

  if ($lineNumber -eq 1) {
    $line = $line.TrimStart([char]0xFEFF)
  }

  if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') {
    continue
  }

  if ($line -notmatch '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
    Add-Finding $findings "Malformed env line at line $lineNumber."
    continue
  }

  $key = $matches.key
  $value = $matches.value

  if ($values.ContainsKey($key)) {
    Add-Finding $findings "Duplicate key $key on line $lineNumber; first defined on line $($firstLineNumbers[$key])."
    continue
  }

  $values[$key] = $value
  $lineNumbers[$key] = $lineNumber
  $firstLineNumbers[$key] = $lineNumber
}

$requiredKeys = [System.Collections.Generic.List[string]]::new()
foreach ($key in $stageRequiredKeys) {
  [void]$requiredKeys.Add($key)
}

if ($values.ContainsKey('BACKEND_UPLOAD_STORAGE_BACKEND')) {
  $storageBackend = ConvertTo-ComparableValue $values['BACKEND_UPLOAD_STORAGE_BACKEND']
  if ($storageBackend -eq 'ftp') {
    foreach ($key in $ftpRequiredKeys) {
      [void]$requiredKeys.Add($key)
    }
  }
}

foreach ($key in $optionalPresentKeys) {
  if ($InputKind -eq 'Template' -and -not $values.ContainsKey($key)) {
    Add-Finding $findings "Missing required env key $key."
  }
}

foreach ($key in $requiredKeys) {
  if (-not $values.ContainsKey($key)) {
    Add-Finding $findings "Missing required env key $key."
    continue
  }

  $comparableValue = ConvertTo-ComparableValue $values[$key]
  if ([string]::IsNullOrWhiteSpace($comparableValue)) {
    Add-Finding $findings "Required env key $key is empty on line $($lineNumbers[$key])."
    continue
  }

  if ($InputKind -eq 'Runtime' -and (Test-ContainsRuntimePlaceholder $comparableValue)) {
    Add-Finding $findings "Required env key $key contains a placeholder marker on line $($lineNumbers[$key]); runtime values must be concrete."
  }
}

foreach ($key in $optionalPresentKeys) {
  if ($InputKind -ne 'Runtime' -or -not $values.ContainsKey($key)) {
    continue
  }

  $comparableValue = ConvertTo-ComparableValue $values[$key]
  if (-not [string]::IsNullOrWhiteSpace($comparableValue) -and (Test-ContainsRuntimePlaceholder $comparableValue)) {
    Add-Finding $findings "Optional env key $key contains a placeholder marker on line $($lineNumbers[$key]); runtime values must be concrete when present."
  }
}

foreach ($key in $sampleRateKeys) {
  if (-not $values.ContainsKey($key)) {
    continue
  }

  $sampleRate = ConvertTo-ComparableValue $values[$key]
  $parsed = 0.0
  if ([string]::IsNullOrWhiteSpace($sampleRate) -or -not [double]::TryParse(
      $sampleRate,
      [System.Globalization.NumberStyles]::Float,
      [System.Globalization.CultureInfo]::InvariantCulture,
      [ref]$parsed
    )) {
    Add-Finding $findings "Env key $key must be a valid float on line $($lineNumbers[$key])."
    continue
  }

  if ($parsed -lt 0.0 -or $parsed -gt 1.0) {
    Add-Finding $findings "Env key $key must be a float from 0 to 1 on line $($lineNumbers[$key])."
  }
}

foreach ($key in $portKeys) {
  if (-not $values.ContainsKey($key)) {
    continue
  }

  $port = ConvertTo-ComparableValue $values[$key]
  $parsed = 0
  if (-not [int]::TryParse($port, [ref]$parsed) -or $parsed -lt 1 -or $parsed -gt 65535) {
    Add-Finding $findings "Env key $key must be an integer port from 1 to 65535 on line $($lineNumbers[$key])."
  }
}

foreach ($key in $booleanKeys) {
  if (-not $values.ContainsKey($key)) {
    continue
  }

  $boolean = (ConvertTo-ComparableValue $values[$key]).ToLowerInvariant()
  if ($boolean -notin @('true', 'false', '1', '0')) {
    Add-Finding $findings "Env key $key must be a boolean true/false/1/0 on line $($lineNumbers[$key])."
  }
}

foreach ($key in $integerKeys) {
  if (-not $values.ContainsKey($key)) {
    continue
  }

  $integer = ConvertTo-ComparableValue $values[$key]
  $parsed = 0
  if (-not [int]::TryParse($integer, [ref]$parsed) -or $parsed -lt 0) {
    Add-Finding $findings "Env key $key must be a non-negative integer on line $($lineNumbers[$key])."
  }
}

if ($findings.Count -gt 0) {
  [Console]::Error.WriteLine("Required env validation failed for $Environment $InputKind env file: $EnvFile")
  foreach ($finding in $findings) {
    [Console]::Error.WriteLine("- $finding")
  }
  exit 1
}

Write-Host "Required env validation passed for $Environment $InputKind env file: $EnvFile"

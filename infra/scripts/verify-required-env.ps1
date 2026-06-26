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

$requiredKeysByEnvironment = @{
  stage = @(
    'BACKEND_IMAGE','BACKEND_STAGE_TAG','FRONTEND_IMAGE','FRONTEND_STAGE_TAG','GATEWAY_IMAGE','GATEWAY_STAGE_TAG',
    'MOBILE_IMAGE','MOBILE_STAGE_TAG','SERVICES_IMAGE','SERVICES_STAGE_TAG','ORCHESTRATOR_IMAGE','ORCHESTRATOR_STAGE_TAG',
    'STAGE_DOMAIN','STAGE_GATEWAY_PORT','STAGE_PUBLIC_API_BASE_URL','STAGE_PUBLIC_SERVICES_API_BASE_URL',
    'STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL','STAGE_POSTGRES_DB','STAGE_POSTGRES_USER','STAGE_POSTGRES_PASSWORD',
    'STAGE_SMTP_HOST','STAGE_SMTP_PORT','STAGE_SMTP_USERNAME','STAGE_SMTP_PASSWORD','STAGE_SMTP_FROM',
    'STAGE_SMTP_INSECURE','STAGE_PASSWORD_RESET_CODE_TTL_MINUTES','STAGE_PASSWORD_RESET_LOG_CODES',
    'SERVICES_SECRET_KEY','STAGE_RUN_MIGRATIONS_ON_STARTUP','STAGE_SERVICES_ALLOWED_HOSTS',
    'STAGE_BACKEND_AUTH_BASE_URL','STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS','STAGE_ORCHESTRATOR_SERVICE_AUTH_TOKEN',
    'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS','STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL',
    'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS','ORCHESTRATOR_HTTP_RETRIES','ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS',
    'ORCHESTRATOR_SERVICE_NAME','ORCHESTRATOR_LOG_LEVEL','JV_SOURCE_DB_HOST','JV_SOURCE_DB_USER','JV_SOURCE_DB_PASSWORD',
    'JV_SOURCE_DB_NAME','JV_SOURCE_DB_PORT','JV_SOURCE_DB_CONNECT_RETRIES','JV_SOURCE_DB_PUSH_RETRIES',
    'JV_SOURCE_DB_CONNECT_TIMEOUT_SEC','JV_SOURCE_DB_READ_TIMEOUT_SEC','JV_SOURCE_DB_WRITE_TIMEOUT_SEC',
    'JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC','JV_SOURCE_DB_PUSH_RETRY_SLEEP_SEC','JV_SOURCE_JV_DE_DB_HOST',
    'JV_SOURCE_JV_DE_DB_USER','JV_SOURCE_JV_DE_DB_PASSWORD','JV_SOURCE_JV_DE_DB_NAME','JV_SOURCE_JV_DE_DB_PORT',
    'JV_SOURCE_JV_AT_DB_HOST','JV_SOURCE_JV_AT_DB_USER','JV_SOURCE_JV_AT_DB_PASSWORD','JV_SOURCE_JV_AT_DB_NAME',
    'JV_SOURCE_JV_AT_DB_PORT','JV_SOURCE_JV_CH_DB_HOST','JV_SOURCE_JV_CH_DB_USER','JV_SOURCE_JV_CH_DB_PASSWORD',
    'JV_SOURCE_JV_CH_DB_NAME','JV_SOURCE_JV_CH_DB_PORT','JV_SOURCE_JV_CO_UK_DB_HOST','JV_SOURCE_JV_CO_UK_DB_USER',
    'JV_SOURCE_JV_CO_UK_DB_PASSWORD','JV_SOURCE_JV_CO_UK_DB_NAME','JV_SOURCE_JV_CO_UK_DB_PORT',
    'AFTERBUY_JV_LOGIN','AFTERBUY_JV_PASS','AFTERBUY_XL_LOGIN','AFTERBUY_XL_PASS','AFTERBUY_CH_LOGIN',
    'AFTERBUY_CH_PASS','AFTERBUY_JV_LOGIN_URL','AFTERBUY_XL_LOGIN_URL','AFTERBUY_CH_LOGIN_URL',
    'AFTERBUY_JV_COOKIE_CACHE_FILE','AFTERBUY_XL_COOKIE_CACHE_FILE','AFTERBUY_CH_COOKIE_CACHE_FILE',
    'BACKEND_UPLOAD_STORAGE_BACKEND','BACKEND_UPLOAD_FTP_HOST','BACKEND_UPLOAD_FTP_USER','BACKEND_UPLOAD_FTP_PASS',
    'BACKEND_UPLOAD_FTP_PORT','BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR','BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR',
    'BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR','BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR','BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL'
  )
  prod = @(
    'BACKEND_IMAGE','BACKEND_APP_VERSION','FRONTEND_IMAGE','FRONTEND_APP_VERSION','GATEWAY_IMAGE','GATEWAY_PROD_TAG',
    'MOBILE_IMAGE','MOBILE_APP_VERSION','SERVICES_IMAGE','SERVICES_APP_VERSION','ORCHESTRATOR_IMAGE',
    'ORCHESTRATOR_APP_VERSION','PROD_GATEWAY_PORT','PROD_PUBLIC_API_BASE_URL','PROD_PUBLIC_SERVICES_API_BASE_URL',
    'PROD_POSTGRES_DB','PROD_POSTGRES_USER','PROD_POSTGRES_PASSWORD','PROD_SMTP_HOST','PROD_SMTP_PORT',
    'PROD_SMTP_USERNAME','PROD_SMTP_PASSWORD','PROD_SMTP_FROM','PROD_SMTP_INSECURE',
    'PROD_PASSWORD_RESET_CODE_TTL_MINUTES','PROD_PASSWORD_RESET_LOG_CODES','SERVICES_SECRET_KEY',
    'PROD_RUN_MIGRATIONS_ON_STARTUP','PROD_SERVICES_ALLOWED_HOSTS','PROD_BACKEND_AUTH_BASE_URL',
    'PROD_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS','PROD_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL',
    'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS','ORCHESTRATOR_HTTP_RETRIES','ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS',
    'ORCHESTRATOR_SERVICE_NAME','ORCHESTRATOR_LOG_LEVEL','AFTERBUY_JV_LOGIN','AFTERBUY_JV_PASS',
    'AFTERBUY_XL_LOGIN','AFTERBUY_XL_PASS','AFTERBUY_CH_LOGIN','AFTERBUY_CH_PASS',
    'AFTERBUY_JV_LOGIN_URL','AFTERBUY_XL_LOGIN_URL','AFTERBUY_CH_LOGIN_URL',
    'AFTERBUY_JV_COOKIE_CACHE_FILE','AFTERBUY_XL_COOKIE_CACHE_FILE','AFTERBUY_CH_COOKIE_CACHE_FILE',
    'BACKEND_UPLOAD_STORAGE_BACKEND',
    'BACKEND_UPLOAD_FTP_HOST','BACKEND_UPLOAD_FTP_USER','BACKEND_UPLOAD_FTP_PASS','BACKEND_UPLOAD_FTP_PORT',
    'BACKEND_PROD_UPLOAD_FTP_ROOT_DIR','BACKEND_PROD_UPLOAD_FTP_STORAGE_ROOT_DIR','BACKEND_PROD_UPLOAD_FTP_AVATAR_DIR',
    'BACKEND_PROD_UPLOAD_FTP_IMAGE_DIR','BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL'
  )
}

$optionalPresentKeysByEnvironment = @{
  stage = @(
    'BACKEND_STAGE_SENTRY_DSN','BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE',
    'FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE','FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE'
  )
  prod = @(
    'BACKEND_PROD_SENTRY_DSN','BACKEND_PROD_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_PROD_SENTRY_TRACES_SAMPLE_RATE',
    'FRONTEND_PROD_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE','FRONTEND_PROD_SENTRY_REPLAYS_SESSION_SAMPLE_RATE'
  )
}

$optionalEmptyKeysByEnvironment = @{
  stage = @('MOBILE_STAGE_APP_VERSION','MOBILE_STAGE_APK_URL','JV_SOURCE_JV_DE_DB_PREFIX','JV_SOURCE_JV_AT_DB_PREFIX','JV_SOURCE_JV_CH_DB_PREFIX','JV_SOURCE_JV_CO_UK_DB_PREFIX')
  prod = @('MOBILE_STAGE_APP_VERSION','MOBILE_STAGE_APK_URL','MOBILE_PROD_APP_VERSION','MOBILE_PROD_APK_URL')
}

$sampleRateKeysByEnvironment = @{
  stage = @('BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE','FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE')
  prod = @('BACKEND_PROD_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_PROD_SENTRY_TRACES_SAMPLE_RATE','FRONTEND_PROD_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE','FRONTEND_PROD_SENTRY_REPLAYS_SESSION_SAMPLE_RATE')
}

$portKeysByEnvironment = @{
  stage = @('STAGE_GATEWAY_PORT','STAGE_SMTP_PORT','BACKEND_UPLOAD_FTP_PORT','JV_SOURCE_DB_PORT','JV_SOURCE_JV_DE_DB_PORT','JV_SOURCE_JV_AT_DB_PORT','JV_SOURCE_JV_CH_DB_PORT','JV_SOURCE_JV_CO_UK_DB_PORT')
  prod = @('PROD_GATEWAY_PORT','PROD_SMTP_PORT','BACKEND_UPLOAD_FTP_PORT')
}

$booleanKeysByEnvironment = @{
  stage = @('STAGE_SMTP_INSECURE','STAGE_PASSWORD_RESET_LOG_CODES','STAGE_RUN_MIGRATIONS_ON_STARTUP')
  prod = @('PROD_SMTP_INSECURE','PROD_PASSWORD_RESET_LOG_CODES','PROD_RUN_MIGRATIONS_ON_STARTUP')
}

$integerKeysByEnvironment = @{
  stage = @('STAGE_PASSWORD_RESET_CODE_TTL_MINUTES','ORCHESTRATOR_HTTP_TIMEOUT_SECONDS','ORCHESTRATOR_HTTP_RETRIES','ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS','JV_SOURCE_DB_CONNECT_RETRIES','JV_SOURCE_DB_PUSH_RETRIES','JV_SOURCE_DB_CONNECT_TIMEOUT_SEC','JV_SOURCE_DB_READ_TIMEOUT_SEC','JV_SOURCE_DB_WRITE_TIMEOUT_SEC','JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC','JV_SOURCE_DB_PUSH_RETRY_SLEEP_SEC')
  prod = @('PROD_PASSWORD_RESET_CODE_TTL_MINUTES','ORCHESTRATOR_HTTP_TIMEOUT_SECONDS','ORCHESTRATOR_HTTP_RETRIES','ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS')
}

$containsRequirementsByEnvironment = @{
  stage = @(
    @{ Key = 'STAGE_SERVICES_ALLOWED_HOSTS'; RequiredValue = 'services' },
    @{ Key = 'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS'; RequiredValue = 'services' }
  )
  prod = @(
    @{ Key = 'PROD_SERVICES_ALLOWED_HOSTS'; RequiredValue = 'services' }
  )
}

$composePathByEnvironment = @{
  stage = Join-Path $PSScriptRoot '..\deploy\stage\docker-compose.yml'
  prod = Join-Path $PSScriptRoot '..\deploy\prod\docker-compose.yml'
}

$conditionallyRequiredKeySets = @()
$stageComposeExternalKeys = @()

$requiredKeysForEnvironment = $requiredKeysByEnvironment[$Environment]
$optionalPresentKeys = $optionalPresentKeysByEnvironment[$Environment]
$optionalEmptyKeys = $optionalEmptyKeysByEnvironment[$Environment]
$sampleRateKeys = $sampleRateKeysByEnvironment[$Environment]
$portKeys = $portKeysByEnvironment[$Environment]
$booleanKeys = $booleanKeysByEnvironment[$Environment]
$integerKeys = $integerKeysByEnvironment[$Environment]
$containsRequirements = $containsRequirementsByEnvironment[$Environment]

$runtimePlaceholderMarkers = @(
  'CHANGE_ME',
  '__SET_OUTSIDE_GIT__',
  '__SET_IN_GITHUB_ENVIRONMENT__',
  '**SET_OUTSIDE_GIT**',
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

function Get-EnvEntries {
  param(
    [string[]]$Lines,
    [System.Collections.Generic.List[string]]$Findings
  )

  $values = @{}
  $lineNumbers = @{}
  $firstLineNumbers = @{}

  for ($index = 0; $index -lt $Lines.Count; $index++) {
    $lineNumber = $index + 1
    $line = $Lines[$index]

    if ($lineNumber -eq 1) {
      $line = $line.TrimStart([char]0xFEFF)
    }

    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') {
      continue
    }

    if ($line -notmatch '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      if ($null -ne $Findings) {
        Add-Finding $Findings "Malformed env line at line $lineNumber."
      }
      continue
    }

    $key = $matches.key
    $value = $matches.value

    if ($values.ContainsKey($key)) {
      if ($null -ne $Findings) {
        Add-Finding $Findings "Duplicate key $key on line $lineNumber; first defined on line $($firstLineNumbers[$key])."
      }
      continue
    }

    $values[$key] = $value
    $lineNumbers[$key] = $lineNumber
    $firstLineNumbers[$key] = $lineNumber
  }

  return @{
    Values = $values
    LineNumbers = $lineNumbers
  }
}

function Get-StageComposeReferencedKeys {
  param([string]$ComposePath)

  $content = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $ComposePath))
  $matches = [System.Text.RegularExpressions.Regex]::Matches(
    $content,
    '(?<!\$)\$\{(?<key>[A-Z0-9_]+)(?::[-?][^}]*)?\}'
  )

  $keys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  foreach ($match in $matches) {
    $key = $match.Groups['key'].Value
    if ($key) {
      [void]$keys.Add($key)
    }
  }

  return $keys
}

$findings = [System.Collections.Generic.List[string]]::new()
$content = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $EnvFile))
$lines = [System.Text.RegularExpressions.Regex]::Split($content, "`r`n|`n|`r")
$parsedEnv = Get-EnvEntries -Lines $lines -Findings $findings
$values = $parsedEnv.Values
$lineNumbers = $parsedEnv.LineNumbers

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$composePath = $composePathByEnvironment[$Environment]
$composeReferencedKeys = Get-StageComposeReferencedKeys -ComposePath $composePath

$validatorCoveredKeys = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
foreach ($key in $requiredKeysForEnvironment + $optionalPresentKeys + $optionalEmptyKeys) {
  [void]$validatorCoveredKeys.Add($key)
}
foreach ($conditionalSet in $conditionallyRequiredKeySets) {
  foreach ($key in $conditionalSet.RequiredKeys) {
    [void]$validatorCoveredKeys.Add($key)
  }
}

foreach ($key in $composeReferencedKeys) {
  if ($stageComposeExternalKeys -contains $key) {
    continue
  }

  if (-not $validatorCoveredKeys.Contains($key)) {
    Add-Finding $findings "$Environment compose references env key $key, but verify-required-env.ps1 does not classify it."
  }
}

if ($InputKind -eq 'Template') {
  foreach ($key in $composeReferencedKeys) {
    if ($stageComposeExternalKeys -contains $key) {
      continue
    }

    if (-not $values.ContainsKey($key)) {
      Add-Finding $findings "$Environment compose references env key $key, but the template does not define it."
    }
  }
}

$requiredKeys = [System.Collections.Generic.List[string]]::new()
foreach ($key in $requiredKeysForEnvironment) {
  [void]$requiredKeys.Add($key)
}

foreach ($conditionalSet in $conditionallyRequiredKeySets) {
  if (-not $values.ContainsKey($conditionalSet.TriggerKey)) {
    continue
  }

  $triggerValue = ConvertTo-ComparableValue $values[$conditionalSet.TriggerKey]
  if ($conditionalSet.TriggerValues -contains $triggerValue) {
    foreach ($key in $conditionalSet.RequiredKeys) {
      [void]$requiredKeys.Add($key)
    }
  }
}

foreach ($key in $optionalPresentKeys) {
  if ($InputKind -eq 'Template' -and -not $values.ContainsKey($key)) {
    Add-Finding $findings "Missing required env key $key."
  }
}

foreach ($key in $optionalEmptyKeys) {
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

foreach ($key in $optionalPresentKeys + $optionalEmptyKeys) {
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

foreach ($requirement in $containsRequirements) {
  $key = $requirement.Key
  if (-not $values.ContainsKey($key)) {
    continue
  }

  $actualValues = @(
    (ConvertTo-ComparableValue $values[$key]).Split(',') |
      ForEach-Object { $_.Trim().ToLowerInvariant() } |
      Where-Object { $_ }
  )

  if ($actualValues -notcontains $requirement.RequiredValue.ToLowerInvariant()) {
    Add-Finding $findings "Env key $key must contain '$($requirement.RequiredValue)' on line $($lineNumbers[$key])."
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

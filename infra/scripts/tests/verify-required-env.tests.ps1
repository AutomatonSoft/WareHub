$ErrorActionPreference = 'Stop'

$validator = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\verify-required-env.ps1'))
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) {
  $pwsh = $pwshCommand.Source
} else {
  $pwsh = (Get-Command powershell -ErrorAction Stop).Source
}
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("warehub-env-validator-tests-" + [guid]::NewGuid().ToString('N'))
$script:failures = [System.Collections.Generic.List[string]]::new()

function New-ValidStageEnvLines {
  return @(
    '# Fixture only. Values are placeholders.',
    'export BACKEND_IMAGE=ghcr.io/ravilkadev0/warehub/backend',
    'BACKEND_STAGE_TAG=stage-test',
    'FRONTEND_IMAGE=ghcr.io/ravilkadev0/warehub/frontend',
    'FRONTEND_STAGE_TAG=stage-test',
    'GATEWAY_IMAGE=ghcr.io/ravilkadev0/warehub/gateway',
    'GATEWAY_STAGE_TAG=stage-test',
    'MOBILE_IMAGE=ghcr.io/ravilkadev0/warehub/mobile',
    'MOBILE_STAGE_TAG=stage-test',
    'SERVICES_IMAGE=ghcr.io/ravilkadev0/warehub/services',
    'SERVICES_STAGE_TAG=stage-test',
    'ORCHESTRATOR_IMAGE=ghcr.io/ravilkadev0/warehub/orchestrator',
    'ORCHESTRATOR_STAGE_TAG=stage-test',
    'STAGE_DOMAIN=stage.example.test',
    'STAGE_GATEWAY_PORT=8940',
    'STAGE_PUBLIC_API_BASE_URL=https://stage.example.test/api/v1',
    'STAGE_PUBLIC_SERVICES_API_BASE_URL=https://stage.example.test/api/v1/services',
    'STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=https://stage.example.test/api/v1/orchestrator',
    'STAGE_POSTGRES_DB=warehub_stage',
    'STAGE_POSTGRES_USER=warehub_stage',
    'STAGE_POSTGRES_PASSWORD=placeholder-secret',
    'STAGE_SMTP_HOST=smtp.example.test',
    'STAGE_SMTP_PORT=587',
    'STAGE_SMTP_USERNAME=mailbox@example.test',
    'STAGE_SMTP_PASSWORD=placeholder-secret',
    'STAGE_SMTP_FROM=no-reply@example.test',
    'STAGE_SMTP_INSECURE=false',
    'STAGE_PASSWORD_RESET_CODE_TTL_MINUTES=10',
    'STAGE_PASSWORD_RESET_LOG_CODES=false',
    'SERVICES_SECRET_KEY=placeholder-secret',
    'STAGE_RUN_MIGRATIONS_ON_STARTUP=false',
    'STAGE_SERVICES_ALLOWED_HOSTS=stage.example.test,services,localhost,127.0.0.1',
    'STAGE_BACKEND_AUTH_BASE_URL=http://backend:8932/api/v1',
    'STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=stage.example.test,localhost,127.0.0.1',
    'STAGE_ORCHESTRATOR_SERVICE_AUTH_TOKEN=placeholder-secret',
    'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=services,localhost,127.0.0.1',
    'STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=http://services:8000',
    'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=8',
    'ORCHESTRATOR_HTTP_RETRIES=2',
    'ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=86400',
    'ORCHESTRATOR_SERVICE_NAME=sb-sofort-orchestrator-service',
    'ORCHESTRATOR_LOG_LEVEL=INFO',
    'JV_SOURCE_DB_HOST=source.example.test',
    'JV_SOURCE_DB_USER=source-user',
    'JV_SOURCE_DB_PASSWORD=placeholder-secret',
    'JV_SOURCE_DB_NAME=source_database',
    'JV_SOURCE_DB_PORT=3306',
    'JV_SOURCE_DB_CONNECT_RETRIES=3',
    'JV_SOURCE_DB_PUSH_RETRIES=3',
    'JV_SOURCE_DB_CONNECT_TIMEOUT_SEC=8',
    'JV_SOURCE_DB_READ_TIMEOUT_SEC=25',
    'JV_SOURCE_DB_WRITE_TIMEOUT_SEC=25',
    'JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC=1',
    'JV_SOURCE_DB_PUSH_RETRY_SLEEP_SEC=2',
    'JV_SOURCE_JV_DE_DB_HOST=jv-de.example.test',
    'JV_SOURCE_JV_DE_DB_USER=jv-de-user',
    'JV_SOURCE_JV_DE_DB_PASSWORD=placeholder-secret',
    'JV_SOURCE_JV_DE_DB_NAME=jv_de_database',
    'JV_SOURCE_JV_DE_DB_PORT=3306',
    'JV_SOURCE_JV_DE_DB_PREFIX=',
    'JV_SOURCE_JV_AT_DB_HOST=jv-at.example.test',
    'JV_SOURCE_JV_AT_DB_USER=jv-at-user',
    'JV_SOURCE_JV_AT_DB_PASSWORD=placeholder-secret',
    'JV_SOURCE_JV_AT_DB_NAME=jv_at_database',
    'JV_SOURCE_JV_AT_DB_PORT=3306',
    'JV_SOURCE_JV_AT_DB_PREFIX=',
    'JV_SOURCE_JV_CH_DB_HOST=jv-ch.example.test',
    'JV_SOURCE_JV_CH_DB_USER=jv-ch-user',
    'JV_SOURCE_JV_CH_DB_PASSWORD=placeholder-secret',
    'JV_SOURCE_JV_CH_DB_NAME=jv_ch_database',
    'JV_SOURCE_JV_CH_DB_PORT=3306',
    'JV_SOURCE_JV_CH_DB_PREFIX=',
    'JV_SOURCE_JV_CO_UK_DB_HOST=jv-co-uk.example.test',
    'JV_SOURCE_JV_CO_UK_DB_USER=jv-co-uk-user',
    'JV_SOURCE_JV_CO_UK_DB_PASSWORD=placeholder-secret',
    'JV_SOURCE_JV_CO_UK_DB_NAME=jv_co_uk_database',
    'JV_SOURCE_JV_CO_UK_DB_PORT=3306',
    'JV_SOURCE_JV_CO_UK_DB_PREFIX=',
    'AFTERBUY_JV_LOGIN=placeholder-user',
    'AFTERBUY_JV_PASS=placeholder-secret',
    'AFTERBUY_XL_LOGIN=placeholder-user',
    'AFTERBUY_XL_PASS=placeholder-secret',
    'AFTERBUY_CH_LOGIN=placeholder-user',
    'AFTERBUY_CH_PASS=placeholder-secret',
    'AFTERBUY_JV_LOGIN_URL=https://example.test/jv/login',
    'AFTERBUY_XL_LOGIN_URL=https://example.test/xl/login',
    'AFTERBUY_CH_LOGIN_URL=https://example.test/ch/login',
    'AFTERBUY_JV_COOKIE_CACHE_FILE=/tmp/afterbuy-jv-cookie-cache.json',
    'AFTERBUY_XL_COOKIE_CACHE_FILE=/tmp/afterbuy-xl-cookie-cache.json',
    'AFTERBUY_CH_COOKIE_CACHE_FILE=/tmp/afterbuy-ch-cookie-cache.json',
    'BACKEND_UPLOAD_STORAGE_BACKEND=ftp',
    'BACKEND_UPLOAD_FTP_HOST=ftp.example.test',
    'BACKEND_UPLOAD_FTP_USER=placeholder-user',
    'BACKEND_UPLOAD_FTP_PASS=placeholder-secret',
    'BACKEND_UPLOAD_FTP_PORT=21',
    'BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR=warehub/stage',
    'BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR=storage/stage',
    'BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR=avatar',
    'BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR=images',
    'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL=https://stage.example.test/uploads',
    'FTP_DE_HOST=',
    'FTP_DE_USER=',
    'FTP_DE_PASS=',
    'FTP_DE_PORT=',
    'FTP_DE_URL=',
    'FTP_DE_DOMIN=',
    'FTP_AT_HOST=',
    'FTP_AT_USER=',
    'FTP_AT_PASS=',
    'FTP_AT_PORT=',
    'FTP_AT_URL=',
    'FTP_AT_DOMIN=',
    'FTP_CH_HOST=',
    'FTP_CH_USER=',
    'FTP_CH_PASS=',
    'FTP_CH_PORT=',
    'FTP_CH_URL=',
    'FTP_CH_DOMIN=',
    'FTP_CO_UK_HOST=',
    'FTP_CO_UK_USER=',
    'FTP_CO_UK_PASS=',
    'FTP_CO_UK_PORT=',
    'FTP_CO_UK_URL=',
    'FTP_CO_UK_DOMIN=',
    'OPENAI_API_KEY=',
    'OPENAI_TRANSLATION_MODEL=',
    'ALLOWED_HOSTS_EXTRA=',
    'TELEGRAM_BOT_TOKEN=',
    'TELEGRAM_CHAT_ID=',
    'TELEGRAM_WEBHOOK_SECRET=',
    'TELEGRAM_WEBHOOK_PATH=',
    'BACKEND_STAGE_SENTRY_DSN=',
    'BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'MOBILE_STAGE_APP_VERSION=',
    'MOBILE_STAGE_APK_URL=',
    'NEXT_PUBLIC_SENTRY_DSN=',
    'FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1.0',
    'FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.0',
    'SERVICES_STAGE_SENTRY_DSN=',
    'SERVICES_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'ORCHESTRATOR_STAGE_SENTRY_DSN=',
    'ORCHESTRATOR_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'SERVICES_LOG_LEVEL=INFO',
    'SERVICES_SERVICE_NAME=warehub-database-service'
  )
}

function New-TemplateStageEnvLines {
  return @(
    '# Template fixture only. Placeholder values are intentional.',
    'BACKEND_IMAGE=ghcr.io/ravilkadev0/warehub/backend',
    'BACKEND_STAGE_TAG=stage-CHANGE_ME',
    'FRONTEND_IMAGE=ghcr.io/ravilkadev0/warehub/frontend',
    'FRONTEND_STAGE_TAG=stage-CHANGE_ME',
    'GATEWAY_IMAGE=ghcr.io/ravilkadev0/warehub/gateway',
    'GATEWAY_STAGE_TAG=stage-CHANGE_ME',
    'MOBILE_IMAGE=ghcr.io/ravilkadev0/warehub/mobile',
    'MOBILE_STAGE_TAG=stage-CHANGE_ME',
    'SERVICES_IMAGE=ghcr.io/ravilkadev0/warehub/services',
    'SERVICES_STAGE_TAG=stage-CHANGE_ME',
    'ORCHESTRATOR_IMAGE=ghcr.io/ravilkadev0/warehub/orchestrator',
    'ORCHESTRATOR_STAGE_TAG=stage-CHANGE_ME',
    'STAGE_DOMAIN=stage.example.test',
    'STAGE_GATEWAY_PORT=8940',
    'STAGE_PUBLIC_API_BASE_URL=https://stage.example.test/api/v1',
    'STAGE_PUBLIC_SERVICES_API_BASE_URL=https://stage.example.test/api/v1/services',
    'STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=https://stage.example.test/api/v1/orchestrator',
    'STAGE_POSTGRES_DB=warehub_stage',
    'STAGE_POSTGRES_USER=warehub_stage',
    'STAGE_POSTGRES_PASSWORD=**SET_OUTSIDE_GIT**',
    'STAGE_SMTP_HOST=**SET_OUTSIDE_GIT**',
    'STAGE_SMTP_PORT=587',
    'STAGE_SMTP_USERNAME=**SET_OUTSIDE_GIT**',
    'STAGE_SMTP_PASSWORD=**SET_OUTSIDE_GIT**',
    'STAGE_SMTP_FROM=no-reply@example.test',
    'STAGE_SMTP_INSECURE=false',
    'STAGE_PASSWORD_RESET_CODE_TTL_MINUTES=10',
    'STAGE_PASSWORD_RESET_LOG_CODES=false',
    'SERVICES_SECRET_KEY=**SET_OUTSIDE_GIT**',
    'STAGE_RUN_MIGRATIONS_ON_STARTUP=false',
    'STAGE_SERVICES_ALLOWED_HOSTS=stage.example.test,services,localhost,127.0.0.1',
    'STAGE_BACKEND_AUTH_BASE_URL=http://backend:8932/api/v1',
    'STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=stage.example.test,localhost,127.0.0.1',
    'STAGE_ORCHESTRATOR_SERVICE_AUTH_TOKEN=**SET_OUTSIDE_GIT**',
    'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=services,localhost,127.0.0.1',
    'STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=http://services:8000',
    'ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=8',
    'ORCHESTRATOR_HTTP_RETRIES=2',
    'ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=86400',
    'ORCHESTRATOR_SERVICE_NAME=sb-sofort-orchestrator-service',
    'ORCHESTRATOR_LOG_LEVEL=INFO',
    'JV_SOURCE_DB_HOST=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_DB_USER=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_DB_PASSWORD=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_DB_NAME=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_DB_PORT=3306',
    'JV_SOURCE_DB_CONNECT_RETRIES=3',
    'JV_SOURCE_DB_PUSH_RETRIES=3',
    'JV_SOURCE_DB_CONNECT_TIMEOUT_SEC=8',
    'JV_SOURCE_DB_READ_TIMEOUT_SEC=25',
    'JV_SOURCE_DB_WRITE_TIMEOUT_SEC=25',
    'JV_SOURCE_DB_CONNECT_RETRY_SLEEP_SEC=1',
    'JV_SOURCE_DB_PUSH_RETRY_SLEEP_SEC=2',
    'JV_SOURCE_JV_DE_DB_HOST=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_DE_DB_USER=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_DE_DB_PASSWORD=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_DE_DB_NAME=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_DE_DB_PORT=3306',
    'JV_SOURCE_JV_DE_DB_PREFIX=',
    'JV_SOURCE_JV_AT_DB_HOST=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_AT_DB_USER=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_AT_DB_PASSWORD=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_AT_DB_NAME=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_AT_DB_PORT=3306',
    'JV_SOURCE_JV_AT_DB_PREFIX=',
    'JV_SOURCE_JV_CH_DB_HOST=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CH_DB_USER=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CH_DB_PASSWORD=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CH_DB_NAME=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CH_DB_PORT=3306',
    'JV_SOURCE_JV_CH_DB_PREFIX=',
    'JV_SOURCE_JV_CO_UK_DB_HOST=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CO_UK_DB_USER=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CO_UK_DB_PASSWORD=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CO_UK_DB_NAME=**SET_OUTSIDE_GIT**',
    'JV_SOURCE_JV_CO_UK_DB_PORT=3306',
    'JV_SOURCE_JV_CO_UK_DB_PREFIX=',
    'AFTERBUY_JV_LOGIN=**SET_OUTSIDE_GIT**',
    'AFTERBUY_JV_PASS=**SET_OUTSIDE_GIT**',
    'AFTERBUY_XL_LOGIN=**SET_OUTSIDE_GIT**',
    'AFTERBUY_XL_PASS=**SET_OUTSIDE_GIT**',
    'AFTERBUY_CH_LOGIN=**SET_OUTSIDE_GIT**',
    'AFTERBUY_CH_PASS=**SET_OUTSIDE_GIT**',
    'AFTERBUY_JV_LOGIN_URL=https://example.test/jv/login',
    'AFTERBUY_XL_LOGIN_URL=https://example.test/xl/login',
    'AFTERBUY_CH_LOGIN_URL=https://example.test/ch/login',
    'AFTERBUY_JV_COOKIE_CACHE_FILE=/tmp/afterbuy-jv-cookie-cache.json',
    'AFTERBUY_XL_COOKIE_CACHE_FILE=/tmp/afterbuy-xl-cookie-cache.json',
    'AFTERBUY_CH_COOKIE_CACHE_FILE=/tmp/afterbuy-ch-cookie-cache.json',
    'BACKEND_UPLOAD_STORAGE_BACKEND=ftp',
    'BACKEND_UPLOAD_FTP_HOST=**SET_OUTSIDE_GIT**',
    'BACKEND_UPLOAD_FTP_USER=**SET_OUTSIDE_GIT**',
    'BACKEND_UPLOAD_FTP_PASS=**SET_OUTSIDE_GIT**',
    'BACKEND_UPLOAD_FTP_PORT=21',
    'BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR=warehub/stage',
    'BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR=storage/stage',
    'BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR=avatar',
    'BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR=images',
    'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL=https://stage.example.test/uploads',
    'FTP_DE_HOST=',
    'FTP_DE_USER=',
    'FTP_DE_PASS=',
    'FTP_DE_PORT=',
    'FTP_DE_URL=',
    'FTP_DE_DOMIN=',
    'FTP_AT_HOST=',
    'FTP_AT_USER=',
    'FTP_AT_PASS=',
    'FTP_AT_PORT=',
    'FTP_AT_URL=',
    'FTP_AT_DOMIN=',
    'FTP_CH_HOST=',
    'FTP_CH_USER=',
    'FTP_CH_PASS=',
    'FTP_CH_PORT=',
    'FTP_CH_URL=',
    'FTP_CH_DOMIN=',
    'FTP_CO_UK_HOST=',
    'FTP_CO_UK_USER=',
    'FTP_CO_UK_PASS=',
    'FTP_CO_UK_PORT=',
    'FTP_CO_UK_URL=',
    'FTP_CO_UK_DOMIN=',
    'OPENAI_API_KEY=',
    'OPENAI_TRANSLATION_MODEL=',
    'ALLOWED_HOSTS_EXTRA=',
    'TELEGRAM_BOT_TOKEN=',
    'TELEGRAM_CHAT_ID=',
    'TELEGRAM_WEBHOOK_SECRET=',
    'TELEGRAM_WEBHOOK_PATH=',
    'BACKEND_STAGE_SENTRY_DSN=',
    'BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'MOBILE_STAGE_APP_VERSION=',
    'MOBILE_STAGE_APK_URL=',
    'NEXT_PUBLIC_SENTRY_DSN=',
    'FRONTEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'FRONTEND_STAGE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE=1.0',
    'FRONTEND_STAGE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE=0.0',
    'SERVICES_STAGE_SENTRY_DSN=',
    'SERVICES_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'ORCHESTRATOR_STAGE_SENTRY_DSN=',
    'ORCHESTRATOR_STAGE_SENTRY_TRACES_SAMPLE_RATE=0.1',
    'SERVICES_LOG_LEVEL=INFO',
    'SERVICES_SERVICE_NAME=warehub-database-service'
  )
}

function Write-Fixture {
  param(
    [string]$Name,
    [string[]]$Lines,
    [string]$LineEnding = "`n",
    [switch]$Utf8Bom
  )

  $path = Join-Path $tempRoot $Name
  $content = ($Lines -join $LineEnding) + $LineEnding
  $encoding = [System.Text.UTF8Encoding]::new([bool]$Utf8Bom)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
  return $path
}

function Invoke-Validator {
  param(
    [string]$Path,
    [ValidateSet('Template', 'Runtime')]
    [string]$InputKind = 'Runtime'
  )

  $stdoutPath = Join-Path $tempRoot ("stdout-" + [guid]::NewGuid().ToString('N') + ".log")
  $stderrPath = Join-Path $tempRoot ("stderr-" + [guid]::NewGuid().ToString('N') + ".log")

  try {
    $process = Start-Process `
      -FilePath $pwsh `
      -ArgumentList @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $validator,
        '-EnvFile', $Path,
        '-Environment', 'stage',
        '-InputKind', $InputKind
      ) `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = if (Test-Path -LiteralPath $stdoutPath) { [System.IO.File]::ReadAllText($stdoutPath) } else { '' }
      Stderr = if (Test-Path -LiteralPath $stderrPath) { [System.IO.File]::ReadAllText($stderrPath) } else { '' }
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-ExitCode {
  param($Result, [int]$Expected)

  if ($Result.ExitCode -ne $Expected) {
    throw "Expected exit code $Expected, got $($Result.ExitCode)."
  }
}

function Test-Case {
  param([string]$Name, [scriptblock]$Body)

  try {
    & $Body
    Write-Host "PASS $Name"
  } catch {
    [void]$script:failures.Add("$Name`: $($_.Exception.Message)")
    Write-Host "FAIL $Name`: $($_.Exception.Message)"
  }
}

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null

  Test-Case 'valid stage fixture' {
    $path = Write-Fixture 'valid.env' (New-ValidStageEnvLines)
    Assert-ExitCode (Invoke-Validator $path) 0
  }

  Test-Case 'missing required key' {
    $lines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^SERVICES_SECRET_KEY=' }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'missing-required.env' $lines)) 1
  }

  Test-Case 'empty value' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^SERVICES_SECRET_KEY=') { 'SERVICES_SECRET_KEY=' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'empty-value.env' $lines)) 1
  }

  Test-Case 'quoted empty value' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^SERVICES_SECRET_KEY=') { 'SERVICES_SECRET_KEY=""' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'quoted-empty-value.env' $lines)) 1
  }

  Test-Case 'duplicate key' {
    $lines = @(New-ValidStageEnvLines) + @('BACKEND_IMAGE=duplicate')
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'duplicate.env' $lines)) 1
  }

  Test-Case 'duplicate through export' {
    $lines = @(New-ValidStageEnvLines) + @('export BACKEND_IMAGE=duplicate')
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'duplicate-export.env' $lines)) 1
  }

  Test-Case 'UTF-8 BOM' {
    $path = Write-Fixture 'bom.env' (New-ValidStageEnvLines) -Utf8Bom
    Assert-ExitCode (Invoke-Validator $path) 0
  }

  Test-Case 'LF and CRLF' {
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'lf.env' (New-ValidStageEnvLines) -LineEnding "`n")) 0
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'crlf.env' (New-ValidStageEnvLines) -LineEnding "`r`n")) 0
  }

  Test-Case 'comments and blank lines' {
    $lines = @('# before', '', '   ', '# another') + (New-ValidStageEnvLines)
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'comments.env' $lines)) 0
  }

  Test-Case 'malformed line' {
    $lines = @(New-ValidStageEnvLines) + @('not a valid env line')
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'malformed.env' $lines)) 1
  }

  Test-Case 'FTP runtime requirements' {
    $lines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^BACKEND_UPLOAD_FTP_HOST=' }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'ftp-missing.env' $lines)) 1

    $nonFtpLines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^BACKEND_UPLOAD_FTP_' -and $_ -notmatch '^BACKEND_STAGE_UPLOAD_FTP_' }
    $nonFtpLines = $nonFtpLines | ForEach-Object {
      if ($_ -match '^BACKEND_UPLOAD_STORAGE_BACKEND=') { 'BACKEND_UPLOAD_STORAGE_BACKEND=local' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'non-ftp.env' $nonFtpLines)) 1
  }

  Test-Case 'secret value is not printed' {
    $secret = 'super-sensitive-stage-secret'
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^SERVICES_SECRET_KEY=') { "SERVICES_SECRET_KEY=$secret" }
      elseif ($_ -match '^STAGE_GATEWAY_PORT=') { 'STAGE_GATEWAY_PORT=not-a-port' }
      else { $_ }
    }

    $result = Invoke-Validator (Write-Fixture 'secret-not-printed.env' $lines)
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -notmatch [regex]::Escape($secret)) 'Secret value was printed.'
  }

  Test-Case 'valid Template fixture with placeholders' {
    $path = Write-Fixture 'template-placeholders.env' (New-TemplateStageEnvLines)
    Assert-ExitCode (Invoke-Validator $path -InputKind Template) 0
  }

  Test-Case 'same Template fixture fails in Runtime' {
    $path = Write-Fixture 'template-as-runtime.env' (New-TemplateStageEnvLines)
    Assert-ExitCode (Invoke-Validator $path -InputKind Runtime) 1
  }

  Test-Case 'Runtime CHANGE_ME placeholder fails' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^AFTERBUY_JV_LOGIN=') { 'AFTERBUY_JV_LOGIN=CHANGE_ME' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-change-me.env' $lines)) 1
  }

  Test-Case 'Runtime SET_OUTSIDE_GIT placeholder fails' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^AFTERBUY_JV_LOGIN=') { 'AFTERBUY_JV_LOGIN=__SET_OUTSIDE_GIT__' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-set-outside-git.env' $lines)) 1
  }

  Test-Case 'Runtime star SET_OUTSIDE_GIT placeholder fails' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^AFTERBUY_JV_LOGIN=') { 'AFTERBUY_JV_LOGIN=**SET_OUTSIDE_GIT**' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-star-set-outside-git.env' $lines)) 1
  }

  Test-Case 'Runtime stage CHANGE_ME placeholder fails' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^BACKEND_STAGE_TAG=') { 'BACKEND_STAGE_TAG=stage-CHANGE_ME' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-stage-change-me.env' $lines)) 1
  }

  Test-Case 'placeholder rejection does not print placeholder value' {
    $placeholder = 'prefix-CHANGE_ME-secret'
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^AFTERBUY_JV_LOGIN=') { "AFTERBUY_JV_LOGIN=$placeholder" } else { $_ }
    }
    $result = Invoke-Validator (Write-Fixture 'runtime-placeholder-redaction.env' $lines)
    Assert-ExitCode $result 1
    Assert-True (-not (($result.Stdout + $result.Stderr).Contains($placeholder))) 'Placeholder value was printed.'
  }

  Test-Case 'Template type-invalid port fails' {
    $lines = New-TemplateStageEnvLines | ForEach-Object {
      if ($_ -match '^JV_SOURCE_JV_DE_DB_PORT=') { 'JV_SOURCE_JV_DE_DB_PORT=not-a-port' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'template-invalid-port.env' $lines) -InputKind Template) 1
  }

  Test-Case 'contains validation requires services host in services allowed hosts' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^STAGE_SERVICES_ALLOWED_HOSTS=') { 'STAGE_SERVICES_ALLOWED_HOSTS=stage.example.test,localhost,127.0.0.1' } else { $_ }
    }
    $result = Invoke-Validator (Write-Fixture 'missing-services-host.env' $lines)
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -match 'STAGE_SERVICES_ALLOWED_HOSTS') 'Missing services host was not reported.'
  }

  Test-Case 'contains validation requires services host in orchestrator allowed hosts' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=') { 'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS=localhost,127.0.0.1' } else { $_ }
    }
    $result = Invoke-Validator (Write-Fixture 'missing-orchestrator-services-host.env' $lines)
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -match 'STAGE_ORCHESTRATOR_SERVICE_ALLOWED_HOSTS') 'Missing orchestrator services host was not reported.'
  }

  Test-Case 'Template non-negative integer validation covers JV source retries' {
    $lines = New-TemplateStageEnvLines | ForEach-Object {
      if ($_ -match '^JV_SOURCE_DB_CONNECT_RETRIES=') { 'JV_SOURCE_DB_CONNECT_RETRIES=-1' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'template-invalid-jv-integer.env' $lines) -InputKind Template) 1
  }

  Test-Case 'Template type-invalid boolean fails' {
    $lines = New-TemplateStageEnvLines | ForEach-Object {
      if ($_ -match '^STAGE_PASSWORD_RESET_LOG_CODES=') { 'STAGE_PASSWORD_RESET_LOG_CODES=maybe' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'template-invalid-boolean.env' $lines) -InputKind Template) 1
  }

  Test-Case 'Template type-invalid sample rate fails' {
    $lines = New-TemplateStageEnvLines | ForEach-Object {
      if ($_ -match '^BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=') { 'BACKEND_STAGE_SENTRY_TRACES_SAMPLE_RATE=2.0' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'template-invalid-sample-rate.env' $lines) -InputKind Template) 1
  }

  Test-Case 'optional Sentry DSN Template empty present passes' {
    $lines = New-TemplateStageEnvLines | ForEach-Object {
      if ($_ -match '^BACKEND_STAGE_SENTRY_DSN=') { 'BACKEND_STAGE_SENTRY_DSN=' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'template-sentry-empty.env' $lines) -InputKind Template) 0
  }

  Test-Case 'Template missing compose-referenced optional-empty key fails' {
    $lines = New-TemplateStageEnvLines | Where-Object { $_ -notmatch '^MOBILE_STAGE_APK_URL=' }
    $result = Invoke-Validator (Write-Fixture 'template-missing-optional-empty.env' $lines) -InputKind Template
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -match 'MOBILE_STAGE_APK_URL') 'Missing compose-referenced optional-empty key was not reported.'
  }

  Test-Case 'optional Sentry DSN Runtime missing passes' {
    $lines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^BACKEND_STAGE_SENTRY_DSN=' }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-sentry-missing.env' $lines) -InputKind Runtime) 0
  }

  Test-Case 'optional Sentry DSN Runtime empty passes' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^BACKEND_STAGE_SENTRY_DSN=') { 'BACKEND_STAGE_SENTRY_DSN=' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-sentry-empty.env' $lines) -InputKind Runtime) 0
  }

  Test-Case 'Runtime requires stage SMTP configuration' {
    $lines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^STAGE_SMTP_HOST=' }
    $result = Invoke-Validator (Write-Fixture 'runtime-missing-stage-smtp.env' $lines) -InputKind Runtime
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -match 'STAGE_SMTP_HOST') 'Missing stage SMTP key was not reported.'
  }

  Test-Case 'Runtime requires Afterbuy credentials' {
    $lines = New-ValidStageEnvLines | Where-Object { $_ -notmatch '^AFTERBUY_JV_LOGIN=' }
    $result = Invoke-Validator (Write-Fixture 'runtime-missing-afterbuy-login.env' $lines) -InputKind Runtime
    Assert-ExitCode $result 1
    Assert-True (($result.Stderr + $result.Stdout) -match 'AFTERBUY_JV_LOGIN') 'Missing Afterbuy key was not reported.'
  }

  Test-Case 'optional Sentry DSN Runtime placeholder nonempty fails' {
    $lines = New-ValidStageEnvLines | ForEach-Object {
      if ($_ -match '^BACKEND_STAGE_SENTRY_DSN=') { 'BACKEND_STAGE_SENTRY_DSN=__SET_OUTSIDE_GIT__' } else { $_ }
    }
    Assert-ExitCode (Invoke-Validator (Write-Fixture 'runtime-sentry-placeholder.env' $lines) -InputKind Runtime) 1
  }
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

if ($script:failures.Count -gt 0) {
  Write-Error "verify-required-env tests failed: $($script:failures.Count)"
  foreach ($failure in $script:failures) {
    Write-Error "- $failure"
  }
  exit 1
}

Write-Host 'verify-required-env tests passed.'

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("frontend", "backend", "services", "orchestrator")]
  [string]$App,

  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,

  [switch]$WithMigrations,

  [string]$LogPath
)

$ErrorActionPreference = "Stop"

$resolvedRepoRoot = (Resolve-Path $RepoRoot).Path
$rootEnvPath = Join-Path $resolvedRepoRoot ".env"

function Get-DotenvValues {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $values = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $values
  }

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
    if (-not ($key -match '^[A-Za-z_][A-Za-z0-9_]*$')) {
      continue
    }

    $value = $line.Substring($separatorIndex + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Set-ProcessEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowEmptyString()][string]$Value
  )

  [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Set-ProcessEnvDefault {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $currentValue = [System.Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($currentValue)) {
    Set-ProcessEnvValue -Name $Name -Value $Value
  }
}

function Import-RootEnv {
  $values = Get-DotenvValues -Path $rootEnvPath
  foreach ($entry in $values.GetEnumerator()) {
    Set-ProcessEnvValue -Name $entry.Key -Value $entry.Value
  }
}

function Initialize-LocalRuntimeEnv {
  $frontendPort = [System.Environment]::GetEnvironmentVariable("DEV_FRONTEND_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($frontendPort)) { $frontendPort = "8931" }

  $backendPort = [System.Environment]::GetEnvironmentVariable("DEV_BACKEND_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($backendPort)) { $backendPort = "8932" }

  $servicesPort = [System.Environment]::GetEnvironmentVariable("DEV_SERVICES_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($servicesPort)) { $servicesPort = "8934" }

  $orchestratorPort = [System.Environment]::GetEnvironmentVariable("DEV_ORCHESTRATOR_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($orchestratorPort)) { $orchestratorPort = "8935" }

  $postgresDb = "warehub"
  $postgresUser = "warehub"
  $postgresPassword = "warehub"
  $postgresHost = "localhost"
  $postgresPort = [System.Environment]::GetEnvironmentVariable("DEV_POSTGRES_PORT", "Process")
  if ([string]::IsNullOrWhiteSpace($postgresPort)) { $postgresPort = "8933" }

  $backendOrigin = "http://localhost:$backendPort"
  $servicesOrigin = "http://localhost:$servicesPort"
  $orchestratorOrigin = "http://localhost:$orchestratorPort"
  $frontendOrigin = "http://localhost:$frontendPort"
  $databaseUrlUser = [uri]::EscapeDataString($postgresUser)
  $databaseUrlPassword = [uri]::EscapeDataString($postgresPassword)
  $databaseUrlDatabase = [uri]::EscapeDataString($postgresDb)
  $databaseUrl = "postgres://$databaseUrlUser`:$databaseUrlPassword@$postgresHost`:$postgresPort/$databaseUrlDatabase"

  Set-ProcessEnvValue -Name "DEV_POSTGRES_DB" -Value $postgresDb
  Set-ProcessEnvValue -Name "DEV_POSTGRES_USER" -Value $postgresUser
  Set-ProcessEnvValue -Name "DEV_POSTGRES_PASSWORD" -Value $postgresPassword
  Set-ProcessEnvValue -Name "DEV_POSTGRES_HOST" -Value $postgresHost
  Set-ProcessEnvValue -Name "DEV_POSTGRES_HOST_PORT" -Value $postgresPort
  Set-ProcessEnvValue -Name "WAREHUB_LOCAL_DEV_ROOT_ENV_ACTIVE" -Value "true"
  Set-ProcessEnvValue -Name "APP_ENV" -Value "dev"
  Set-ProcessEnvValue -Name "APP_PORT" -Value $backendPort
  Set-ProcessEnvValue -Name "PORT" -Value $frontendPort
  Set-ProcessEnvValue -Name "POSTGRES_DB" -Value $postgresDb
  Set-ProcessEnvValue -Name "POSTGRES_USER" -Value $postgresUser
  Set-ProcessEnvValue -Name "POSTGRES_PASSWORD" -Value $postgresPassword
  Set-ProcessEnvValue -Name "POSTGRES_HOST" -Value $postgresHost
  Set-ProcessEnvValue -Name "POSTGRES_PORT" -Value $postgresPort
  Set-ProcessEnvValue -Name "DATABASE_URL" -Value $databaseUrl
  Set-ProcessEnvValue -Name "BACKEND_ORIGIN" -Value $backendOrigin
  Set-ProcessEnvValue -Name "SERVICES_ORIGIN" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "ORCHESTRATOR_ORIGIN" -Value $orchestratorOrigin
  Set-ProcessEnvValue -Name "NEXT_PUBLIC_API_BASE_URL" -Value "$backendOrigin/api/v1"
  Set-ProcessEnvValue -Name "BACKEND_INTERNAL_API_BASE_URL" -Value "http://127.0.0.1:$backendPort/api/v1"
  Set-ProcessEnvValue -Name "BACKEND_API_BASE_URL" -Value "$backendOrigin/api/v1"
  Set-ProcessEnvValue -Name "NEXT_PUBLIC_SERVICES_API_BASE_URL" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "SERVICES_API_BASE_URL" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL" -Value $orchestratorOrigin
  Set-ProcessEnvValue -Name "ORCHESTRATOR_API_BASE_URL" -Value $orchestratorOrigin
  Set-ProcessEnvValue -Name "MOBILE_DEV_API_BASE_URL" -Value "http://127.0.0.1:$backendPort/api/v1"
  Set-ProcessEnvValue -Name "DATABASE_SERVICE_BASE_URL" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "ORCHESTRATOR_HOST" -Value "0.0.0.0"
  Set-ProcessEnvValue -Name "ORCHESTRATOR_PORT" -Value $orchestratorPort

  Set-ProcessEnvDefault -Name "SKIP_DB_MIGRATIONS" -Value "true"
  Set-ProcessEnvDefault -Name "CORS_ALLOW_ORIGINS" -Value "$frontendOrigin,http://127.0.0.1:$frontendPort"
  Set-ProcessEnvDefault -Name "ALLOWED_HOSTS" -Value "127.0.0.1,localhost"
  Set-ProcessEnvDefault -Name "CORS_ALLOWED_ORIGINS" -Value "$frontendOrigin,http://127.0.0.1:$frontendPort"
  Set-ProcessEnvDefault -Name "CSRF_TRUSTED_ORIGINS" -Value "$frontendOrigin,http://127.0.0.1:$frontendPort"
  Set-ProcessEnvDefault -Name "BACKEND_AUTH_BASE_URL" -Value "http://127.0.0.1:$backendPort/api/v1"
  Set-ProcessEnvDefault -Name "BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS" -Value "localhost,127.0.0.1"
  Set-ProcessEnvDefault -Name "NEXT_PUBLIC_APP_ENV" -Value "dev"
}

function Invoke-CommandInDirectory {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Push-Location $WorkingDirectory
  try {
    & $Command
  } finally {
    Pop-Location
  }
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$StartupMessage,
    [Parameter(Mandatory = $true)][scriptblock]$ForegroundCommand,
    [Parameter(Mandatory = $true)][string]$LoggedCommandLine
  )

  if ([string]::IsNullOrWhiteSpace($LogPath)) {
    Write-Host $StartupMessage
    Invoke-CommandInDirectory -WorkingDirectory $WorkingDirectory -Command $ForegroundCommand
    return
  }

  $logDirectory = Split-Path -Parent $LogPath
  if ($logDirectory -and -not (Test-Path -LiteralPath $logDirectory)) {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  }

  Add-Content -LiteralPath $LogPath -Value $StartupMessage
  Invoke-CommandInDirectory -WorkingDirectory $WorkingDirectory -Command {
    $escapedLogPath = $LogPath.Replace('"', '""')
    $commandText = "$LoggedCommandLine >> ""$escapedLogPath"" 2>&1"
    cmd.exe /d /c $commandText
    if ($LASTEXITCODE -ne 0) {
      throw "Command exited with code ${LASTEXITCODE}: $LoggedCommandLine"
    }
  }
}

function Get-SafeEnvSummary {
  param(
    [Parameter(Mandatory = $true)][string[]]$Keys
  )

  $parts = foreach ($key in $Keys) {
    $value = [System.Environment]::GetEnvironmentVariable($key, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
      "${key}=MISSING"
      continue
    }

    if ($key -match 'PORT$' -or $key -eq 'APP_PORT') {
      "${key}=SET"
      continue
    }

    if ($key -match 'URL$' -or $key -match 'ORIGIN$' -or $key -eq 'DATABASE_URL') {
      "${key}=SET"
      continue
    }

    "${key}=SET"
  }

  return ($parts -join "; ")
}

function Get-DatabaseUrlSummary {
  $postgresHost = [System.Environment]::GetEnvironmentVariable("POSTGRES_HOST", "Process")
  $postgresPort = [System.Environment]::GetEnvironmentVariable("POSTGRES_PORT", "Process")
  $databaseUrl = [System.Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    return "DATABASE_URL=MISSING"
  }

  $hostClass = if ($postgresHost -in @("localhost", "127.0.0.1")) { "LOCAL" } else { "NONLOCAL" }
  $targetClass = if ($hostClass -eq "LOCAL" -and $postgresPort -eq "8933") { "LOCAL" } else { "NONLOCAL_OR_UNEXPECTED" }
  $maskedHost = if ([string]::IsNullOrWhiteSpace($postgresHost)) { "<missing-host>" } else { $postgresHost }
  $maskedPort = if ([string]::IsNullOrWhiteSpace($postgresPort)) { "<missing-port>" } else { $postgresPort }
  return "DATABASE_URL=SET; DATABASE_URL_TARGET=$targetClass; DATABASE_URL_HOST=$hostClass; DATABASE_URL_PORT=$maskedPort; DATABASE_URL_MASK=postgres://<user>:***@$maskedHost`:$maskedPort/<db>"
}

Import-RootEnv
Initialize-LocalRuntimeEnv

$databaseServicePythonExe = [System.Environment]::GetEnvironmentVariable("DATABASE_SERVICE_PYTHON_EXE", "Process")
if ([string]::IsNullOrWhiteSpace($databaseServicePythonExe)) {
  $databaseServicePythonExe = "python"
}
$databaseServiceVenvPath = [System.Environment]::GetEnvironmentVariable("DATABASE_SERVICE_VENV_PATH", "Process")

$orchestratorPythonExe = [System.Environment]::GetEnvironmentVariable("ORCHESTRATOR_PYTHON_EXE", "Process")
if ([string]::IsNullOrWhiteSpace($orchestratorPythonExe)) {
  $orchestratorPythonExe = "python"
}
$orchestratorVenvPath = [System.Environment]::GetEnvironmentVariable("ORCHESTRATOR_VENV_PATH", "Process")

switch ($App) {
  "frontend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\frontend"
    $startupMessage = "Starting frontend in $workingDirectory`nEnv: $(Get-SafeEnvSummary -Keys @('PORT','NEXT_PUBLIC_API_BASE_URL','NEXT_PUBLIC_SERVICES_API_BASE_URL','NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL','BACKEND_ORIGIN','SERVICES_ORIGIN'))"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage $startupMessage `
      -ForegroundCommand { npm run dev } `
      -LoggedCommandLine "npm run dev"
  }

  "backend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\backend"
    $startupMessage = "Starting backend in $workingDirectory`nEnv: $(Get-SafeEnvSummary -Keys @('APP_ENV','APP_PORT','DATABASE_URL','CORS_ALLOW_ORIGINS','SMTP_HOST','SMTP_PORT','SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM','SMTP_INSECURE')); $(Get-DatabaseUrlSummary)"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage $startupMessage `
      -ForegroundCommand { cargo run } `
      -LoggedCommandLine "cargo run"
  }

  "services" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\database-service"
    $quotedPython = '"' + $databaseServicePythonExe + '"'
    $loggedCommandLine = if ($WithMigrations) {
      "$quotedPython manage.py migrate && $quotedPython manage.py runserver 0.0.0.0:8934"
    } else {
      "$quotedPython manage.py runserver 0.0.0.0:8934"
    }
    $startupMessage = "Starting database-service in $workingDirectory`nVenv: $databaseServiceVenvPath`nEnv: $(Get-SafeEnvSummary -Keys @('DATABASE_URL','POSTGRES_DB','POSTGRES_USER','POSTGRES_PASSWORD','POSTGRES_HOST','POSTGRES_PORT','ALLOWED_HOSTS','CORS_ALLOWED_ORIGINS','CSRF_TRUSTED_ORIGINS','BACKEND_AUTH_BASE_URL')); $(Get-DatabaseUrlSummary)"

    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage $startupMessage `
      -ForegroundCommand {
        if ($WithMigrations) {
          & $databaseServicePythonExe manage.py migrate
        }
        & $databaseServicePythonExe manage.py runserver 0.0.0.0:8934
      } `
      -LoggedCommandLine $loggedCommandLine
  }

  "orchestrator" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\orchestrator"
    $quotedPython = '"' + $orchestratorPythonExe + '"'
    $startupMessage = "Starting orchestrator in $workingDirectory`nVenv: $orchestratorVenvPath`nEnv: $(Get-SafeEnvSummary -Keys @('DATABASE_SERVICE_BASE_URL','ORCHESTRATOR_HOST','ORCHESTRATOR_PORT','ORCHESTRATOR_HTTP_TIMEOUT_SECONDS','ORCHESTRATOR_HTTP_RETRIES'))"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage $startupMessage `
      -ForegroundCommand { & $orchestratorPythonExe -m uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload } `
      -LoggedCommandLine "$quotedPython -m uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload"
  }
}

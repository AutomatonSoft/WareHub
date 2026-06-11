[CmdletBinding()]
param(
  [switch]$DepsOnly,
  [switch]$NoApps,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$SkipServices,
  [switch]$SkipOrchestrator,
  [switch]$WithMigrations,
  [switch]$NoNewWindows
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootEnvPath = Join-Path $repoRoot ".env"
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"
$helperScript = Join-Path $repoRoot "tools\local\start-local-apps.ps1"
$processHelperScript = Join-Path $repoRoot "tools\local\local-dev-processes.ps1"
$localDevLogDirectory = Join-Path $repoRoot "logs\local-dev"
$script:StartedLogPaths = @{}
$script:LoadedRootEnvKeys = @()

$appPlans = @(
  @{
    Name = "frontend"
    Skip = $SkipFrontend
    WorkingDirectory = Join-Path $repoRoot "apps\frontend"
    Label = "Frontend"
    HealthUrl = "http://localhost:8931"
    Url = "http://localhost:8931"
    LogFileName = "frontend.log"
  },
  @{
    Name = "backend"
    Skip = $SkipBackend
    WorkingDirectory = Join-Path $repoRoot "apps\backend"
    Label = "Backend"
    HealthUrl = "http://localhost:8932/healthz"
    Url = "http://localhost:8932/healthz"
    LogFileName = "backend.log"
  },
  @{
    Name = "services"
    Skip = $SkipServices
    WorkingDirectory = Join-Path $repoRoot "services\database-service"
    Label = "Database-service"
    HealthUrl = "http://localhost:8934/healthz"
    Url = "http://localhost:8934/healthz"
    LogFileName = "database-service.log"
  },
  @{
    Name = "orchestrator"
    Skip = $SkipOrchestrator
    WorkingDirectory = Join-Path $repoRoot "services\orchestrator"
    Label = "Orchestrator"
    HealthUrl = "http://localhost:8935/healthz"
    Url = "http://localhost:8935/healthz"
    LogFileName = "orchestrator.log"
  }
)

function Assert-RepoRoot {
  $current = (Resolve-Path ".").Path.TrimEnd("\")
  $expected = (Resolve-Path $repoRoot).Path.TrimEnd("\")
  if ($current -ne $expected) {
    throw "Run start-dev.ps1 from repo root: $expected"
  }
}

function Assert-Docker {
  $null = Get-Command docker -ErrorAction Stop
  docker compose version | Out-Null
}

function Assert-RootEnvFile {
  if (-not (Test-Path -LiteralPath $rootEnvPath)) {
    throw "Missing root .env file: $rootEnvPath"
  }
}

function Assert-ComposeConfig {
  docker compose -f $composeFile config | Out-Null
}

function Assert-HelperScript {
  if (-not (Test-Path -LiteralPath $helperScript)) {
    throw "Missing local apps helper: $helperScript"
  }
}

function Assert-ProcessHelperScript {
  if (-not (Test-Path -LiteralPath $processHelperScript)) {
    throw "Missing local process helper: $processHelperScript"
  }
}

function Resolve-PowerShellExecutable {
  $windowsPowerShellCommand = Get-Command powershell -ErrorAction SilentlyContinue
  if ($windowsPowerShellCommand) {
    return $windowsPowerShellCommand.Source
  }

  $pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwshCommand) {
    return $pwshCommand.Source
  }

  throw "Unable to find a PowerShell executable. Ensure Windows PowerShell 'powershell' is available on PATH."
}

function Write-Utf8NoBomLines {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Lines
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($Path, $Lines, $utf8NoBom)
}

function Get-DotenvValues {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $values = @{}
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

function Import-RootEnv {
  $values = Get-DotenvValues -Path $rootEnvPath
  if ($values.Count -eq 0) {
    throw "Root .env does not contain any KEY=value entries: $rootEnvPath"
  }

  foreach ($entry in $values.GetEnumerator()) {
    [System.Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
  }

  $script:LoadedRootEnvKeys = @($values.Keys | Sort-Object)
  Write-Host "Loaded root .env into startup environment ($($script:LoadedRootEnvKeys.Count) keys)."
}

function Get-ProcessEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name
  )

  return [System.Environment]::GetEnvironmentVariable($Name, "Process")
}

function Set-ProcessEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
}

function Set-ProcessEnvDefault {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $currentValue = Get-ProcessEnvValue -Name $Name
  if ([string]::IsNullOrWhiteSpace($currentValue)) {
    Set-ProcessEnvValue -Name $Name -Value $Value
  }
}

function Set-ProcessEnvFromSource {
  param(
    [Parameter(Mandatory = $true)][string]$TargetName,
    [Parameter(Mandatory = $true)][string]$SourceName,
    [string]$FallbackValue
  )

  $sourceValue = Get-ProcessEnvValue -Name $SourceName
  if (-not [string]::IsNullOrWhiteSpace($sourceValue)) {
    Set-ProcessEnvValue -Name $TargetName -Value $sourceValue
    return
  }

  $targetValue = Get-ProcessEnvValue -Name $TargetName
  if (-not [string]::IsNullOrWhiteSpace($targetValue)) {
    return
  }

  if (-not [string]::IsNullOrWhiteSpace($FallbackValue)) {
    Set-ProcessEnvValue -Name $TargetName -Value $FallbackValue
  }
}

function Initialize-LocalRuntimeEnv {
  $frontendPort = (Get-ProcessEnvValue -Name "DEV_FRONTEND_PORT")
  if ([string]::IsNullOrWhiteSpace($frontendPort)) { $frontendPort = "8931" }

  $backendPort = (Get-ProcessEnvValue -Name "DEV_BACKEND_PORT")
  if ([string]::IsNullOrWhiteSpace($backendPort)) { $backendPort = "8932" }

  $servicesPort = (Get-ProcessEnvValue -Name "DEV_SERVICES_PORT")
  if ([string]::IsNullOrWhiteSpace($servicesPort)) { $servicesPort = "8934" }

  $orchestratorPort = (Get-ProcessEnvValue -Name "DEV_ORCHESTRATOR_PORT")
  if ([string]::IsNullOrWhiteSpace($orchestratorPort)) { $orchestratorPort = "8935" }

  $postgresDb = "warehub"
  $postgresUser = "warehub"
  $postgresPassword = "warehub"
  $rootDevPostgresHost = (Get-ProcessEnvValue -Name "DEV_POSTGRES_HOST")
  $postgresHost = "localhost"

  $postgresPort = Get-ProcessEnvValue -Name "DEV_POSTGRES_PORT"
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

  if (-not [string]::IsNullOrWhiteSpace($rootDevPostgresHost) -and $rootDevPostgresHost -notin @("localhost", "127.0.0.1")) {
    Write-Host "Overriding nonlocal DEV_POSTGRES_HOST for local runtime with localhost."
  }

  Write-Host "Derived local runtime env from root .env for frontend, backend, services, and orchestrator."
}

function Wait-ForPostgresHealthy {
  param(
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $containerId = $null

  while ((Get-Date) -lt $deadline) {
    $containerId = (docker compose -f $composeFile ps -q warehub-postgres).Trim()
    if ($containerId) {
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not $containerId) {
    throw "Postgres container was not created by local compose."
  }

  while ((Get-Date) -lt $deadline) {
    $health = (docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $containerId).Trim()
    if ($health -eq "healthy") {
      Write-Host "Postgres is healthy."
      return
    }
    if ($health -eq "unhealthy" -or $health -eq "exited" -or $health -eq "dead") {
      throw "Postgres container is not healthy: $health"
    }
    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for Postgres to become healthy."
}

function Start-LocalDependencies {
  Write-Host "Restarting local Docker dependencies..."
  docker compose -f $composeFile down
  Write-Host "Starting WareHub local dependencies from $composeFile"
  docker compose -f $composeFile up -d
  Wait-ForPostgresHealthy
}

function Ensure-LocalDevLogDirectory {
  if (-not (Test-Path -LiteralPath $localDevLogDirectory)) {
    New-Item -ItemType Directory -Path $localDevLogDirectory -Force | Out-Null
  }
}

function Reset-LocalDevLogFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $resolvedPath = $Path

  if (Test-Path -LiteralPath $Path) {
    try {
      Remove-Item -LiteralPath $Path -Force
    } catch {
      $baseName = [System.IO.Path]::GetFileNameWithoutExtension($Path)
      $extension = [System.IO.Path]::GetExtension($Path)
      $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $resolvedPath = Join-Path $directory "${baseName}-${timestamp}${extension}"
      Write-Warning "Log file is locked and cannot be replaced: $Path"
      Write-Host "Using fallback log file: $resolvedPath"
    }
  }

  if (-not (Test-Path -LiteralPath $resolvedPath)) {
    New-Item -ItemType File -Path $resolvedPath -Force | Out-Null
  } else {
    try {
      Clear-Content -LiteralPath $resolvedPath -Force
    } catch {
      $baseName = [System.IO.Path]::GetFileNameWithoutExtension($resolvedPath)
      $extension = [System.IO.Path]::GetExtension($resolvedPath)
      $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
      $resolvedPath = Join-Path $directory "${baseName}-${timestamp}${extension}"
      Write-Warning "Unable to clear existing log file: $Path"
      Write-Host "Using fallback log file: $resolvedPath"
      New-Item -ItemType File -Path $resolvedPath -Force | Out-Null
    }
  }

  return $resolvedPath
}

function Get-LaunchCommandText {
  param(
    [Parameter(Mandatory = $true)][string]$AppName,
    [Parameter(Mandatory = $true)][string]$PowerShellExecutable
  )

  $quotedPowerShell = '"' + $PowerShellExecutable + '"'
  $quotedHelper = '"' + $helperScript + '"'
  $quotedRepoRoot = '"' + $repoRoot + '"'
  $migrationFlag = if ($WithMigrations -and $AppName -eq "services") { " -WithMigrations" } else { "" }
  return "$quotedPowerShell -NoExit -ExecutionPolicy Bypass -File $quotedHelper -App $AppName -RepoRoot $quotedRepoRoot$migrationFlag"
}

function Start-LocalApps {
  param(
    [Parameter(Mandatory = $true)][string]$PowerShellExecutable
  )

  $enabledApps = @($appPlans | Where-Object { -not $_.Skip })
  if ($enabledApps.Count -eq 0) {
    Write-Host "No local app processes selected."
    return
  }

  if ($NoNewWindows) {
    Write-Host "Starting local apps..."
    foreach ($app in $enabledApps) {
      $defaultLogPath = Join-Path $localDevLogDirectory $app.LogFileName
      $logPath = Reset-LocalDevLogFile -Path $defaultLogPath
      $script:StartedLogPaths[$app.Name] = $logPath

      $arguments = @(
        "-NoLogo"
        "-NoProfile"
        "-ExecutionPolicy"
        "Bypass"
        "-File"
        $helperScript
        "-App"
        $app.Name
        "-RepoRoot"
        $repoRoot
        "-LogPath"
        $logPath
      )

      if ($WithMigrations -and $app.Name -eq "services") {
        $arguments += "-WithMigrations"
      }

      Start-Process -FilePath $PowerShellExecutable -ArgumentList $arguments -WorkingDirectory $app.WorkingDirectory -WindowStyle Hidden
      Write-Host "Started $($app.Label) in background. Log: $logPath"
    }
    return
  }

  Write-Host "Starting local apps..."
  foreach ($app in $enabledApps) {
    $script:StartedLogPaths[$app.Name] = $null
    $arguments = @(
      "-NoExit"
      "-ExecutionPolicy"
      "Bypass"
      "-File"
      $helperScript
      "-App"
      $app.Name
      "-RepoRoot"
      $repoRoot
    )

    if ($WithMigrations -and $app.Name -eq "services") {
      $arguments += "-WithMigrations"
    }

    Start-Process -FilePath $PowerShellExecutable -ArgumentList $arguments -WorkingDirectory $app.WorkingDirectory
    Write-Host "Started $($app.Label) in a new PowerShell window."
  }
}

function Print-StartupSummary {
  $enabledApps = @($appPlans | Where-Object { -not $_.Skip })
  $appMode = if ($DepsOnly -or $NoApps) { "Dependencies only" } elseif ($NoNewWindows) { "Dependencies started, apps running in background" } else { "Dependencies started, app windows launched" }
  Write-Host ""
  Write-Host "WareHub local dev startup complete."
  Write-Host "Mode: $appMode"
  Write-Host "Local env source of truth: $rootEnvPath"
  if ($NoNewWindows -and -not ($DepsOnly -or $NoApps)) {
    Write-Host ""
    Write-Host "Started services:"
    foreach ($app in $enabledApps) {
      Write-Host "  $($app.Label): $($app.Url)"
    }
    Write-Host ""
    Write-Host "Logs:"
    foreach ($app in $enabledApps) {
      $logPath = $script:StartedLogPaths[$app.Name]
      if (-not $logPath) {
        $logPath = Join-Path $localDevLogDirectory $app.LogFileName
      }
      Write-Host "  $($app.Label): $logPath"
    }
    Write-Host ""
    Write-Host "Stop command:"
    Write-Host "  .\stop-dev.ps1"
  }
  Write-Host ""
  Write-Host "Local URLs:"
  Write-Host "  Frontend:           http://localhost:8931"
  Write-Host "  Backend:            http://localhost:8932"
  Write-Host "  Backend API:        http://localhost:8932/api/v1"
  Write-Host "  Backend health:     http://localhost:8932/healthz"
  Write-Host "  Database-service:   http://localhost:8934"
  Write-Host "  Services health:    http://localhost:8934/healthz"
  Write-Host "  Orchestrator:       http://localhost:8935"
  Write-Host "  Orchestrator health:http://localhost:8935/healthz"
  Write-Host "  Postgres:           localhost:8933"
  Write-Host "  Redis:              localhost:8936"
  Write-Host "  RabbitMQ:           localhost:8937"
  Write-Host "  RabbitMQ UI:        http://localhost:15672"
  Write-Host "  MinIO API:          http://localhost:9000"
  Write-Host "  MinIO Console:      http://localhost:9001"
  Write-Host ""
  Write-Host "Manual smoke checks:"
  Write-Host "  Invoke-WebRequest http://localhost:8932/healthz -UseBasicParsing"
  Write-Host "  Invoke-WebRequest http://localhost:8934/healthz -UseBasicParsing"
  Write-Host "  Invoke-WebRequest http://localhost:8935/healthz -UseBasicParsing"
  Write-Host ""
  if ($WithMigrations) {
    Write-Host "WithMigrations enabled: database-service helper will run 'python manage.py migrate' before runserver."
    Write-Host "Backend runtime migrations remain skipped by default through SKIP_DB_MIGRATIONS=true."
  } else {
    Write-Host "Migrations are not run automatically. Pass -WithMigrations only when you explicitly want local Django migrations."
  }
}

Assert-RepoRoot
Assert-Docker
Assert-RootEnvFile
Assert-HelperScript
Assert-ProcessHelperScript
. $processHelperScript
$powerShellExecutable = Resolve-PowerShellExecutable
Import-RootEnv
Initialize-LocalRuntimeEnv
Assert-ComposeConfig
Ensure-LocalDevLogDirectory
Write-Host "Cleaning previous WareHub local app processes..."
Stop-WareHubLocalAppProcesses
Start-LocalDependencies

if (-not ($DepsOnly -or $NoApps)) {
  Start-LocalApps -PowerShellExecutable $powerShellExecutable
}

Print-StartupSummary

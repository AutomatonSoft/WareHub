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
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"
$helperScript = Join-Path $repoRoot "tools\local\start-local-apps.ps1"
$localDevLogDirectory = Join-Path $repoRoot "logs\local-dev"

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

function Assert-ComposeConfig {
  docker compose -f $composeFile config | Out-Null
}

function Assert-HelperScript {
  if (-not (Test-Path -LiteralPath $helperScript)) {
    throw "Missing local apps helper: $helperScript"
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

function Set-DotenvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][hashtable]$Values
  )

  $lines = Get-Content -LiteralPath $Path
  $updatedKeys = New-Object System.Collections.Generic.HashSet[string]

  for ($index = 0; $index -lt $lines.Count; $index++) {
    foreach ($entry in $Values.GetEnumerator()) {
      $escapedKey = [regex]::Escape($entry.Key)
      if ($lines[$index] -match "^${escapedKey}=") {
        $lines[$index] = "$($entry.Key)=$($entry.Value)"
        $null = $updatedKeys.Add($entry.Key)
        break
      }
    }
  }

  foreach ($entry in $Values.GetEnumerator()) {
    if (-not $updatedKeys.Contains($entry.Key)) {
      $lines += "$($entry.Key)=$($entry.Value)"
    }
  }

  Write-Utf8NoBomLines -Path $Path -Lines ([string[]]$lines)
}

function Ensure-LocalEnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$ExamplePath,
    [Parameter(Mandatory = $true)][hashtable]$SeedValues
  )

  if (Test-Path -LiteralPath $TargetPath) {
    Write-Host "Keeping existing local env file: $TargetPath"
    return
  }

  if (-not (Test-Path -LiteralPath $ExamplePath)) {
    throw "Missing env example: $ExamplePath"
  }

  Copy-Item -LiteralPath $ExamplePath -Destination $TargetPath
  Set-DotenvValue -Path $TargetPath -Values $SeedValues
  Write-Host "Created local env file from example: $TargetPath"
}

function Ensure-LocalEnvFiles {
  Ensure-LocalEnvFile `
    -TargetPath (Join-Path $repoRoot "apps\backend\.env") `
    -ExamplePath (Join-Path $repoRoot "apps\backend\.env.example") `
    -SeedValues @{
      "DATABASE_URL" = "postgres://warehub:warehub@localhost:8933/warehub"
      "APP_ENV" = "dev"
      "APP_PORT" = "8932"
      "SKIP_DB_MIGRATIONS" = "true"
      "CORS_ALLOW_ORIGINS" = "http://localhost:8931"
    }

  Ensure-LocalEnvFile `
    -TargetPath (Join-Path $repoRoot "apps\frontend\.env.local") `
    -ExamplePath (Join-Path $repoRoot "apps\frontend\.env.example") `
    -SeedValues @{
      "NEXT_PUBLIC_API_BASE_URL" = "http://localhost:8932/api/v1"
      "BACKEND_INTERNAL_API_BASE_URL" = "http://127.0.0.1:8932/api/v1"
      "NEXT_PUBLIC_SERVICES_API_BASE_URL" = "http://localhost:8934"
      "NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL" = "http://localhost:8935"
      "BACKEND_ORIGIN" = "http://localhost:8932"
      "SERVICES_ORIGIN" = "http://localhost:8934"
      "PORT" = "8931"
      "NODE_ENV" = "development"
    }

  Ensure-LocalEnvFile `
    -TargetPath (Join-Path $repoRoot "services\database-service\.env") `
    -ExamplePath (Join-Path $repoRoot "services\database-service\.env.example") `
    -SeedValues @{
      "POSTGRES_DB" = "warehub"
      "POSTGRES_USER" = "warehub"
      "POSTGRES_PASSWORD" = "warehub"
      "POSTGRES_HOST" = "localhost"
      "POSTGRES_PORT" = "8933"
      "DATABASE_URL" = "postgresql://warehub:warehub@localhost:8933/warehub"
      "DEBUG" = "true"
      "ALLOWED_HOSTS" = "127.0.0.1,localhost"
    }

  Ensure-LocalEnvFile `
    -TargetPath (Join-Path $repoRoot "services\orchestrator\.env") `
    -ExamplePath (Join-Path $repoRoot "services\orchestrator\.env.example") `
    -SeedValues @{
      "DATABASE_SERVICE_BASE_URL" = "http://localhost:8934"
      "ORCHESTRATOR_PORT" = "8935"
      "ORCHESTRATOR_HOST" = "0.0.0.0"
    }
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

  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
  }

  New-Item -ItemType File -Path $Path -Force | Out-Null
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
    foreach ($app in $enabledApps) {
      $logPath = Join-Path $localDevLogDirectory $app.LogFileName
      Reset-LocalDevLogFile -Path $logPath

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

  foreach ($app in $enabledApps) {
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
  if ($NoNewWindows -and -not ($DepsOnly -or $NoApps)) {
    Write-Host ""
    Write-Host "Started services:"
    foreach ($app in $enabledApps) {
      Write-Host "  $($app.Label): $($app.Url)"
    }
    Write-Host ""
    Write-Host "Logs:"
    foreach ($app in $enabledApps) {
      $logPath = Join-Path $localDevLogDirectory $app.LogFileName
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
Assert-ComposeConfig
Assert-HelperScript
$powerShellExecutable = Resolve-PowerShellExecutable
Ensure-LocalEnvFiles
Ensure-LocalDevLogDirectory
Start-LocalDependencies

if (-not ($DepsOnly -or $NoApps)) {
  Start-LocalApps -PowerShellExecutable $powerShellExecutable
}

Print-StartupSummary

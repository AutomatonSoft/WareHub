[CmdletBinding()]
param(
  [switch]$DepsOnly,
  [switch]$NoApps,
  [switch]$SkipFrontend,
  [switch]$SkipBackend,
  [switch]$SkipServices,
  [switch]$SkipOrchestrator,
  [switch]$ResetDeps,
  [switch]$ReinstallDeps,
  [switch]$SkipDependencyInstall,
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
$localDependencyCacheDirectory = Join-Path $repoRoot ".venv\local-dev"
$pythonBootstrapExecutable = $null
$npmExecutable = $null
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
    HealthUrl = "http://localhost:8932/api/v1/healthz"
    Url = "http://localhost:8932/api/v1/healthz"
    LogFileName = "backend.log"
  },
  @{
    Name = "services"
    Skip = $SkipServices
    WorkingDirectory = Join-Path $repoRoot "services\database-service"
    Label = "Database-service"
    HealthUrl = "http://localhost:8934/api/v1/healthz"
    Url = "http://localhost:8934/api/v1/healthz"
    LogFileName = "database-service.log"
  },
  @{
    Name = "orchestrator"
    Skip = $SkipOrchestrator
    WorkingDirectory = Join-Path $repoRoot "services\orchestrator"
    Label = "Orchestrator"
    HealthUrl = "http://localhost:8935/api/v1/healthz"
    Url = "http://localhost:8935/api/v1/healthz"
    LogFileName = "orchestrator.log"
  }
)

$pythonServicePlans = @(
  @{
    Name = "database-service"
    WorkingDirectory = Join-Path $repoRoot "services\database-service"
    VenvPath = Join-Path $repoRoot ".venv\database-service"
    RequirementFiles = @("requirements.txt")
    PythonEnvName = "DATABASE_SERVICE_PYTHON_EXE"
    VenvEnvName = "DATABASE_SERVICE_VENV_PATH"
  },
  @{
    Name = "orchestrator"
    WorkingDirectory = Join-Path $repoRoot "services\orchestrator"
    VenvPath = Join-Path $repoRoot ".venv\orchestrator"
    RequirementFiles = @("requirements.txt")
    PythonEnvName = "ORCHESTRATOR_PYTHON_EXE"
    VenvEnvName = "ORCHESTRATOR_VENV_PATH"
  }
)

$dockerDependencyPlans = @(
  @{ Service = "warehub-postgres"; Label = "Postgres"; RequireHealthy = $true },
  @{ Service = "warehub-redis"; Label = "Redis"; RequireHealthy = $false },
  @{ Service = "warehub-minio"; Label = "MinIO"; RequireHealthy = $false },
  @{ Service = "warehub-rabbitmq"; Label = "RabbitMQ"; RequireHealthy = $false }
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
  Invoke-DockerCommand -ArgumentList @("compose", "version") | Out-Null
}

function Invoke-DockerCommand {
  param(
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& docker @ArgumentList 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $details = ($output |
      ForEach-Object { $_.ToString().Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($details)) {
      $details = "docker exited with code $exitCode."
    }
    throw "Docker command failed: docker $($ArgumentList -join ' ')`n$details"
  }

  return @($output | ForEach-Object { $_.ToString() })
}

function Assert-DockerDaemonReady {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $output = @(& docker info --format '{{.ServerVersion}}' 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  if ($exitCode -ne 0) {
    $details = ($output |
      ForEach-Object { $_.ToString().Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join [Environment]::NewLine
    if ([string]::IsNullOrWhiteSpace($details)) {
      $details = "docker info exited with code $exitCode."
    }
    throw "Docker daemon is unavailable. Start Docker Desktop and wait until 'docker info' succeeds.`n$details"
  }
}

function Resolve-PythonExecutable {
  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    return $pythonCommand.Source
  }

  throw "Unable to find Python on PATH."
}

function Resolve-NpmExecutable {
  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCommand) {
    return $npmCommand.Source
  }

  throw "Unable to find npm on PATH."
}

function Assert-RootEnvFile {
  if (-not (Test-Path -LiteralPath $rootEnvPath)) {
    throw "Missing root .env file: $rootEnvPath"
  }
}

function Assert-ComposeConfig {
  Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "config") | Out-Null
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

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$WorkingDirectory
  )

  if ($WorkingDirectory) {
    Push-Location $WorkingDirectory
  }

  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Command exited with code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
  } finally {
    if ($WorkingDirectory) {
      Pop-Location
    }
  }
}

function Ensure-Directory {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
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

function Get-TextSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Text
  )

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hashBytes = $sha256.ComputeHash($bytes)
    return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Get-CombinedFileHash {
  param(
    [Parameter(Mandatory = $true)][string[]]$Paths
  )

  $parts = foreach ($path in ($Paths | Sort-Object)) {
    $resolvedPath = (Resolve-Path $path).Path
    $fileHash = (Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256).Hash.ToLowerInvariant()
    "$resolvedPath|$fileHash"
  }

  return Get-TextSha256 -Text ($parts -join "`n")
}

function Get-ServiceDependencyInputPaths {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string[]]$CandidateFiles
  )

  $paths = @(
    foreach ($candidateFile in $CandidateFiles) {
    $candidatePath = Join-Path $WorkingDirectory $candidateFile
    if (Test-Path -LiteralPath $candidatePath) {
      (Resolve-Path $candidatePath).Path
    }
  }
  )

  if ($paths.Count -eq 0) {
    throw "No dependency manifest found in $WorkingDirectory"
  }

  return @($paths)
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
  Set-ProcessEnvValue -Name "NEXT_PUBLIC_SERVICES_API_BASE_URL" -Value "$servicesOrigin/api/v1"
  Set-ProcessEnvValue -Name "SERVICES_API_BASE_URL" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL" -Value "$orchestratorOrigin/api/v1"
  Set-ProcessEnvValue -Name "ORCHESTRATOR_API_BASE_URL" -Value $orchestratorOrigin
  Set-ProcessEnvValue -Name "MOBILE_DEV_API_BASE_URL" -Value "http://127.0.0.1:$backendPort/api/v1"
  Set-ProcessEnvValue -Name "DATABASE_SERVICE_BASE_URL" -Value $servicesOrigin
  Set-ProcessEnvValue -Name "ORCHESTRATOR_SERVICE_AUTH_TOKEN" -Value "warehub-local-orchestrator"
  Set-ProcessEnvValue -Name "ORCHESTRATOR_SERVICE_ALLOWED_HOSTS" -Value "localhost,127.0.0.1"
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

function Ensure-LocalDependencyCacheDirectory {
  Ensure-Directory -Path $localDependencyCacheDirectory
}

function Test-AppSelectedForStartup {
  param(
    [Parameter(Mandatory = $true)][string]$AppName
  )

  if ($DepsOnly -or $NoApps) {
    return $false
  }

  $appPlan = $appPlans | Where-Object { $_.Name -eq $AppName } | Select-Object -First 1
  if (-not $appPlan) {
    return $false
  }

  return (-not $appPlan.Skip)
}

function Get-VenvPythonPath {
  param(
    [Parameter(Mandatory = $true)][string]$VenvPath
  )

  return Join-Path $VenvPath "Scripts\python.exe"
}

function Ensure-PythonServiceDependencies {
  param(
    [Parameter(Mandatory = $true)][hashtable]$ServicePlan
  )

  $serviceName = $ServicePlan.Name
  $workingDirectory = $ServicePlan.WorkingDirectory
  $venvPath = $ServicePlan.VenvPath
  $venvPythonPath = Get-VenvPythonPath -VenvPath $venvPath
  $hashFilePath = Join-Path $localDependencyCacheDirectory "$serviceName.requirements.sha256"
  $manifestPaths = Get-ServiceDependencyInputPaths -WorkingDirectory $workingDirectory -CandidateFiles $ServicePlan.RequirementFiles

  Write-Host "$serviceName venv path: $venvPath"

  if ($SkipDependencyInstall) {
    if (-not (Test-Path -LiteralPath $venvPythonPath)) {
      throw "$serviceName virtual environment is missing at $venvPath. Re-run without -SkipDependencyInstall."
    }

    Write-Host "$serviceName dependency install checks skipped."
    Set-ProcessEnvValue -Name $ServicePlan.PythonEnvName -Value $venvPythonPath
    Set-ProcessEnvValue -Name $ServicePlan.VenvEnvName -Value $venvPath
    return
  }

  if (-not (Test-Path -LiteralPath $venvPythonPath)) {
    Write-Host "$serviceName virtual environment missing; creating $venvPath"
    Ensure-Directory -Path $venvPath
    Invoke-ExternalCommand -FilePath $pythonBootstrapExecutable -ArgumentList @("-m", "venv", $venvPath)
  }

  $currentHash = Get-CombinedFileHash -Paths $manifestPaths
  $previousHash = if (Test-Path -LiteralPath $hashFilePath) {
    (Get-Content -LiteralPath $hashFilePath -Raw).Trim()
  } else {
    ""
  }

  $shouldInstall = $ReinstallDeps -or [string]::IsNullOrWhiteSpace($previousHash) -or $currentHash -ne $previousHash
  if ($ReinstallDeps) {
    Write-Host "ReinstallDeps requested; reinstalling $serviceName dependencies."
  } elseif (-not $shouldInstall) {
    Write-Host "$serviceName dependencies unchanged; skipping install."
  } else {
    Write-Host "$serviceName dependency hash changed; installing dependencies."
  }

  if ($shouldInstall) {
    $requirementsPath = $manifestPaths | Where-Object { $_.EndsWith("requirements.txt") } | Select-Object -First 1
    if (-not $requirementsPath) {
      throw "$serviceName currently requires a requirements.txt manifest for local startup."
    }

    $pipArguments = @("-m", "pip", "install", "--disable-pip-version-check")
    if ($ReinstallDeps) {
      $pipArguments += "--force-reinstall"
    }
    $pipArguments += @("-r", $requirementsPath)

    Invoke-ExternalCommand -FilePath $venvPythonPath -ArgumentList $pipArguments -WorkingDirectory $workingDirectory
    Write-Utf8NoBomLines -Path $hashFilePath -Lines @($currentHash)
  }

  Set-ProcessEnvValue -Name $ServicePlan.PythonEnvName -Value $venvPythonPath
  Set-ProcessEnvValue -Name $ServicePlan.VenvEnvName -Value $venvPath
}

function Ensure-FrontendDependencies {
  $frontendDirectory = Join-Path $repoRoot "apps\frontend"
  $packageJsonPath = Join-Path $frontendDirectory "package.json"
  $packageLockPath = Join-Path $frontendDirectory "package-lock.json"
  $pnpmLockPath = Join-Path $frontendDirectory "pnpm-lock.yaml"
  $yarnLockPath = Join-Path $frontendDirectory "yarn.lock"
  $hashFilePath = Join-Path $localDependencyCacheDirectory "frontend.dependencies.sha256"
  $nodeModulesPath = Join-Path $frontendDirectory "node_modules"

  $dependencyInputs = @($packageJsonPath)
  $installCommand = @("install")
  if (Test-Path -LiteralPath $packageLockPath) {
    $dependencyInputs += $packageLockPath
    $installCommand = @("ci")
  } elseif (Test-Path -LiteralPath $pnpmLockPath) {
    $dependencyInputs += $pnpmLockPath
  } elseif (Test-Path -LiteralPath $yarnLockPath) {
    $dependencyInputs += $yarnLockPath
  }

  Write-Host "frontend dependency cache path: $hashFilePath"

  if ($SkipDependencyInstall) {
    if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
      throw "Frontend dependencies are missing at $nodeModulesPath. Re-run without -SkipDependencyInstall."
    }
    Write-Host "frontend dependency install checks skipped."
    return
  }

  $currentHash = Get-CombinedFileHash -Paths $dependencyInputs
  $previousHash = if (Test-Path -LiteralPath $hashFilePath) {
    (Get-Content -LiteralPath $hashFilePath -Raw).Trim()
  } else {
    ""
  }

  $shouldInstall = $ReinstallDeps -or -not (Test-Path -LiteralPath $nodeModulesPath) -or [string]::IsNullOrWhiteSpace($previousHash) -or $currentHash -ne $previousHash
  if ($ReinstallDeps) {
    Write-Host "ReinstallDeps requested; reinstalling frontend dependencies."
  } elseif (-not $shouldInstall) {
    Write-Host "frontend dependencies unchanged; skipping install."
  } else {
    Write-Host "frontend dependency hash changed or node_modules missing; installing dependencies."
  }

  if ($shouldInstall) {
    Invoke-ExternalCommand -FilePath $npmExecutable -ArgumentList $installCommand -WorkingDirectory $frontendDirectory
    Write-Utf8NoBomLines -Path $hashFilePath -Lines @($currentHash)
  }
}

function Get-DockerComposeContainerId {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceName
  )

  $output = @(Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "ps", "-q", $ServiceName))
  if (-not $output -or $output.Count -eq 0) {
    return ""
  }

  $containerId = [string]($output | Select-Object -First 1)
  if ([string]::IsNullOrWhiteSpace($containerId)) {
    return ""
  }

  return $containerId.Trim()
}

function Resolve-PostgresComposeServiceName {
  $services = @(Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "config", "--services"))
  if ($services -contains "postgres") {
    return "postgres"
  }
  if ($services -contains "warehub-postgres") {
    return "warehub-postgres"
  }
  return "postgres"
}
function Wait-ForPostgresHealthy {
  param(
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $containerId = $null

  while ((Get-Date) -lt $deadline) {
    $containerId = Get-DockerComposeContainerId -ServiceName (Resolve-PostgresComposeServiceName)
    if ($containerId) {
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not $containerId) {
    throw "Postgres container was not created by local compose."
  }

  while ((Get-Date) -lt $deadline) {
    $health = ([string](Invoke-DockerCommand -ArgumentList @("inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", $containerId) | Select-Object -First 1)).Trim()
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

function Get-DependencyContainerState {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceName
  )

  $containerId = Get-DockerComposeContainerId -ServiceName $ServiceName
  if (-not $containerId) {
    return "missing"
  }

  $state = ([string](Invoke-DockerCommand -ArgumentList @("inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", $containerId) | Select-Object -First 1)).Trim()
  if ([string]::IsNullOrWhiteSpace($state)) {
    return "unknown"
  }

  return $state
}

function Test-LocalDependenciesHealthy {
  foreach ($dependencyPlan in $dockerDependencyPlans) {
    $state = Get-DependencyContainerState -ServiceName $dependencyPlan.Service
    if ($dependencyPlan.RequireHealthy) {
      if ($state -ne "healthy") {
        return $false
      }
      continue
    }

    if ($state -notin @("running", "healthy")) {
      return $false
    }
  }

  return $true
}

function Wait-ForDependencyState {
  param(
    [Parameter(Mandatory = $true)][hashtable]$DependencyPlan,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $state = Get-DependencyContainerState -ServiceName $DependencyPlan.Service
    if ($DependencyPlan.RequireHealthy) {
      if ($state -eq "healthy") {
        return
      }
      if ($state -in @("unhealthy", "exited", "dead")) {
        throw "$($DependencyPlan.Label) container is not healthy: $state"
      }
    } elseif ($state -in @("running", "healthy")) {
      return
    } elseif ($state -in @("exited", "dead")) {
      throw "$($DependencyPlan.Label) container is not running: $state"
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for $($DependencyPlan.Label) local dependency readiness."
}

function Wait-ForLocalDependenciesReady {
  foreach ($dependencyPlan in $dockerDependencyPlans) {
    Wait-ForDependencyState -DependencyPlan $dependencyPlan
  }
  Write-Host "Local Docker dependencies are ready."
}

function Start-LocalDependencies {
  if ($ResetDeps) {
    Write-Host "ResetDeps requested; recreating local Docker dependencies."
    Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "down") | Out-Null
    Write-Host "Starting WareHub local dependencies from $composeFile"
    Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "up", "-d") | Out-Null
    Wait-ForLocalDependenciesReady
    return
  }

  if (Test-LocalDependenciesHealthy) {
    Write-Host "Docker dependencies already running; reusing existing containers."
    return
  }

  Write-Host "Starting missing or unhealthy Docker dependencies..."
  Invoke-DockerCommand -ArgumentList @("compose", "-f", $composeFile, "up", "-d") | Out-Null
  Wait-ForLocalDependenciesReady
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
  Write-Host "  Backend health:     http://localhost:8932/api/v1/healthz"
  Write-Host "  Database-service:   http://localhost:8934"
  Write-Host "  Services health:    http://localhost:8934/api/v1/healthz"
  Write-Host "  Orchestrator:       http://localhost:8935"
  Write-Host "  Orchestrator health:http://localhost:8935/api/v1/healthz"
  Write-Host "  Postgres:           localhost:8933"
  Write-Host "  Redis:              localhost:8936"
  Write-Host "  RabbitMQ:           localhost:8937"
  Write-Host "  RabbitMQ UI:        http://localhost:15672"
  Write-Host "  MinIO API:          http://localhost:9000"
  Write-Host "  MinIO Console:      http://localhost:9001"
  Write-Host ""
  Write-Host "Manual smoke checks:"
  Write-Host "  Invoke-WebRequest http://localhost:8932/api/v1/healthz -UseBasicParsing"
  Write-Host "  Invoke-WebRequest http://localhost:8934/api/v1/healthz -UseBasicParsing"
  Write-Host "  Invoke-WebRequest http://localhost:8935/api/v1/healthz -UseBasicParsing"
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
Assert-DockerDaemonReady
Assert-RootEnvFile
Assert-HelperScript
Assert-ProcessHelperScript
. $processHelperScript
$powerShellExecutable = Resolve-PowerShellExecutable
$pythonBootstrapExecutable = Resolve-PythonExecutable
$npmExecutable = Resolve-NpmExecutable
Import-RootEnv
Initialize-LocalRuntimeEnv
Assert-ComposeConfig
Ensure-LocalDevLogDirectory
Ensure-LocalDependencyCacheDirectory
Write-Host "Cleaning previous WareHub local app processes..."
Stop-WareHubLocalAppProcesses
Start-LocalDependencies
if (Test-AppSelectedForStartup -AppName "frontend") {
  Ensure-FrontendDependencies
}
foreach ($pythonServicePlan in $pythonServicePlans) {
  $appName = if ($pythonServicePlan.Name -eq "database-service") { "services" } else { "orchestrator" }
  if (Test-AppSelectedForStartup -AppName $appName) {
    Ensure-PythonServiceDependencies -ServicePlan $pythonServicePlan
  }
}

if (-not ($DepsOnly -or $NoApps)) {
  Start-LocalApps -PowerShellExecutable $powerShellExecutable
}

Print-StartupSummary

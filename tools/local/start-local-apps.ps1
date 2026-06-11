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

switch ($App) {
  "frontend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\frontend"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage "Starting frontend in $workingDirectory" `
      -ForegroundCommand { npm run dev } `
      -LoggedCommandLine "npm run dev"
  }

  "backend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\backend"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage "Starting backend in $workingDirectory" `
      -ForegroundCommand { cargo run } `
      -LoggedCommandLine "cargo run"
  }

  "services" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\database-service"
    $loggedCommandLine = if ($WithMigrations) {
      "python manage.py migrate && python manage.py runserver 0.0.0.0:8934"
    } else {
      "python manage.py runserver 0.0.0.0:8934"
    }

    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage "Starting database-service in $workingDirectory" `
      -ForegroundCommand {
        if ($WithMigrations) {
          python manage.py migrate
        }
        python manage.py runserver 0.0.0.0:8934
      } `
      -LoggedCommandLine $loggedCommandLine
  }

  "orchestrator" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\orchestrator"
    Invoke-LoggedCommand `
      -WorkingDirectory $workingDirectory `
      -StartupMessage "Starting orchestrator in $workingDirectory" `
      -ForegroundCommand { uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload } `
      -LoggedCommandLine "uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload"
  }
}

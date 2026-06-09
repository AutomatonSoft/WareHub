[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("frontend", "backend", "services", "orchestrator")]
  [string]$App,

  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,

  [switch]$WithMigrations
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

switch ($App) {
  "frontend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\frontend"
    Write-Host "Starting frontend in $workingDirectory"
    Invoke-CommandInDirectory -WorkingDirectory $workingDirectory -Command {
      npm run dev
    }
  }

  "backend" {
    $workingDirectory = Join-Path $resolvedRepoRoot "apps\backend"
    Write-Host "Starting backend in $workingDirectory"
    Invoke-CommandInDirectory -WorkingDirectory $workingDirectory -Command {
      cargo run
    }
  }

  "services" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\database-service"
    Write-Host "Starting database-service in $workingDirectory"
    Invoke-CommandInDirectory -WorkingDirectory $workingDirectory -Command {
      if ($WithMigrations) {
        python manage.py migrate
      }
      python manage.py runserver 0.0.0.0:8934
    }
  }

  "orchestrator" {
    $workingDirectory = Join-Path $resolvedRepoRoot "services\orchestrator"
    Write-Host "Starting orchestrator in $workingDirectory"
    Invoke-CommandInDirectory -WorkingDirectory $workingDirectory -Command {
      uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload
    }
  }
}

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"

function Assert-RepoRoot {
  $current = (Get-Location).Path
  if ($current -ne $repoRoot) {
    throw "Run stop-dev.ps1 from repo root: $repoRoot"
  }
}

function Assert-Docker {
  $null = Get-Command docker -ErrorAction Stop
  docker compose version | Out-Null
}

function Assert-ComposeConfig {
  docker compose -f $composeFile config | Out-Null
}

Assert-RepoRoot
Assert-Docker
Assert-ComposeConfig

Write-Host "Stopping WareHub local dependencies from $composeFile"
docker compose -f $composeFile down
Write-Host "Local dependencies are stopped."

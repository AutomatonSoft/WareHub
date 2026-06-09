[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"

function Assert-RepoRoot {
  $current = (Resolve-Path ".").Path.TrimEnd("\")
  $expected = (Resolve-Path $repoRoot).Path.TrimEnd("\")
  if ($current -ne $expected) {
    throw "Run stop-dev.ps1 from repo root: $expected"
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
Write-Host "Note: stop-dev.ps1 does not stop manually launched app windows."

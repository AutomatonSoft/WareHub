[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"
$processHelperScript = Join-Path $repoRoot "tools\local\local-dev-processes.ps1"

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

function Assert-ProcessHelperScript {
  if (-not (Test-Path -LiteralPath $processHelperScript)) {
    throw "Missing local process helper: $processHelperScript"
  }
}

Assert-RepoRoot
Assert-Docker
Assert-ComposeConfig
Assert-ProcessHelperScript
. $processHelperScript

Stop-WareHubLocalAppProcesses

Write-Host "Stopping WareHub local dependencies from $composeFile"
docker compose -f $composeFile down
Write-Host "Local dependencies are stopped."

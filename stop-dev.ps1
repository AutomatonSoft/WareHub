[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"
$processHelperScript = Join-Path $repoRoot "tools\local\local-dev-processes.ps1"
$localDevLogDirectory = Join-Path $repoRoot "logs\local-dev"
$appPidFiles = @(
  "frontend.pid",
  "backend.pid",
  "database-service.pid",
  "database-service-jv-worker.pid",
  "orchestrator.pid"
)

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

function Stop-BackgroundPidProcesses {
  foreach ($pidFileName in $appPidFiles) {
    $pidPath = Join-Path $localDevLogDirectory $pidFileName
    if (-not (Test-Path -LiteralPath $pidPath)) {
      continue
    }

    try {
      $rawPid = (Get-Content -LiteralPath $pidPath -ErrorAction Stop | Select-Object -First 1).ToString().Trim()
      $processId = 0
      if ([int]::TryParse($rawPid, [ref]$processId) -and $processId -gt 0) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) {
          Write-Host "Stopping process $($process.ProcessName) (PID $processId) from PID file $pidFileName."
          Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
      }
    } finally {
      Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    }
  }
}

Assert-RepoRoot
Assert-Docker
Assert-ComposeConfig
Assert-ProcessHelperScript
. $processHelperScript

Stop-WareHubLocalAppProcesses
Stop-BackgroundPidProcesses

Write-Host "Stopping WareHub local dependencies from $composeFile"
docker compose -f $composeFile down
Write-Host "Local dependencies are stopped."

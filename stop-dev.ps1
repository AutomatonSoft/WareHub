[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$composeFile = Join-Path $repoRoot "infra\local\docker-compose.dev.yml"
$wareHubAppPorts = @(8931, 8932, 8934, 8935)

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

function Get-ListeningProcessIdsForPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port
  )

  $connectionCommand = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
  if ($connectionCommand) {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  }

  $netstatLines = netstat -ano -p tcp | Select-String -Pattern "LISTENING"
  $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$"
  $processIds = foreach ($line in $netstatLines) {
    if ($line.Line -match $pattern) {
      [int]$matches[1]
    }
  }

  return @($processIds | Sort-Object -Unique)
}

function Get-ChildProcessIds {
  param(
    [Parameter(Mandatory = $true)][int]$ParentProcessId
  )

  $allProcesses = @(Get-CimInstance Win32_Process)
  $childIds = New-Object System.Collections.Generic.List[int]
  $pendingParentIds = New-Object System.Collections.Generic.Queue[int]
  $pendingParentIds.Enqueue($ParentProcessId)

  while ($pendingParentIds.Count -gt 0) {
    $currentParentId = $pendingParentIds.Dequeue()
    $directChildren = @($allProcesses | Where-Object { $_.ParentProcessId -eq $currentParentId } | Select-Object -ExpandProperty ProcessId)

    foreach ($childId in $directChildren) {
      if (-not $childIds.Contains($childId)) {
        $childIds.Add($childId)
        $pendingParentIds.Enqueue($childId)
      }
    }
  }

  return @($childIds)
}

function Stop-ProcessTreeForPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][int]$ListenerProcessId
  )

  $targetIds = New-Object System.Collections.Generic.List[int]
  $targetIds.Add($ListenerProcessId)

  foreach ($childId in (Get-ChildProcessIds -ParentProcessId $ListenerProcessId)) {
    if (-not $targetIds.Contains($childId)) {
      $targetIds.Add($childId)
    }
  }

  foreach ($targetId in ($targetIds | Sort-Object -Descending)) {
    $process = Get-Process -Id $targetId -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }

    Write-Host "Stopping process $($process.ProcessName) (PID $targetId) for port $port."
    Stop-Process -Id $targetId -Force -ErrorAction Stop
  }
}

function Stop-WareHubLocalAppProcesses {
  $stoppedAny = $false

  foreach ($port in $wareHubAppPorts) {
    $portStopped = $false

    for ($attempt = 1; $attempt -le 5; $attempt++) {
      $processIds = @(Get-ListeningProcessIdsForPort -Port $port | Where-Object { $_ -and $_ -gt 0 })
      if ($processIds.Count -eq 0) {
        if (-not $portStopped -and $attempt -eq 1) {
          Write-Host "No listener found on port $port."
        }
        $portStopped = $true
        break
      }

      foreach ($processId in $processIds) {
        Stop-ProcessTreeForPort -Port $port -ListenerProcessId $processId
        $stoppedAny = $true
      }

      Start-Sleep -Seconds 1
    }

    if (-not $portStopped) {
      $remainingProcessIds = @(Get-ListeningProcessIdsForPort -Port $port | Where-Object { $_ -and $_ -gt 0 })
      if ($remainingProcessIds.Count -gt 0) {
        Write-Warning "Port $port still has listeners after stop attempts: $($remainingProcessIds -join ', ')"
        continue
      }
    }
  }

  if (-not $stoppedAny) {
    Write-Host "No WareHub app listeners were running on ports $($wareHubAppPorts -join ', ')."
  }
}

Assert-RepoRoot
Assert-Docker
Assert-ComposeConfig

Stop-WareHubLocalAppProcesses

Write-Host "Stopping WareHub local dependencies from $composeFile"
docker compose -f $composeFile down
Write-Host "Local dependencies are stopped."

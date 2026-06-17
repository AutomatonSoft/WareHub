Set-StrictMode -Version Latest

$script:WareHubLocalAppPorts = @(8931, 8932, 8934, 8935)
$script:WareHubManagedPathPattern = "*\WareHub\*"

function Get-WareHubLocalAppPorts {
  return $script:WareHubLocalAppPorts
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

function Get-ProcessSnapshot {
  param(
    [Parameter(Mandatory = $true)][int]$ProcessId
  )

  return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Test-WareHubManagedProcess {
  param(
    [Parameter(Mandatory = $true)][int]$ProcessId
  )

  $visitedIds = New-Object System.Collections.Generic.HashSet[int]
  $currentId = $ProcessId

  while ($currentId -gt 0 -and $visitedIds.Add($currentId)) {
    $snapshot = Get-ProcessSnapshot -ProcessId $currentId
    if (-not $snapshot) {
      return $false
    }

    if (
      $snapshot.ExecutablePath -like $script:WareHubManagedPathPattern -or
      $snapshot.CommandLine -like $script:WareHubManagedPathPattern
    ) {
      return $true
    }

    $currentId = [int]$snapshot.ParentProcessId
  }

  return $false
}

function Stop-ProcessTreeForPort {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][int]$ListenerProcessId
  )

  if (-not (Test-WareHubManagedProcess -ProcessId $ListenerProcessId)) {
    Write-Warning "Skipping non-WareHub listener PID $ListenerProcessId on port $Port."
    return
  }

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

    Write-Host "Stopping process $($process.ProcessName) (PID $targetId) for port $Port."
    Stop-Process -Id $targetId -Force -ErrorAction Stop
  }
}

function Stop-WareHubLocalAppProcesses {
  param(
    [int[]]$Ports = (Get-WareHubLocalAppPorts)
  )

  $stoppedAny = $false

  foreach ($port in $Ports) {
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
      }
    }
  }

  if (-not $stoppedAny) {
    Write-Host "No WareHub app listeners were running on ports $($Ports -join ', ')."
  }
}

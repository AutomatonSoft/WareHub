[CmdletBinding()]
param(
  [string]$RootEnvPath,
  [string]$OutFile,
  [switch]$Apply,
  [switch]$UpdateGitHubSecret,
  [string]$SshTarget,
  [string]$SshHost,
  [string]$SshUser,
  [int]$SshPort = 22,
  [string]$StagePath = "/opt/warehub/stage",
  [string]$GitHubEnvironment = "stage",
  [string]$GitHubSecretName = "STAGE_ENV_FILE"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot "common.ps1")

$repoRoot = Get-EnvironmentRepoRoot -ScriptPath $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($RootEnvPath)) {
  $RootEnvPath = Join-Path $repoRoot ".env"
}

$buildScript = Join-Path $PSScriptRoot "build-stage-env.ps1"
$composeFile = Join-Path $repoRoot "infra\deploy\stage\docker-compose.yml"
$gatewayValidator = Join-Path $repoRoot "infra\scripts\verify-gateway-only-ports.py"
$generatedHere = $false
if ([string]::IsNullOrWhiteSpace($OutFile)) {
  $OutFile = New-TemporaryEnvFilePath -Prefix "warehub-stage-sync"
  $generatedHere = $true
}

function Resolve-SshTarget {
  if (-not [string]::IsNullOrWhiteSpace($SshTarget)) {
    return $SshTarget
  }

  if (-not [string]::IsNullOrWhiteSpace($SshHost) -and -not [string]::IsNullOrWhiteSpace($SshUser)) {
    return "$SshUser@$SshHost"
  }

  throw "Provide -SshTarget or both -SshHost and -SshUser when -Apply is used."
}

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [string]$FailureLabel = $FilePath
  )

  & $FilePath @ArgumentList
  Assert-SuccessfulExitCode -ExitCode $LASTEXITCODE -Action $FailureLabel
}

try {
  & $buildScript -RootEnvPath $RootEnvPath -OutFile $OutFile

  Invoke-Native -FilePath "docker" -ArgumentList @("compose", "--env-file", $OutFile, "-f", $composeFile, "config", "--quiet") -FailureLabel "Stage docker compose config"
  Invoke-Native -FilePath "python" -ArgumentList @($gatewayValidator, "--compose", $composeFile, "--env-file", $OutFile, "--expected-gateway-port", "8940") -FailureLabel "Gateway-only port validation"

  Write-Host "Stage env dry-run validation passed."
  Write-Host "Generated env file: $OutFile"

  if ($Apply) {
    $target = Resolve-SshTarget
    $remoteIncomingPath = "$StagePath/.env.sync-new"
    $backupTimestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
    $remoteCommand = @"
set -euo pipefail
umask 077
stage_path='$StagePath'
backup_dir='/opt/warehub/backups/stage'
mkdir -p "\$backup_dir"
if [ -f "\$stage_path/.env" ]; then
  cp "\$stage_path/.env" "\$backup_dir/stage-env-$backupTimestamp.env"
fi
mv '$remoteIncomingPath' "\$stage_path/.env"
chmod 600 "\$stage_path/.env"
"@

    Invoke-Native -FilePath "scp" -ArgumentList @("-P", "$SshPort", $OutFile, "${target}:$remoteIncomingPath") -FailureLabel "Stage env upload"
    Invoke-Native -FilePath "ssh" -ArgumentList @("-p", "$SshPort", $target, $remoteCommand) -FailureLabel "Stage env apply"
    Write-Host "Applied generated stage env to $StagePath/.env with a remote backup."
  } else {
    Write-Host "Dry-run only. Re-run with -Apply to upload and replace the remote stage env."
  }

  if ($UpdateGitHubSecret) {
    $content = [System.IO.File]::ReadAllText($OutFile)
    $content | & gh secret set $GitHubSecretName --env $GitHubEnvironment
    Assert-SuccessfulExitCode -ExitCode $LASTEXITCODE -Action "GitHub stage env secret update"
    Write-Host "Updated GitHub environment secret $GitHubSecretName in $GitHubEnvironment."
  }
} finally {
  if ($generatedHere -and (Test-Path -LiteralPath $OutFile)) {
    Remove-Item -LiteralPath $OutFile -Force -ErrorAction SilentlyContinue
  }
}

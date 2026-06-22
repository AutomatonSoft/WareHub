$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
$buildScript = Join-Path $repoRoot "scripts\environment\build-stage-env.ps1"
$validateScript = Join-Path $repoRoot "scripts\environment\validate-root-env.ps1"
$templatePath = Join-Path $repoRoot "infra\deploy\stage\env.stage.sanitized.template"
$powerShellExecutable = if (Get-Command powershell -ErrorAction SilentlyContinue) {
  (Get-Command powershell -ErrorAction Stop).Source
} elseif (Get-Command pwsh -ErrorAction SilentlyContinue) {
  (Get-Command pwsh -ErrorAction Stop).Source
} else {
  throw "Unable to find a PowerShell executable."
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("warehub-root-env-tools-tests-" + [guid]::NewGuid().ToString("N"))
$script:failures = [System.Collections.Generic.List[string]]::new()

function New-ConcreteStageRootEnvLines {
  $lines = Get-Content -LiteralPath $templatePath
  return @(
    foreach ($line in $lines) {
      if ($line -match "^\s*#" -or [string]::IsNullOrWhiteSpace($line)) {
        $line
        continue
      }

      $updated = $line.Replace("__SET_OUTSIDE_GIT__", "runtime-secret").Replace("stage-CHANGE_ME", "stage-test")
      $updated
    }
  )
}

function Write-Fixture {
  param(
    [string]$Name,
    [string[]]$Lines
  )

  $path = Join-Path $tempRoot $Name
  $content = ($Lines -join "`n") + "`n"
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
  return $path
}

function Invoke-PowerShellFile {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$ArgumentList = @(),
    [hashtable]$Environment = @{}
  )

  $stdoutPath = Join-Path $tempRoot ("stdout-" + [guid]::NewGuid().ToString("N") + ".log")
  $stderrPath = Join-Path $tempRoot ("stderr-" + [guid]::NewGuid().ToString("N") + ".log")

  try {
    $originalEnvironment = @{}
    foreach ($entry in $Environment.GetEnumerator()) {
      $originalEnvironment[$entry.Key] = [System.Environment]::GetEnvironmentVariable($entry.Key, "Process")
      [System.Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
    }

    $process = Start-Process `
      -FilePath $powerShellExecutable `
      -ArgumentList (@("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ScriptPath) + $ArgumentList) `
      -WorkingDirectory $repoRoot `
      -NoNewWindow `
      -Wait `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { [System.IO.File]::ReadAllText($stdoutPath) } else { "" }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { [System.IO.File]::ReadAllText($stderrPath) } else { "" }

    return [pscustomobject]@{
      ExitCode = $process.ExitCode
      Stdout = $stdout
      Stderr = $stderr
    }
  } finally {
    foreach ($entry in $Environment.GetEnumerator()) {
      [System.Environment]::SetEnvironmentVariable($entry.Key, $originalEnvironment[$entry.Key], "Process")
    }
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-ExitCode {
  param($Result, [int]$Expected)

  if ($Result.ExitCode -ne $Expected) {
    throw "Expected exit code $Expected, got $($Result.ExitCode).`nSTDOUT:`n$($Result.Stdout)`nSTDERR:`n$($Result.Stderr)"
  }
}

function Test-Case {
  param([string]$Name, [scriptblock]$Body)

  try {
    & $Body
    Write-Host "PASS $Name"
  } catch {
    [void]$script:failures.Add("$Name`: $($_.Exception.Message)")
    Write-Host "FAIL $Name`: $($_.Exception.Message)"
  }
}

try {
  New-Item -ItemType Directory -Path $tempRoot | Out-Null

  Test-Case "build-stage-env generates LF utf8-no-bom output" {
    $rootEnvPath = Write-Fixture "root-valid.env" (New-ConcreteStageRootEnvLines)
    $outFile = Join-Path $tempRoot "stage-generated.env"
    $result = Invoke-PowerShellFile -ScriptPath $buildScript -ArgumentList @("-RootEnvPath", $rootEnvPath, "-OutFile", $outFile)
    Assert-ExitCode $result 0
    Assert-True (Test-Path -LiteralPath $outFile) "Generated env file was not created."

    $bytes = [System.IO.File]::ReadAllBytes($outFile)
    Assert-True (-not ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)) "Generated env file has a UTF-8 BOM."
    $raw = [System.IO.File]::ReadAllText($outFile)
    Assert-True (-not $raw.Contains("`r")) "Generated env file must use LF line endings."
  }

  Test-Case "build-stage-env fails when root env misses a required stage key" {
    $lines = New-ConcreteStageRootEnvLines | Where-Object { $_ -notmatch '^STAGE_SMTP_HOST=' }
    $rootEnvPath = Write-Fixture "root-missing-stage-key.env" $lines
    $result = Invoke-PowerShellFile -ScriptPath $buildScript -ArgumentList @("-RootEnvPath", $rootEnvPath)
    Assert-ExitCode $result 1
    Assert-True (($result.Stdout + $result.Stderr) -match "STAGE_SMTP_HOST") "Missing stage key was not reported."
  }

  Test-Case "build-stage-env rejects runtime placeholders from root env" {
    $lines = New-ConcreteStageRootEnvLines | ForEach-Object {
      if ($_ -match '^AFTERBUY_JV_LOGIN=') { 'AFTERBUY_JV_LOGIN=CHANGE_ME' } else { $_ }
    }
    $rootEnvPath = Write-Fixture "root-placeholder.env" $lines
    $result = Invoke-PowerShellFile -ScriptPath $buildScript -ArgumentList @("-RootEnvPath", $rootEnvPath)
    Assert-ExitCode $result 1
    Assert-True (($result.Stdout + $result.Stderr) -match "AFTERBUY_JV_LOGIN") "Placeholder rejection did not name the key."
  }

  Test-Case "validate-root-env runs compose and gateway checks" {
    $stubDir = Join-Path $tempRoot "bin"
    New-Item -ItemType Directory -Path $stubDir -Force | Out-Null
    $dockerLog = Join-Path $tempRoot "docker.log"
    $pythonLog = Join-Path $tempRoot "python.log"
    Set-Content -LiteralPath (Join-Path $stubDir "docker.cmd") -Value "@echo off`n>> ""$dockerLog"" echo %*`nexit /b 0`n" -NoNewline
    Set-Content -LiteralPath (Join-Path $stubDir "python.cmd") -Value "@echo off`n>> ""$pythonLog"" echo %*`nexit /b 0`n" -NoNewline

    $rootEnvPath = Write-Fixture "root-validate.env" (New-ConcreteStageRootEnvLines)
    $envMap = @{
      PATH = "$stubDir;$($env:PATH)"
    }
    $result = Invoke-PowerShellFile -ScriptPath $validateScript -ArgumentList @("-RootEnvPath", $rootEnvPath) -Environment $envMap
    Assert-ExitCode $result 0

    $dockerArgs = Get-Content -LiteralPath $dockerLog -Raw
    $pythonArgs = Get-Content -LiteralPath $pythonLog -Raw
    Assert-True ($dockerArgs -match "compose --env-file") "validate-root-env did not run docker compose validation."
    Assert-True ($dockerArgs -match "config --quiet") "validate-root-env did not run docker compose config --quiet."
    Assert-True ($pythonArgs -match "verify-gateway-only-ports.py") "validate-root-env did not run gateway-only port validation."
  }

  Test-Case "build-stage-env failure does not print secret values" {
    $secret = "super-sensitive-stage-secret"
    $lines = New-ConcreteStageRootEnvLines | ForEach-Object {
      if ($_ -match '^SERVICES_SECRET_KEY=') { "SERVICES_SECRET_KEY=$secret" }
      elseif ($_ -match '^STAGE_GATEWAY_PORT=') { 'STAGE_GATEWAY_PORT=not-a-port' }
      else { $_ }
    }
    $rootEnvPath = Write-Fixture "root-secret-redaction.env" $lines
    $result = Invoke-PowerShellFile -ScriptPath $buildScript -ArgumentList @("-RootEnvPath", $rootEnvPath)
    Assert-ExitCode $result 1
    Assert-True (-not (($result.Stdout + $result.Stderr).Contains($secret))) "Secret value was printed."
  }
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}

if ($script:failures.Count -gt 0) {
  Write-Error "root env tools tests failed: $($script:failures.Count)"
  foreach ($failure in $script:failures) {
    Write-Error "- $failure"
  }
  exit 1
}

Write-Host "root env tools tests passed."

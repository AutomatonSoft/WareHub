[CmdletBinding()]
param()

Set-StrictMode -Version Latest

function Get-EnvironmentRepoRoot {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath
  )

  return [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $ScriptPath) "..\.."))
}

function ConvertTo-DotenvComparableValue {
  param(
    [AllowEmptyString()][string]$Value
  )

  $trimmed = if ($null -eq $Value) { "" } else { $Value.Trim() }
  if (($trimmed.Length -ge 2) -and (
      (($trimmed.StartsWith('"')) -and ($trimmed.EndsWith('"'))) -or
      (($trimmed.StartsWith("'")) -and ($trimmed.EndsWith("'")))
    )) {
    return $trimmed.Substring(1, $trimmed.Length - 2)
  }

  return $trimmed
}

function ConvertFrom-DotenvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Dotenv file not found: $Path"
  }

  $content = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path))
  $lines = [System.Text.RegularExpressions.Regex]::Split($content, "`r`n|`n|`r")
  $values = @{}
  $lineNumbers = @{}
  $keyOrder = [System.Collections.Generic.List[string]]::new()
  $findings = [System.Collections.Generic.List[string]]::new()

  for ($index = 0; $index -lt $lines.Count; $index++) {
    $lineNumber = $index + 1
    $line = $lines[$index]
    if ($lineNumber -eq 1) {
      $line = $line.TrimStart([char]0xFEFF)
    }

    if ([string]::IsNullOrWhiteSpace($line) -or $line -match '^\s*#') {
      continue
    }

    if ($line -notmatch '^\s*(?:export\s+)?(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      [void]$findings.Add("Malformed env line at line $lineNumber.")
      continue
    }

    $key = $matches.key
    $value = $matches.value
    if ($values.ContainsKey($key)) {
      [void]$findings.Add("Duplicate key $key on line $lineNumber; first defined on line $($lineNumbers[$key]).")
      continue
    }

    $values[$key] = $value
    $lineNumbers[$key] = $lineNumber
    [void]$keyOrder.Add($key)
  }

  return [pscustomobject]@{
    Path = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path))
    Values = $values
    LineNumbers = $lineNumbers
    KeyOrder = @($keyOrder)
    Findings = @($findings)
  }
}

function Get-DotenvKeysInOrder {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  $parsed = ConvertFrom-DotenvFile -Path $Path
  if ($parsed.Findings.Count -gt 0) {
    throw "Dotenv schema file is invalid: $Path`n- $($parsed.Findings -join "`n- ")"
  }

  return $parsed.KeyOrder
}

function Write-DotenvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Lines
  )

  $directory = Split-Path -Parent $Path
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $content = ((@($Lines) -join "`n")) + "`n"
  [System.IO.File]::WriteAllText($Path, $content, $utf8NoBom)
}

function Test-EnvPlaceholderValue {
  param(
    [AllowEmptyString()][string]$Value
  )

  $markers = @(
    'CHANGE_ME',
    '__SET_OUTSIDE_GIT__',
    '**SET_OUTSIDE_GIT**',
    '__SET_IN_GITHUB_ENVIRONMENT__',
    'TODO',
    'TODO_SECRET',
    'TODO_UNKNOWN'
  )

  $comparable = ConvertTo-DotenvComparableValue -Value $Value
  foreach ($marker in $markers) {
    if ($comparable.IndexOf($marker, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
  }

  return $false
}

function New-TemporaryEnvFilePath {
  param(
    [string]$Prefix = "warehub-stage-env"
  )

  $fileName = "$Prefix-$([guid]::NewGuid().ToString('N')).env"
  return Join-Path ([System.IO.Path]::GetTempPath()) $fileName
}

function Resolve-EnvironmentPowerShellExecutable {
  $windowsPowerShell = Get-Command powershell -ErrorAction SilentlyContinue
  if ($windowsPowerShell) {
    return $windowsPowerShell.Source
  }

  $pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
  if ($pwsh) {
    return $pwsh.Source
  }

  throw "Unable to find a PowerShell executable."
}

function Assert-SuccessfulExitCode {
  param(
    [Parameter(Mandatory = $true)][int]$ExitCode,
    [Parameter(Mandatory = $true)][string]$Action
  )

  if ($ExitCode -ne 0) {
    throw "$Action failed with exit code $ExitCode."
  }
}

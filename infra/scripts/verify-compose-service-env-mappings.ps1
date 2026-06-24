param(
  [Parameter(Mandatory = $true)]
  [string]$ComposePath,

  [ValidateSet('stage', 'prod')]
  [string]$Environment = 'stage'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ComposePath -PathType Leaf)) {
  Write-Error "Compose file not found: $ComposePath"
  exit 1
}

$expectedMappingsByEnvironment = @{
  stage = @{
    backend = @{
      UPLOAD_STORAGE_BACKEND = 'BACKEND_UPLOAD_STORAGE_BACKEND'
      UPLOAD_FTP_HOST = 'BACKEND_UPLOAD_FTP_HOST'
      UPLOAD_FTP_USER = 'BACKEND_UPLOAD_FTP_USER'
      UPLOAD_FTP_PASS = 'BACKEND_UPLOAD_FTP_PASS'
      UPLOAD_FTP_PORT = 'BACKEND_UPLOAD_FTP_PORT'
      UPLOAD_FTP_ROOT_DIR = 'BACKEND_UPLOAD_FTP_ROOT_DIR'
      UPLOAD_FTP_STORAGE_ROOT_DIR = 'BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR'
      UPLOAD_FTP_AVATAR_DIR = 'BACKEND_UPLOAD_FTP_AVATAR_DIR'
      UPLOAD_FTP_PUBLIC_BASE_URL = 'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL'
    }
    services = @{
      UPLOAD_STORAGE_BACKEND = 'BACKEND_UPLOAD_STORAGE_BACKEND'
      UPLOAD_FTP_HOST = 'BACKEND_UPLOAD_FTP_HOST'
      UPLOAD_FTP_USER = 'BACKEND_UPLOAD_FTP_USER'
      UPLOAD_FTP_PASS = 'BACKEND_UPLOAD_FTP_PASS'
      UPLOAD_FTP_PORT = 'BACKEND_UPLOAD_FTP_PORT'
      UPLOAD_FTP_ROOT_DIR = 'BACKEND_UPLOAD_FTP_ROOT_DIR'
      UPLOAD_FTP_STORAGE_ROOT_DIR = 'BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR'
      UPLOAD_FTP_AVATAR_DIR = 'BACKEND_UPLOAD_FTP_AVATAR_DIR'
      UPLOAD_FTP_PUBLIC_BASE_URL = 'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL'
    }
  }
  prod = @{
    backend = @{
      UPLOAD_STORAGE_BACKEND = 'BACKEND_UPLOAD_STORAGE_BACKEND'
      UPLOAD_FTP_HOST = 'BACKEND_UPLOAD_FTP_HOST'
      UPLOAD_FTP_USER = 'BACKEND_UPLOAD_FTP_USER'
      UPLOAD_FTP_PASS = 'BACKEND_UPLOAD_FTP_PASS'
      UPLOAD_FTP_PORT = 'BACKEND_UPLOAD_FTP_PORT'
      UPLOAD_FTP_ROOT_DIR = 'BACKEND_UPLOAD_FTP_ROOT_DIR'
      UPLOAD_FTP_STORAGE_ROOT_DIR = 'BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR'
      UPLOAD_FTP_AVATAR_DIR = 'BACKEND_UPLOAD_FTP_AVATAR_DIR'
      UPLOAD_FTP_PUBLIC_BASE_URL = 'BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL'
    }
    services = @{
      UPLOAD_STORAGE_BACKEND = 'BACKEND_UPLOAD_STORAGE_BACKEND'
      UPLOAD_FTP_HOST = 'BACKEND_UPLOAD_FTP_HOST'
      UPLOAD_FTP_USER = 'BACKEND_UPLOAD_FTP_USER'
      UPLOAD_FTP_PASS = 'BACKEND_UPLOAD_FTP_PASS'
      UPLOAD_FTP_PORT = 'BACKEND_UPLOAD_FTP_PORT'
      UPLOAD_FTP_ROOT_DIR = 'BACKEND_UPLOAD_FTP_ROOT_DIR'
      UPLOAD_FTP_STORAGE_ROOT_DIR = 'BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR'
      UPLOAD_FTP_AVATAR_DIR = 'BACKEND_UPLOAD_FTP_AVATAR_DIR'
      UPLOAD_FTP_PUBLIC_BASE_URL = 'BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL'
    }
  }
}

function Add-Finding {
  param(
    [System.Collections.Generic.List[string]]$Findings,
    [string]$Message
  )

  [void]$Findings.Add($Message)
}

function Get-ServiceEnvironmentMappings {
  param([string[]]$Lines)

  $services = @{}
  $inServicesSection = $false
  $currentService = $null
  $inEnvironmentBlock = $false

  foreach ($rawLine in $Lines) {
    $line = $rawLine.TrimEnd()

    if (-not $inServicesSection) {
      if ($line -match '^services:\s*$') {
        $inServicesSection = $true
      }
      continue
    }

    if ($line -match '^[^ ]' -and $line -notmatch '^services:\s*$') {
      break
    }

    if ($line -match '^  (?<service>[a-zA-Z0-9_-]+):\s*$') {
      $currentService = $matches.service
      $services[$currentService] = @{}
      $inEnvironmentBlock = $false
      continue
    }

    if ($null -eq $currentService) {
      continue
    }

    if ($line -match '^    environment:\s*$') {
      $inEnvironmentBlock = $true
      continue
    }

    if ($inEnvironmentBlock -and $line -match '^    [a-zA-Z0-9_-]+:\s*$') {
      $inEnvironmentBlock = $false
    }

    if (-not $inEnvironmentBlock) {
      continue
    }

    if ($line -match '^      (?<key>[A-Z0-9_]+):\s*(?<value>.+?)\s*$') {
      $services[$currentService][$matches.key] = $matches.value
      continue
    }

    if ($line -match '^    [^ ]') {
      $inEnvironmentBlock = $false
    }
  }

  return $services
}

$lines = [System.IO.File]::ReadAllLines((Resolve-Path -LiteralPath $ComposePath))
$serviceMappings = Get-ServiceEnvironmentMappings -Lines $lines
$expectedMappings = $expectedMappingsByEnvironment[$Environment]
$findings = [System.Collections.Generic.List[string]]::new()

foreach ($serviceName in $expectedMappings.Keys) {
  if (-not $serviceMappings.ContainsKey($serviceName)) {
    Add-Finding $findings "Missing service '$serviceName' in compose file."
    continue
  }

  $actualEnv = $serviceMappings[$serviceName]
  foreach ($envKey in $expectedMappings[$serviceName].Keys) {
    $expectedSourceKey = $expectedMappings[$serviceName][$envKey]
    if (-not $actualEnv.ContainsKey($envKey)) {
      Add-Finding $findings "Service '$serviceName' is missing environment key '$envKey'."
      continue
    }

    $actualValue = [string]$actualEnv[$envKey]
    $pattern = [regex]::Escape('${' + $expectedSourceKey)
    if ($actualValue -notmatch $pattern) {
      Add-Finding $findings "Service '$serviceName' maps '$envKey' incorrectly. Expected source '$expectedSourceKey', got '$actualValue'."
    }
  }
}

if ($findings.Count -gt 0) {
  [Console]::Error.WriteLine("Compose service env mapping validation failed for $Environment compose file: $ComposePath")
  foreach ($finding in $findings) {
    [Console]::Error.WriteLine("- $finding")
  }
  exit 1
}

Write-Host "Compose service env mapping validation passed for $Environment compose file: $ComposePath"

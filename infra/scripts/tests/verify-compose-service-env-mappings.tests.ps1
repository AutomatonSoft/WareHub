$ErrorActionPreference = 'Stop'

$validator = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\verify-compose-service-env-mappings.ps1'))
$pwshCommand = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCommand) {
  $pwsh = $pwshCommand.Source
} else {
  $pwsh = (Get-Command powershell -ErrorAction Stop).Source
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("warehub-compose-env-tests-" + [guid]::NewGuid().ToString('N'))
$script:failures = [System.Collections.Generic.List[string]]::new()

function New-ComposeLines {
  param(
    [string]$RootDirKey,
    [string]$StorageRootDirKey,
    [string]$AvatarDirKey,
    [string]$ImageDirKey,
    [string]$PublicBaseKey
  )

  $publicBaseLine = ('      UPLOAD_FTP_PUBLIC_BASE_URL: ${{{0}:-}}' -f $PublicBaseKey)

  return @(
    'services:',
    '  backend:',
    '    environment:',
    '      UPLOAD_STORAGE_BACKEND: ${BACKEND_UPLOAD_STORAGE_BACKEND:?required}',
    '      UPLOAD_FTP_HOST: ${BACKEND_UPLOAD_FTP_HOST:-}',
    '      UPLOAD_FTP_USER: ${BACKEND_UPLOAD_FTP_USER:-}',
    '      UPLOAD_FTP_PASS: ${BACKEND_UPLOAD_FTP_PASS:-}',
    '      UPLOAD_FTP_PORT: ${BACKEND_UPLOAD_FTP_PORT:-21}',
    ('      UPLOAD_FTP_ROOT_DIR: ${{{0}:-warehub}}' -f $RootDirKey),
    ('      UPLOAD_FTP_STORAGE_ROOT_DIR: ${{{0}:-}}' -f $StorageRootDirKey),
    ('      UPLOAD_FTP_AVATAR_DIR: ${{{0}:-avatar}}' -f $AvatarDirKey),
    ('      UPLOAD_FTP_IMAGE_DIR: ${{{0}:-images}}' -f $ImageDirKey),
    $publicBaseLine,
    '      AFTERBUY_JV_LOGIN: ${AFTERBUY_JV_LOGIN:-}',
    '      AFTERBUY_JV_PASS: ${AFTERBUY_JV_PASS:-}',
    '      AFTERBUY_XL_LOGIN: ${AFTERBUY_XL_LOGIN:-}',
    '      AFTERBUY_XL_PASS: ${AFTERBUY_XL_PASS:-}',
    '      AFTERBUY_CH_LOGIN: ${AFTERBUY_CH_LOGIN:-}',
    '      AFTERBUY_CH_PASS: ${AFTERBUY_CH_PASS:-}',
    '      AFTERBUY_JV_LOGIN_URL: ${AFTERBUY_JV_LOGIN_URL:-}',
    '      AFTERBUY_XL_LOGIN_URL: ${AFTERBUY_XL_LOGIN_URL:-}',
    '      AFTERBUY_CH_LOGIN_URL: ${AFTERBUY_CH_LOGIN_URL:-}',
    '      AFTERBUY_JV_COOKIE_CACHE_FILE: ${AFTERBUY_JV_COOKIE_CACHE_FILE:-}',
    '      AFTERBUY_XL_COOKIE_CACHE_FILE: ${AFTERBUY_XL_COOKIE_CACHE_FILE:-}',
    '      AFTERBUY_CH_COOKIE_CACHE_FILE: ${AFTERBUY_CH_COOKIE_CACHE_FILE:-}',
    '  services:',
    '    environment:',
    '      UPLOAD_STORAGE_BACKEND: ${BACKEND_UPLOAD_STORAGE_BACKEND:?required}',
    '      UPLOAD_FTP_HOST: ${BACKEND_UPLOAD_FTP_HOST:-}',
    '      UPLOAD_FTP_USER: ${BACKEND_UPLOAD_FTP_USER:-}',
    '      UPLOAD_FTP_PASS: ${BACKEND_UPLOAD_FTP_PASS:-}',
    '      UPLOAD_FTP_PORT: ${BACKEND_UPLOAD_FTP_PORT:-21}',
    ('      UPLOAD_FTP_ROOT_DIR: ${{{0}:-warehub}}' -f $RootDirKey),
    ('      UPLOAD_FTP_STORAGE_ROOT_DIR: ${{{0}:-}}' -f $StorageRootDirKey),
    ('      UPLOAD_FTP_AVATAR_DIR: ${{{0}:-avatar}}' -f $AvatarDirKey),
    ('      UPLOAD_FTP_IMAGE_DIR: ${{{0}:-images}}' -f $ImageDirKey),
    $publicBaseLine,
    '      AFTERBUY_JV_LOGIN: ${AFTERBUY_JV_LOGIN:-}',
    '      AFTERBUY_JV_PASS: ${AFTERBUY_JV_PASS:-}',
    '      AFTERBUY_XL_LOGIN: ${AFTERBUY_XL_LOGIN:-}',
    '      AFTERBUY_XL_PASS: ${AFTERBUY_XL_PASS:-}',
    '      AFTERBUY_CH_LOGIN: ${AFTERBUY_CH_LOGIN:-}',
    '      AFTERBUY_CH_PASS: ${AFTERBUY_CH_PASS:-}',
    '      AFTERBUY_JV_LOGIN_URL: ${AFTERBUY_JV_LOGIN_URL:-}',
    '      AFTERBUY_XL_LOGIN_URL: ${AFTERBUY_XL_LOGIN_URL:-}',
    '      AFTERBUY_CH_LOGIN_URL: ${AFTERBUY_CH_LOGIN_URL:-}',
    '      AFTERBUY_JV_COOKIE_CACHE_FILE: ${AFTERBUY_JV_COOKIE_CACHE_FILE:-}',
    '      AFTERBUY_XL_COOKIE_CACHE_FILE: ${AFTERBUY_XL_COOKIE_CACHE_FILE:-}',
    '      AFTERBUY_CH_COOKIE_CACHE_FILE: ${AFTERBUY_CH_COOKIE_CACHE_FILE:-}'
  )
}

function Write-Fixture {
  param(
    [string]$Name,
    [string[]]$Lines
  )

  $path = Join-Path $tempRoot $Name
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $path)) | Out-Null
  [System.IO.File]::WriteAllLines($path, $Lines)
  return $path
}

function Invoke-Validator {
  param(
    [string]$ComposePath,
    [string]$Environment
  )

  $stderr = Join-Path $tempRoot ([guid]::NewGuid().ToString('N') + '.stderr.txt')
  $stdout = Join-Path $tempRoot ([guid]::NewGuid().ToString('N') + '.stdout.txt')
  try {
    $arguments = @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', $validator,
      '-ComposePath', $ComposePath,
      '-Environment', $Environment
    )

    $process = Start-Process -FilePath $pwsh -ArgumentList $arguments -Wait -PassThru -NoNewWindow -RedirectStandardError $stderr -RedirectStandardOutput $stdout
    $stderrText = if (Test-Path $stderr) { [System.IO.File]::ReadAllText($stderr) } else { '' }
    $stdoutText = if (Test-Path $stdout) { [System.IO.File]::ReadAllText($stdout) } else { '' }
    return @{
      ExitCode = $process.ExitCode
      StdErr = $stderrText
      StdOut = $stdoutText
    }
  } finally {
    Remove-Item $stderr, $stdout -ErrorAction SilentlyContinue
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    [void]$script:failures.Add($Message)
  }
}

try {
  [System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null

  $validStage = Write-Fixture -Name 'valid-stage.compose.yml' -Lines (New-ComposeLines -RootDirKey 'BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR' -StorageRootDirKey 'BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR' -AvatarDirKey 'BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR' -ImageDirKey 'BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR' -PublicBaseKey 'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL')
  $validStageResult = Invoke-Validator -ComposePath $validStage -Environment stage
  Assert-True ($validStageResult.ExitCode -eq 0) "Expected valid stage compose fixture to pass. stderr: $($validStageResult.StdErr)"

  $validProd = Write-Fixture -Name 'valid-prod.compose.yml' -Lines (New-ComposeLines -RootDirKey 'BACKEND_PROD_UPLOAD_FTP_ROOT_DIR' -StorageRootDirKey 'BACKEND_PROD_UPLOAD_FTP_STORAGE_ROOT_DIR' -AvatarDirKey 'BACKEND_PROD_UPLOAD_FTP_AVATAR_DIR' -ImageDirKey 'BACKEND_PROD_UPLOAD_FTP_IMAGE_DIR' -PublicBaseKey 'BACKEND_PROD_UPLOAD_FTP_PUBLIC_BASE_URL')
  $validProdResult = Invoke-Validator -ComposePath $validProd -Environment prod
  Assert-True ($validProdResult.ExitCode -eq 0) "Expected valid prod compose fixture to pass. stderr: $($validProdResult.StdErr)"

  $brokenStageLines = New-ComposeLines -RootDirKey 'BACKEND_STAGE_UPLOAD_FTP_ROOT_DIR' -StorageRootDirKey 'BACKEND_STAGE_UPLOAD_FTP_STORAGE_ROOT_DIR' -AvatarDirKey 'BACKEND_STAGE_UPLOAD_FTP_AVATAR_DIR' -ImageDirKey 'BACKEND_STAGE_UPLOAD_FTP_IMAGE_DIR' -PublicBaseKey 'BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL'
  $seenBackendFtpHost = $false
  $filteredLines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in $brokenStageLines) {
    if ($line -eq '      UPLOAD_FTP_HOST: ${BACKEND_UPLOAD_FTP_HOST:-}' -and -not $seenBackendFtpHost) {
      $seenBackendFtpHost = $true
      [void]$filteredLines.Add($line)
      continue
    }

    if ($line -eq '      UPLOAD_FTP_HOST: ${BACKEND_UPLOAD_FTP_HOST:-}') {
      continue
    }

    [void]$filteredLines.Add($line)
  }
  $brokenStageLines = $filteredLines.ToArray()
  $brokenStage = Write-Fixture -Name 'broken-stage.compose.yml' -Lines $brokenStageLines
  $brokenStageResult = Invoke-Validator -ComposePath $brokenStage -Environment stage
  Assert-True ($brokenStageResult.ExitCode -ne 0) 'Expected broken stage compose fixture to fail.'
  Assert-True ($brokenStageResult.StdErr -match "Service 'services' is missing environment key 'UPLOAD_FTP_HOST'") "Expected missing UPLOAD_FTP_HOST finding. stderr: $($brokenStageResult.StdErr)"

  $repoStage = Invoke-Validator -ComposePath ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\deploy\stage\docker-compose.yml'))) -Environment stage
  Assert-True ($repoStage.ExitCode -eq 0) "Expected repository stage compose file to pass. stderr: $($repoStage.StdErr)"

  $repoProd = Invoke-Validator -ComposePath ([System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\deploy\prod\docker-compose.yml'))) -Environment prod
  Assert-True ($repoProd.ExitCode -eq 0) "Expected repository prod compose file to pass. stderr: $($repoProd.StdErr)"
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

if ($script:failures.Count -gt 0) {
  Write-Error "verify-compose-service-env-mappings tests failed: $($script:failures.Count)"
  foreach ($failure in $script:failures) {
    Write-Error "- $failure"
  }
  exit 1
}

Write-Host 'verify-compose-service-env-mappings tests passed.'

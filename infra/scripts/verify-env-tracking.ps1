param(
  [string]$RepoPath = '.'
)

$ErrorActionPreference = 'Stop'

$resolvedRepo = (Resolve-Path $RepoPath).Path

function Fail([string]$Message) {
  Write-Host $Message
  exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "git is not available in PATH."
}

Push-Location $resolvedRepo
try {
  & git rev-parse --is-inside-work-tree *> $null
  if ($LASTEXITCODE -ne 0) {
    Fail "Not a git repository: $resolvedRepo"
  }

  $trackedEnv = & git ls-files .env
  if ($LASTEXITCODE -ne 0) {
    Fail "FAILED: unable to inspect git index for .env"
  }
  if (-not [string]::IsNullOrWhiteSpace(($trackedEnv -join ''))) {
    Fail "FAILED: .env is tracked by git. Run: git rm --cached .env"
  }

  & git check-ignore -q .env
  if ($LASTEXITCODE -ne 0) {
    Fail "FAILED: .env is not ignored by git. Add .env to .gitignore."
  }

  Write-Host "OK: .env is not tracked and is ignored."
}
finally {
  Pop-Location
}

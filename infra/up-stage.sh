#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./up-stage.sh [stage-tag]

Examples:
  ./up-stage.sh
  ./up-stage.sh stage-latest
  ./up-stage.sh stage-abc1234
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

TAG="${1:-stage-latest}"
ENV_FILE="${ENV_FILE:-.env}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then cp "$ENV_FILE" "${ENV_FILE}.runtime.backup"; fi
git restore --staged "$ENV_FILE" 2>/dev/null || true
git restore "$ENV_FILE" 2>/dev/null || true
if [[ "${SKIP_INFRA_GIT_PULL:-0}" != "1" ]]; then
  if git pull --ff-only; then
    echo "Infra repository updated."
  else
    echo "WARNING: git pull failed. Continuing with current infra checkout."
    echo "If this host has no git credentials, set SKIP_INFRA_GIT_PULL=1 or configure deploy key/token."
  fi
else
  echo "SKIP_INFRA_GIT_PULL=1: skipping git pull"
fi
if [[ -f "${ENV_FILE}.runtime.backup" ]]; then mv "${ENV_FILE}.runtime.backup" "$ENV_FILE"; fi
"$SCRIPT_DIR/scripts/release-stage.sh" --tag "$TAG" --env-file "$ENV_FILE"


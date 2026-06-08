#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/enqueue-deploy.sh --env <stage|prod> --version <tag>

Examples:
  ./scripts/enqueue-deploy.sh --env stage --version v0.4.4-stage.7
  ./scripts/enqueue-deploy.sh --env prod --version v0.4.5
EOF
}

TARGET_ENV=""
VERSION=""
REQUEST_DIR="${REQUEST_DIR:-.deploy-requests}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) TARGET_ENV="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --request-dir) REQUEST_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ "$TARGET_ENV" != "stage" && "$TARGET_ENV" != "prod" ]]; then
  echo "--env must be one of: stage, prod"
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  echo "--version is required"
  exit 1
fi

if [[ "$TARGET_ENV" == "stage" ]]; then
  if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-stage\.[0-9]+$ ]]; then
    echo "Invalid stage version: $VERSION (expected vX.Y.Z-stage.N)"
    exit 1
  fi
else
  if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Invalid prod version: $VERSION (expected vX.Y.Z)"
    exit 1
  fi
fi

mkdir -p "$REQUEST_DIR"
request_file="$REQUEST_DIR/${TARGET_ENV}.request"
tmp_file="$request_file.tmp.$$"

printf '%s\n' "$VERSION" > "$tmp_file"
mv -f "$tmp_file" "$request_file"

echo "Enqueued ${TARGET_ENV} deploy request: $VERSION"

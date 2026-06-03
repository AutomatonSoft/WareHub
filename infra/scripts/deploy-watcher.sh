#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
REQUEST_DIR="${REQUEST_DIR:-.deploy-requests}"
STATE_DIR="${STATE_DIR:-.deploy-state}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-20}"
WATCHER_SKIP_INFRA_GIT_PULL="${WATCHER_SKIP_INFRA_GIT_PULL:-1}"

mkdir -p "$REQUEST_DIR" "$STATE_DIR"

LOCK_FILE="$STATE_DIR/watcher.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deploy watcher process is already running."
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

get_env_value() {
  local key="$1"
  local value
  value="$(grep "^${key}=" "$ENV_FILE" | cut -d'=' -f2- | tail -n1 || true)"
  if [[ -z "$value" ]]; then
    echo "Missing key '$key' in $ENV_FILE"
    exit 1
  fi
  printf '%s' "$value"
}

is_stage_version() {
  [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-stage\.[0-9]+$ ]]
}

is_prod_version() {
  [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

image_exists() {
  local image_ref="$1"
  docker manifest inspect "$image_ref" >/dev/null 2>&1
}

wait_for_images_for_target() {
  local target="$1"
  local version="$2"

  local backend_image
  local frontend_image
  local mobile_image
  local services_image
  backend_image="$(get_env_value "BACKEND_IMAGE")"
  frontend_image="$(get_env_value "FRONTEND_IMAGE")"
  mobile_image="$(get_env_value "MOBILE_IMAGE")"
  services_image="$(get_env_value "SERVICES_IMAGE")"

  local refs=(
    "${backend_image}:${version}"
    "${frontend_image}:${version}"
    "${mobile_image}:${version}"
    "${services_image}:${version}"
  )

  local tries=0
  while true; do
    local request_file="$REQUEST_DIR/${target}.request"
    if [[ -f "$request_file" ]]; then
      local latest
      latest="$(tr -d '\r\n' < "$request_file")"
      if [[ -n "$latest" && "$latest" != "$version" ]]; then
        echo "Newer ${target} request detected: $latest (was waiting for $version). Restarting wait."
        return 10
      fi
    fi

    local missing=0
    for ref in "${refs[@]}"; do
      if image_exists "$ref"; then
        echo "Image available: $ref"
      else
        echo "Image not yet available: $ref"
        missing=1
      fi
    done

    if [[ "$missing" -eq 0 ]]; then
      return 0
    fi

    tries=$((tries + 1))
    echo "Waiting for ${target} images for version ${version} (attempt $tries)..."
    sleep "$POLL_INTERVAL_SECONDS"
  done
}

run_deploy() {
  local target="$1"
  local version="$2"

  if [[ "$target" == "stage" ]]; then
    SKIP_INFRA_GIT_PULL="$WATCHER_SKIP_INFRA_GIT_PULL" ./up-stage.sh "$version"
  else
    SKIP_INFRA_GIT_PULL="$WATCHER_SKIP_INFRA_GIT_PULL" ./up-prod.sh "$version"
  fi
}

mark_success() {
  local target="$1"
  local version="$2"
  echo "$version" > "$STATE_DIR/${target}.last"
}

process_target() {
  local target="$1"
  local request_file="$REQUEST_DIR/${target}.request"
  local state_file="$STATE_DIR/${target}.last"

  [[ -f "$request_file" ]] || return 0

  local requested
  requested="$(tr -d '\r\n' < "$request_file")"
  if [[ -z "$requested" ]]; then
    echo "Empty request in $request_file; removing."
    rm -f "$request_file"
    return 0
  fi

  if [[ "$target" == "stage" ]]; then
    if ! is_stage_version "$requested"; then
      echo "Invalid stage request version: $requested. Removing request."
      rm -f "$request_file"
      return 0
    fi
  else
    if ! is_prod_version "$requested"; then
      echo "Invalid prod request version: $requested. Removing request."
      rm -f "$request_file"
      return 0
    fi
  fi

  if [[ -f "$state_file" ]]; then
    local deployed
    deployed="$(tr -d '\r\n' < "$state_file")"
    if [[ "$deployed" == "$requested" ]]; then
      echo "Request $target/$requested already deployed. Clearing request."
      rm -f "$request_file"
      return 0
    fi
  fi

  echo "Processing ${target} deploy request: $requested"
  local wait_rc=0
  wait_for_images_for_target "$target" "$requested" || wait_rc=$?
  if [[ "$wait_rc" -eq 10 ]]; then
    return 0
  fi
  if [[ "$wait_rc" -ne 0 ]]; then
    echo "Failed while waiting images for $target/$requested"
    return 1
  fi

  echo "All images for ${target}/${requested} are available. Starting deploy..."
  if run_deploy "$target" "$requested"; then
    echo "Deploy succeeded: ${target}/${requested}"
    mark_success "$target" "$requested"
    if [[ -f "$request_file" ]]; then
      local current
      current="$(tr -d '\r\n' < "$request_file")"
      if [[ "$current" == "$requested" ]]; then
        rm -f "$request_file"
      fi
    fi
    return 0
  fi

  echo "Deploy failed for ${target}/${requested}. Will retry."
  return 1
}

echo "Deploy watcher started. root=$ROOT_DIR request_dir=$REQUEST_DIR state_dir=$STATE_DIR"
while true; do
  process_target "stage" || true
  process_target "prod" || true
  sleep "$POLL_INTERVAL_SECONDS"
done

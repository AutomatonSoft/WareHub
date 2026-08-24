#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="$repo_root/infra/local/docker-compose.dev.yml"
root_env_path="$repo_root/.env"
local_dev_log_directory="$repo_root/logs/local-dev"
app_pid_filenames=(
  "frontend.pid"
  "backend.pid"
  "database-service.pid"
  "database-service-jv-worker.pid"
  "database-service-telegram-notifier.pid"
  "orchestrator.pid"
)

info() {
  printf '%s\n' "$*"
}

warn() {
  printf 'Warning: %s\n' "$*" >&2
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

assert_repo_root() {
  local current expected
  current="$(pwd -P)"
  expected="$(cd "$repo_root" && pwd -P)"

  if [[ "$current" != "$expected" ]]; then
    die "Run stop-dev-mac.sh from repo root: $expected"
  fi
}

assert_docker() {
  command_exists docker || die "docker is not available on PATH."
  docker compose version >/dev/null
}

assert_root_env_file() {
  [[ -f "$root_env_path" ]] || die "Missing root .env file: $root_env_path"
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

import_root_env() {
  local raw_line line key value

  while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="${raw_line%$'\r'}"
    [[ -z "$(trim_whitespace "$line")" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="$(trim_whitespace "${BASH_REMATCH[2]}")"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
      export "$key=$value"
    fi
  done <"$root_env_path"
}

assert_compose_config() {
  docker compose -f "$compose_file" config >/dev/null
}

get_listening_process_ids_for_port() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

stop_pid_file_process() {
  local pid_path="$1"
  [[ -f "$pid_path" ]] || return 0
  local process_id
  process_id="$(tr -d '[:space:]' <"$pid_path")"
  if [[ -n "$process_id" ]] && kill -0 "$process_id" 2>/dev/null; then
    info "Stopping process PID $process_id from PID file $(basename "$pid_path")."
    kill -TERM "$process_id" 2>/dev/null || true
  fi
  rm -f "$pid_path"
}

stop_warehub_local_app_processes() {
  local ports=(8931 8932 8934 8935)
  local stopped_any=false
  local port attempt process_ids pid_filename

  for port in "${ports[@]}"; do
    local port_stopped=false

    for attempt in {1..5}; do
      process_ids="$(get_listening_process_ids_for_port "$port")"
      if [[ -z "$process_ids" ]]; then
        if [[ "$port_stopped" == false && "$attempt" -eq 1 ]]; then
          info "No listener found on port $port."
        fi
        port_stopped=true
        break
      fi

      while IFS= read -r process_id; do
        [[ -n "$process_id" ]] || continue
        info "Stopping process PID $process_id for port $port."
        kill -TERM "$process_id" 2>/dev/null || true
        stopped_any=true
      done <<<"$process_ids"

      sleep 1
    done

    if [[ "$port_stopped" == false ]]; then
      process_ids="$(get_listening_process_ids_for_port "$port")"
      if [[ -n "$process_ids" ]]; then
        warn "Port $port still has listeners after stop attempts: $(echo "$process_ids" | paste -sd ', ' -)"
      fi
    fi
  done

  for pid_filename in "${app_pid_filenames[@]}"; do
    if [[ -f "$local_dev_log_directory/$pid_filename" ]]; then
      stop_pid_file_process "$local_dev_log_directory/$pid_filename"
      stopped_any=true
    fi
  done

  if [[ "$stopped_any" == false ]]; then
    info "No WareHub app listeners were running on ports 8931, 8932, 8934, 8935."
  fi
}

assert_repo_root
assert_docker
assert_root_env_file
import_root_env
assert_compose_config

stop_warehub_local_app_processes

info "Stopping WareHub local dependencies from $compose_file"
docker compose -f "$compose_file" down
info "Local dependencies are stopped."

#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

if [ "$#" -ne 4 ]; then
  fail "usage: $0 <candidate-dir> <live-stage-dir> <compose-project-name> <expected-gateway-port>"
fi

candidate_arg="$1"
live_stage_arg="$2"
compose_project_name="$3"
expected_gateway_port="$4"
cleanup_enabled=0
candidate_dir=""

cleanup() {
  if [ "$cleanup_enabled" -eq 1 ] && [[ "$candidate_dir" == /tmp/warehub-stage-preflight.* ]]; then
    rm -rf -- "$candidate_dir"
  fi
}
trap cleanup EXIT

[ -n "$candidate_arg" ] || fail "candidate directory path is empty"
[ -n "$live_stage_arg" ] || fail "live stage directory path is empty"
[ -d "$candidate_arg" ] || fail "candidate directory not found"
[ -d "$live_stage_arg" ] || fail "live stage directory not found"
[ ! -L "${candidate_arg%/}" ] || fail "candidate directory must not be a symlink"
[[ "$expected_gateway_port" =~ ^[0-9]+$ ]] || fail "expected gateway port must be numeric"
[ "$compose_project_name" = "warehub-stage" ] || fail "compose project name must be warehub-stage"

candidate_dir="$(realpath "$candidate_arg")"
live_stage_dir="$(realpath "$live_stage_arg")"

case "$candidate_dir" in
  /tmp/warehub-stage-preflight.*) ;;
  *) fail "candidate directory must be under /tmp/warehub-stage-preflight.*" ;;
esac

if [ "$candidate_dir" = "$live_stage_dir" ]; then
  fail "candidate directory must not equal the live stage directory"
fi

if [[ "$candidate_dir" == "$live_stage_dir"/* ]]; then
  fail "candidate directory must not be inside the live stage directory"
fi

if [[ "$live_stage_dir" == "$candidate_dir"/* ]]; then
  fail "live stage directory must not be inside the candidate directory"
fi

cleanup_enabled=1

candidate_env="$candidate_dir/.env"
candidate_compose="$candidate_dir/docker-compose.yml"
gateway_validator="$candidate_dir/verify-gateway-only-ports.py"
candidate_helper="$candidate_dir/run-isolated-compose-preflight.sh"
candidate_manifest="$candidate_dir/candidate.sha256"
live_env="$live_stage_dir/.env"
live_compose="$live_stage_dir/docker-compose.yml"

[ -f "$candidate_env" ] || fail "candidate env file not found"
[ -f "$candidate_compose" ] || fail "candidate compose file not found"
[ -f "$gateway_validator" ] || fail "gateway port validator not found"
[ -f "$candidate_helper" ] || fail "candidate helper script not found"
[ -f "$candidate_manifest" ] || fail "candidate checksum manifest not found"
[ -f "$live_env" ] || fail "live stage env file not found"
[ -f "$live_compose" ] || fail "live stage compose file not found"

[ ! -L "$candidate_env" ] || fail "candidate env file must not be a symlink"
[ ! -L "$candidate_compose" ] || fail "candidate compose file must not be a symlink"
[ ! -L "$gateway_validator" ] || fail "gateway validator must not be a symlink"
[ ! -L "$candidate_helper" ] || fail "candidate helper script must not be a symlink"
[ ! -L "$candidate_manifest" ] || fail "candidate checksum manifest must not be a symlink"
[ ! -L "$0" ] || fail "executed helper path must not be a symlink"

require_direct_candidate_file() {
  local path="$1"
  local expected_name="$2"
  local resolved
  resolved="$(realpath "$path")"

  if [ "$(dirname "$resolved")" != "$candidate_dir" ] || [ "$(basename "$resolved")" != "$expected_name" ]; then
    fail "$expected_name must resolve directly inside the candidate directory"
  fi
}

require_direct_candidate_file "$candidate_env" ".env"
require_direct_candidate_file "$candidate_compose" "docker-compose.yml"
require_direct_candidate_file "$gateway_validator" "verify-gateway-only-ports.py"
require_direct_candidate_file "$candidate_helper" "run-isolated-compose-preflight.sh"
require_direct_candidate_file "$candidate_manifest" "candidate.sha256"

if grep -Eq '^[[:space:]]*(env_file|extends|include)[[:space:]]*:' "$candidate_compose"; then
  fail "candidate Compose must not use env_file, extends, or include"
fi

container_ids_all() {
  docker ps -a \
    --filter "label=com.docker.compose.project=$compose_project_name" \
    --format '{{.ID}}' |
    sort
}

container_ids_running() {
  docker ps \
    --filter "label=com.docker.compose.project=$compose_project_name" \
    --format '{{.ID}}' |
    sort
}

live_hash_before="$(sha256sum "$live_env" "$live_compose")"
containers_all_before="$(container_ids_all)"
containers_running_before="$(container_ids_running)"

cd "$candidate_dir"

docker compose \
  --project-name "$compose_project_name" \
  --env-file "$candidate_env" \
  -f "$candidate_compose" \
  config --quiet

python3 "$gateway_validator" \
  --compose "$candidate_compose" \
  --env-file "$candidate_env" \
  --expected-gateway-port "$expected_gateway_port"

live_hash_after="$(sha256sum "$live_env" "$live_compose")"
containers_all_after="$(container_ids_all)"
containers_running_after="$(container_ids_running)"

if [ "$live_hash_before" != "$live_hash_after" ]; then
  fail "live stage env or compose file changed during preflight"
fi

if [ "$containers_all_before" != "$containers_all_after" ]; then
  fail "compose project container set changed during preflight"
fi

if [ "$containers_running_before" != "$containers_running_after" ]; then
  fail "compose project running container set changed during preflight"
fi

printf 'Isolated stage compose preflight passed without live file or container changes.\n'

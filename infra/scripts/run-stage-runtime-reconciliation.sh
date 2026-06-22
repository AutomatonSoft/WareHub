#!/usr/bin/env bash
set -Eeuo pipefail

EXIT_SUCCESS=0
EXIT_PRE_MUTATION_FAILURE=10
EXIT_ROLLBACK_SUCCEEDED=20
EXIT_ROLLBACK_FAILED=30
EXIT_SECURITY_FAILURE=40
EXIT_CLEANUP_INCOMPLETE=50

STATE_PRE_MUTATION="PRE_MUTATION"
STATE_PROMOTION_STARTED="PROMOTION_STARTED"
STATE_PROMOTED="PROMOTED"
STATE_GATEWAY_RECREATED="GATEWAY_RECREATED"
STATE_VALIDATED="VALIDATED"
STATE_ROLLBACK_RUNNING="ROLLBACK_RUNNING"
STATE_ROLLED_BACK="ROLLED_BACK"
STATE_COMPLETED="COMPLETED"

log_error() {
  printf 'ERROR: %s\n' "$*" >&2
}

log_status() {
  printf '%s\n' "$*" >&2
}

candidate_dir=""
live_stage_dir=""
backup_dir=""
live_env=""
live_compose=""
live_gateway_candidate_env=""
live_gateway_candidate_compose=""
state="$STATE_PRE_MUTATION"
rollback_invocations=0
rollback_running=0
rollback_completed=0
failure_context=""

if [ "$#" -ne 6 ]; then
  log_error "usage: $0 <candidate-dir> <live-stage-dir> <compose-project-name> <expected-gateway-port> <expected-service-count> <backup-root>"
  exit "$EXIT_SECURITY_FAILURE"
fi

candidate_arg="$1"
live_stage_arg="$2"
compose_project_name="$3"
expected_gateway_port="$4"
expected_service_count="$5"
backup_root="$6"

cleanup_candidate() {
  if [[ -n "${candidate_dir:-}" ]] && [[ "$candidate_dir" == /tmp/warehub-stage-reconcile.* ]] && [ -d "$candidate_dir" ]; then
    rm -rf -- "$candidate_dir"
  fi
}

disable_rollback_traps() {
  trap - ERR INT TERM HUP
}

set_state() {
  state="$1"
}

is_post_mutation_state() {
  case "$state" in
    "$STATE_PROMOTION_STARTED"|"$STATE_PROMOTED"|"$STATE_GATEWAY_RECREATED"|"$STATE_VALIDATED")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

exit_with_code() {
  local code="$1"
  shift
  local message="${1:-}"
  disable_rollback_traps
  if [ -n "$message" ]; then
    log_error "$message"
  fi
  set_state "$STATE_COMPLETED"
  exit "$code"
}

security_fail() {
  failure_context="$1"
  exit_with_code "$EXIT_SECURITY_FAILURE" "$1"
}

pre_mutation_fail() {
  failure_context="$1"
  exit_with_code "$EXIT_PRE_MUTATION_FAILURE" "$1"
}

remember_failure_context() {
  if [ -z "${failure_context:-}" ]; then
    failure_context="$1"
  fi
}

run_test_hook() {
  local checkpoint="$1"
  local action="${WAREHUB_TEST_HOOK_ACTION:-}"
  local target="${WAREHUB_TEST_HOOK_POINT:-}"

  if [ -z "$action" ] || [ "$target" != "$checkpoint" ]; then
    return 0
  fi

  case "$action" in
    signal:*)
      handle_signal "${action#signal:}"
      ;;
    fail)
      return 1
      ;;
    *)
      security_fail "unsupported test hook action configured for $checkpoint"
      ;;
  esac
}

handle_signal() {
  local signal_name="$1"
  remember_failure_context "received $signal_name during state $state"

  if [ "$rollback_running" -eq 1 ] || [ "$rollback_completed" -eq 1 ]; then
    log_status "Ignoring $signal_name while rollback state is $state."
    return 0
  fi

  if is_post_mutation_state; then
    if rollback_runtime; then
      exit_with_code "$EXIT_ROLLBACK_SUCCEEDED" "$failure_context; rollback succeeded"
    fi
    exit_with_code "$EXIT_ROLLBACK_FAILED" "$failure_context; rollback failed"
  fi

  exit_with_code "$EXIT_PRE_MUTATION_FAILURE" "$failure_context"
}

handle_err() {
  local rc="$1"
  local line_no="$2"

  if [ "$rc" -eq 0 ]; then
    return 0
  fi

  remember_failure_context "unexpected command failure at line $line_no in state $state (rc=$rc)"

  if [ "$rollback_running" -eq 1 ] || [ "$rollback_completed" -eq 1 ]; then
    exit_with_code "$EXIT_ROLLBACK_FAILED" "$failure_context"
  fi

  if is_post_mutation_state; then
    if rollback_runtime; then
      exit_with_code "$EXIT_ROLLBACK_SUCCEEDED" "$failure_context; rollback succeeded"
    fi
    exit_with_code "$EXIT_ROLLBACK_FAILED" "$failure_context; rollback failed"
  fi

  exit_with_code "$EXIT_PRE_MUTATION_FAILURE" "$failure_context"
}

trap cleanup_candidate EXIT
trap 'handle_err $? $LINENO' ERR
trap 'handle_signal INT' INT
trap 'handle_signal TERM' TERM
trap 'handle_signal HUP' HUP

[[ "$expected_gateway_port" =~ ^[0-9]+$ ]] || security_fail "expected gateway port must be numeric"
[[ "$expected_service_count" =~ ^[0-9]+$ ]] || security_fail "expected service count must be numeric"
[ "$compose_project_name" = "warehub-stage" ] || security_fail "compose project name must be warehub-stage"
[ -d "$candidate_arg" ] || security_fail "candidate directory not found"
[ -d "$live_stage_arg" ] || security_fail "live stage directory not found"
[ ! -L "${candidate_arg%/}" ] || security_fail "candidate directory must not be a symlink"
[ ! -L "${live_stage_arg%/}" ] || security_fail "live stage directory must not be a symlink"

candidate_dir="$(realpath "$candidate_arg")"
live_stage_dir="$(realpath "$live_stage_arg")"

case "$candidate_dir" in
  /tmp/warehub-stage-reconcile.*) ;;
  *) security_fail "candidate directory must be under /tmp/warehub-stage-reconcile.*" ;;
esac

if [ "${WAREHUB_TEST_ALLOW_NONCANONICAL_STAGE_PATH:-0}" != "1" ]; then
  [ "$live_stage_dir" = "/opt/warehub/stage" ] || security_fail "live stage directory must resolve to /opt/warehub/stage"
fi
[ "$candidate_dir" != "$live_stage_dir" ] || security_fail "candidate directory must not equal the live stage directory"
[[ "$candidate_dir" != "$live_stage_dir"/* ]] || security_fail "candidate directory must not be inside the live stage directory"
[[ "$live_stage_dir" != "$candidate_dir"/* ]] || security_fail "live stage directory must not be inside the candidate directory"
[ ! -L "$0" ] || security_fail "executed helper path must not be a symlink"

live_env="$live_stage_dir/.env"
live_compose="$live_stage_dir/docker-compose.yml"
live_gateway_candidate_env="$live_stage_dir/.env.gateway-candidate"
live_gateway_candidate_compose="$live_stage_dir/docker-compose.gateway-candidate.yml"

candidate_env="$candidate_dir/.env"
candidate_compose="$candidate_dir/docker-compose.yml"
candidate_validator="$candidate_dir/verify-gateway-only-ports.py"
candidate_helper="$candidate_dir/run-stage-runtime-reconciliation.sh"
candidate_manifest="$candidate_dir/candidate.sha256"
candidate_metadata="$candidate_dir/metadata.env"

required_candidate_files=(
  .env
  docker-compose.yml
  verify-gateway-only-ports.py
  run-stage-runtime-reconciliation.sh
  candidate.sha256
  metadata.env
)

for name in "${required_candidate_files[@]}"; do
  path="$candidate_dir/$name"
  [ -f "$path" ] || security_fail "$name not found in candidate bundle"
  [ ! -L "$path" ] || security_fail "$name must not be a symlink"
  resolved="$(realpath "$path")"
  [ "$(dirname "$resolved")" = "$candidate_dir" ] || security_fail "$name must resolve directly inside the candidate directory"
done

mapfile -t candidate_entries < <(find "$candidate_dir" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
[ "${#candidate_entries[@]}" -eq "${#required_candidate_files[@]}" ] || security_fail "candidate bundle contains unexpected entries"
for name in "${required_candidate_files[@]}"; do
  printf '%s\n' "${candidate_entries[@]}" | grep -Fx "$name" >/dev/null || security_fail "candidate bundle is missing expected entry $name"
done

if find "$candidate_dir" -mindepth 2 -print | grep -q .; then
  security_fail "candidate bundle must not contain nested paths"
fi

if grep -Eq '^[[:space:]]*(env_file|extends|include)[[:space:]]*:' "$candidate_compose"; then
  security_fail "candidate Compose must not use env_file, extends, or include"
fi

if grep -Eq '(^|[^[:alnum:]_])(docker[[:space:]]+compose[[:space:]]+(down|pull|stop|restart)|docker[[:space:]]+restart|docker[[:space:]]+rm|docker[[:space:]]+image[[:space:]]+rm|systemctl[[:space:]]+(restart|reload))([^[:alnum:]_-]|$)' "$candidate_helper"; then
  security_fail "helper contains a forbidden lifecycle command"
fi

if ! (
  cd "$candidate_dir"
  sha256sum --check --status "$(basename "$candidate_manifest")"
); then
  security_fail "candidate bundle integrity validation failed"
fi

SOURCE_COMMIT_SHA=""
EXPECTED_LIVE_ENV_SHA256=""
EXPECTED_LIVE_COMPOSE_SHA256=""

parse_metadata_file() {
  local metadata_path="$1"
  local line=""
  local line_no=0
  local key=""
  local value=""
  local parsed_source_commit=""
  local parsed_live_env_sha=""
  local parsed_live_compose_sha=""
  declare -A seen_keys=()

  while IFS= read -r line || [ -n "$line" ]; do
    line_no=$((line_no + 1))

    case "$line" in
      ""|\#*)
        continue
        ;;
    esac

    [[ "$line" =~ ^[A-Z_][A-Z0-9_]*=[A-Za-z0-9]+$ ]] || security_fail "metadata.env contains an invalid line at $line_no"
    key="${line%%=*}"
    value="${line#*=}"

    case "$key" in
      SOURCE_COMMIT_SHA|EXPECTED_LIVE_ENV_SHA256|EXPECTED_LIVE_COMPOSE_SHA256) ;;
      *)
        security_fail "metadata.env contains an unknown key at line $line_no"
        ;;
    esac

    if [[ -n "${seen_keys[$key]+x}" ]]; then
      security_fail "metadata.env contains a duplicate key for $key"
    fi
    seen_keys["$key"]=1

    case "$key" in
      SOURCE_COMMIT_SHA)
        parsed_source_commit="$value"
        ;;
      EXPECTED_LIVE_ENV_SHA256)
        parsed_live_env_sha="$value"
        ;;
      EXPECTED_LIVE_COMPOSE_SHA256)
        parsed_live_compose_sha="$value"
        ;;
    esac
  done < "$metadata_path"

  [ "${#seen_keys[@]}" -eq 3 ] || security_fail "metadata.env must contain exactly three keys"
  [ -n "$parsed_source_commit" ] || security_fail "metadata.env is missing SOURCE_COMMIT_SHA"
  [ -n "$parsed_live_env_sha" ] || security_fail "metadata.env is missing EXPECTED_LIVE_ENV_SHA256"
  [ -n "$parsed_live_compose_sha" ] || security_fail "metadata.env is missing EXPECTED_LIVE_COMPOSE_SHA256"
  [[ "$parsed_source_commit" =~ ^[0-9a-f]{40}$ ]] || security_fail "SOURCE_COMMIT_SHA must be a lowercase 40-character SHA"
  [[ "$parsed_live_env_sha" =~ ^[0-9a-f]{64}$ ]] || security_fail "EXPECTED_LIVE_ENV_SHA256 must be a lowercase SHA-256 digest"
  [[ "$parsed_live_compose_sha" =~ ^[0-9a-f]{64}$ ]] || security_fail "EXPECTED_LIVE_COMPOSE_SHA256 must be a lowercase SHA-256 digest"

  SOURCE_COMMIT_SHA="$parsed_source_commit"
  EXPECTED_LIVE_ENV_SHA256="$parsed_live_env_sha"
  EXPECTED_LIVE_COMPOSE_SHA256="$parsed_live_compose_sha"
}

parse_metadata_file "$candidate_metadata"

lock_path="${WAREHUB_STAGE_RUNTIME_RECONCILE_LOCK_PATH_OVERRIDE:-/opt/warehub/.stage-runtime-reconcile.lock}"
exec 9>"$lock_path"
if ! flock -n 9; then
  security_fail "stage runtime reconciliation lock is already held"
fi

for path in "$live_env" "$live_compose" "$live_gateway_candidate_env" "$live_gateway_candidate_compose"; do
  [ -f "$path" ] || security_fail "required live file not found: $path"
  [ ! -L "$path" ] || security_fail "required live file must not be a symlink: $path"
done

live_env_sha="$(sha256sum "$live_env" | awk '{print $1}')"
live_compose_sha="$(sha256sum "$live_compose" | awk '{print $1}')"
[ "$live_env_sha" = "$EXPECTED_LIVE_ENV_SHA256" ] || pre_mutation_fail "live env SHA-256 does not match expected metadata"
[ "$live_compose_sha" = "$EXPECTED_LIVE_COMPOSE_SHA256" ] || pre_mutation_fail "live compose SHA-256 does not match expected metadata"

count_lines() {
  local text="$1"
  if [ -z "$text" ]; then
    printf '0'
  else
    printf '%s\n' "$text" | sed '/^$/d' | wc -l | tr -d ' '
  fi
}

collect_project_container_ids() {
  docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --format '{{.ID}}' | LC_ALL=C sort
}

collect_service_container_ids() {
  local id=""
  local service=""
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$id")"
    printf '%s|%s\n' "$id" "$service"
  done < <(collect_project_container_ids)
}

collect_volume_snapshot() {
  local id=""
  local service=""
  local mounts=""
  local mount_line=""

  while IFS= read -r id; do
    [ -n "$id" ] || continue
    service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$id")"
    mounts="$(docker inspect --format '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}{{"\n"}}{{end}}' "$id")"
    if [ -z "$mounts" ]; then
      printf '%s|NONE||||\n' "$service"
      continue
    fi
    while IFS= read -r mount_line; do
      [ -n "$mount_line" ] || continue
      printf '%s|%s\n' "$service" "$mount_line"
    done <<< "$mounts"
  done < <(collect_project_container_ids) | LC_ALL=C sort
}

project_container_ids_all="$(collect_project_container_ids)"
project_container_ids_running="$(docker ps --filter "label=com.docker.compose.project=$compose_project_name" --format '{{.ID}}' | LC_ALL=C sort)"
project_unhealthy_ids="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter health=unhealthy --format '{{.ID}}' | LC_ALL=C sort)"
project_restarting_ids="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter status=restarting --format '{{.ID}}' | LC_ALL=C sort)"
project_exited_ids="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter status=exited --format '{{.ID}}' | LC_ALL=C sort)"

[ "$(count_lines "$project_container_ids_all")" = "$expected_service_count" ] || pre_mutation_fail "unexpected total project container count"
[ "$(count_lines "$project_container_ids_running")" = "$expected_service_count" ] || pre_mutation_fail "unexpected running project container count"
[ -z "$project_unhealthy_ids" ] || pre_mutation_fail "unhealthy project containers are present"
[ -z "$project_restarting_ids" ] || pre_mutation_fail "restarting project containers are present"
[ -z "$project_exited_ids" ] || pre_mutation_fail "exited project containers are present"

gateway_container_ids="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter "label=com.docker.compose.service=gateway" --format '{{.ID}}')"
[ "$(count_lines "$gateway_container_ids")" = "1" ] || pre_mutation_fail "expected exactly one gateway container"
gateway_container_id="$(printf '%s\n' "$gateway_container_ids")"
gateway_label_compose="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$gateway_container_id")"
gateway_label_env="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.environment_file" }}' "$gateway_container_id")"
[ "$gateway_label_compose" = "$live_gateway_candidate_compose" ] || pre_mutation_fail "gateway container does not point to gateway candidate compose file"
[ "$gateway_label_env" = "$live_gateway_candidate_env" ] || pre_mutation_fail "gateway container does not point to gateway candidate env file"

env_value() {
  local key="$1"
  local env_file="$2"
  local line=""

  line="$(grep -E "^${key}=" "$env_file" || true)"
  [ -n "$line" ] || pre_mutation_fail "missing env key $key in $env_file"
  printf '%s' "${line#*=}"
}

compose_ref_from_file() {
  local env_file="$1"
  local image_key="$2"
  local tag_key="$3"
  printf '%s:%s' "$(env_value "$image_key" "$env_file")" "$(env_value "$tag_key" "$env_file")"
}

assert_ref_unchanged() {
  local service="$1"
  local image_key="$2"
  local tag_key="$3"
  local live_ref=""
  local candidate_ref=""

  live_ref="$(compose_ref_from_file "$live_env" "$image_key" "$tag_key")"
  candidate_ref="$(compose_ref_from_file "$candidate_env" "$image_key" "$tag_key")"
  [ "$live_ref" = "$candidate_ref" ] || pre_mutation_fail "$service image ref changed between live runtime and candidate bundle"
}

assert_ref_unchanged backend BACKEND_IMAGE BACKEND_STAGE_TAG
assert_ref_unchanged frontend FRONTEND_IMAGE FRONTEND_STAGE_TAG
assert_ref_unchanged gateway GATEWAY_IMAGE GATEWAY_STAGE_TAG
assert_ref_unchanged mobile MOBILE_IMAGE MOBILE_STAGE_TAG
assert_ref_unchanged services SERVICES_IMAGE SERVICES_STAGE_TAG
assert_ref_unchanged orchestrator ORCHESTRATOR_IMAGE ORCHESTRATOR_STAGE_TAG

stage_domain="$(env_value STAGE_DOMAIN "$live_env")"
localhost_gateway_url="http://127.0.0.1:${expected_gateway_port}/gateway/healthz"
gateway_public_url="https://$stage_domain/gateway/healthz"
frontend_public_url="https://$stage_domain/login"
backend_public_health_url="https://$stage_domain/api/v1/healthz"
services_public_health_url="https://$stage_domain/api/v1/services/healthz"
orchestrator_public_health_url="https://$stage_domain/api/v1/orchestrator/healthz"

http_status() {
  local url="$1"
  local connect_timeout="$2"
  local max_time="$3"

  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --connect-timeout "$connect_timeout" \
    --max-time "$max_time" \
    --output /dev/null \
    --write-out '%{http_code}' \
    "$url"
}

poll_http_endpoint() {
  local label="$1"
  local url="$2"
  local expected_status="$3"
  local attempts="$4"
  local interval_seconds="$5"
  local connect_timeout="$6"
  local max_time="$7"
  local attempt=1
  local status=""

  while [ "$attempt" -le "$attempts" ]; do
    if status="$(http_status "$url" "$connect_timeout" "$max_time")" && [ "$status" = "$expected_status" ]; then
      return 0
    fi

    if [ "$attempt" -eq "$attempts" ]; then
      break
    fi

    sleep "$interval_seconds"
    attempt=$((attempt + 1))
  done

  log_status "$label did not reach HTTP $expected_status after $attempts attempts."
  return 1
}

check_current_gateway_public_health() {
  poll_http_endpoint "pre-reconciliation gateway public health" "$gateway_public_url" "200" 3 2 2 5
}

check_current_gateway_public_health || pre_mutation_fail "gateway pre-check failed before reconciliation"

backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_short_sha="$(printf '%s' "$SOURCE_COMMIT_SHA" | cut -c1-7)"
backup_dir="$backup_root/runtime-reconcile-$backup_timestamp-$backup_short_sha"
install -d -m 700 "$backup_dir"

write_env_like_backup() {
  local source_path="$1"
  local dest_path="$2"
  cp "$source_path" "$dest_path"
  chmod 600 "$dest_path"
}

write_env_like_backup "$live_env" "$backup_dir/live.env"
write_env_like_backup "$live_compose" "$backup_dir/live.docker-compose.yml"
write_env_like_backup "$live_gateway_candidate_env" "$backup_dir/gateway-candidate.env"
write_env_like_backup "$live_gateway_candidate_compose" "$backup_dir/gateway-candidate.docker-compose.yml"

container_snapshot_before="$backup_dir/container-snapshot.txt"
image_refs_before="$backup_dir/image-refs.txt"
image_ids_before="$backup_dir/image-ids.txt"
metadata_before="$backup_dir/metadata.txt"
volume_snapshot_before_file="$backup_dir/volume-snapshot-before.txt"

docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}' > "$container_snapshot_before"
chmod 600 "$container_snapshot_before"

{
  printf 'backend=%s\n' "$(compose_ref_from_file "$live_env" BACKEND_IMAGE BACKEND_STAGE_TAG)"
  printf 'frontend=%s\n' "$(compose_ref_from_file "$live_env" FRONTEND_IMAGE FRONTEND_STAGE_TAG)"
  printf 'gateway=%s\n' "$(compose_ref_from_file "$live_env" GATEWAY_IMAGE GATEWAY_STAGE_TAG)"
  printf 'mobile=%s\n' "$(compose_ref_from_file "$live_env" MOBILE_IMAGE MOBILE_STAGE_TAG)"
  printf 'services=%s\n' "$(compose_ref_from_file "$live_env" SERVICES_IMAGE SERVICES_STAGE_TAG)"
  printf 'orchestrator=%s\n' "$(compose_ref_from_file "$live_env" ORCHESTRATOR_IMAGE ORCHESTRATOR_STAGE_TAG)"
} > "$image_refs_before"
chmod 600 "$image_refs_before"

image_id_for_ref() {
  local ref="$1"
  docker image inspect --format '{{.Id}}|{{join .RepoDigests ";"}}' "$ref"
}

{
  printf 'backend=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" BACKEND_IMAGE BACKEND_STAGE_TAG)")"
  printf 'frontend=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" FRONTEND_IMAGE FRONTEND_STAGE_TAG)")"
  printf 'gateway=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" GATEWAY_IMAGE GATEWAY_STAGE_TAG)")"
  printf 'mobile=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" MOBILE_IMAGE MOBILE_STAGE_TAG)")"
  printf 'services=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" SERVICES_IMAGE SERVICES_STAGE_TAG)")"
  printf 'orchestrator=%s\n' "$(image_id_for_ref "$(compose_ref_from_file "$live_env" ORCHESTRATOR_IMAGE ORCHESTRATOR_STAGE_TAG)")"
} > "$image_ids_before"
chmod 600 "$image_ids_before"

volume_snapshot_before="$(collect_volume_snapshot)"
printf '%s\n' "$volume_snapshot_before" > "$volume_snapshot_before_file"
chmod 600 "$volume_snapshot_before_file"
non_gateway_container_ids_before="$(collect_service_container_ids | grep -v '|gateway$' | LC_ALL=C sort)"
gateway_image_ref_before="$(compose_ref_from_file "$live_env" GATEWAY_IMAGE GATEWAY_STAGE_TAG)"
gateway_image_id_before="$(docker inspect --format '{{.Image}}' "$gateway_container_id")"

{
  printf 'source_commit_sha=%s\n' "$SOURCE_COMMIT_SHA"
  printf 'expected_live_env_sha256=%s\n' "$EXPECTED_LIVE_ENV_SHA256"
  printf 'expected_live_compose_sha256=%s\n' "$EXPECTED_LIVE_COMPOSE_SHA256"
  printf 'actual_live_env_sha256=%s\n' "$live_env_sha"
  printf 'actual_live_compose_sha256=%s\n' "$live_compose_sha"
  printf 'gateway_container_id=%s\n' "$gateway_container_id"
  printf 'gateway_label_compose=%s\n' "$gateway_label_compose"
  printf 'gateway_label_env=%s\n' "$gateway_label_env"
  printf 'localhost_gateway_url=%s\n' "$localhost_gateway_url"
  printf 'gateway_public_url=%s\n' "$gateway_public_url"
} > "$metadata_before"
chmod 600 "$metadata_before"

(
  cd "$backup_dir"
  sha256sum \
    live.env \
    live.docker-compose.yml \
    gateway-candidate.env \
    gateway-candidate.docker-compose.yml \
    container-snapshot.txt \
    image-refs.txt \
    image-ids.txt \
    metadata.txt \
    volume-snapshot-before.txt > checksums.sha256
  chmod 600 checksums.sha256
  sha256sum --check --status checksums.sha256
)

prepare_temp_live_file() {
  local source_path="$1"
  local temp_path="$2"
  local reference_path="$3"

  [ ! -e "$temp_path" ] || pre_mutation_fail "stale promotion temp file already exists: $temp_path"

  install -m 600 /dev/null "$temp_path"
  cp "$source_path" "$temp_path"
  chmod --reference="$reference_path" "$temp_path"
  chown --reference="$reference_path" "$temp_path"
}

verify_file_checksum_match() {
  local path_a="$1"
  local path_b="$2"
  [ "$(sha256sum "$path_a" | awk '{print $1}')" = "$(sha256sum "$path_b" | awk '{print $1}')" ] || pre_mutation_fail "checksum mismatch between $path_a and $path_b"
}

restore_backup_file() {
  local backup_path="$1"
  local live_path="$2"
  local temp_path="$3"
  prepare_temp_live_file "$backup_path" "$temp_path" "$live_path"
  mv -f "$temp_path" "$live_path"
}

rollback_runtime() {
  local current_non_gateway_ids=""
  local gateway_after_rollback_id=""

  if [ "$rollback_running" -eq 1 ] || [ "$rollback_completed" -eq 1 ]; then
    return 0
  fi

  rollback_invocations=$((rollback_invocations + 1))
  rollback_running=1
  set_state "$STATE_ROLLBACK_RUNNING"

  disable_rollback_traps
  trap cleanup_candidate EXIT
  trap 'log_status "Ignoring INT while rollback is running."' INT
  trap 'log_status "Ignoring TERM while rollback is running."' TERM
  trap 'log_status "Ignoring HUP while rollback is running."' HUP

  if ! restore_backup_file "$backup_dir/live.env" "$live_env" "$live_stage_dir/.env.rollback-restore"; then
    log_status 'ROLLBACK_STATUS=restore-live-env-failed'
    return 1
  fi

  if ! restore_backup_file "$backup_dir/live.docker-compose.yml" "$live_compose" "$live_stage_dir/docker-compose.yml.rollback-restore"; then
    log_status 'ROLLBACK_STATUS=restore-live-compose-failed'
    return 1
  fi

  if ! restore_backup_file "$backup_dir/gateway-candidate.env" "$live_gateway_candidate_env" "$live_stage_dir/.env.gateway-candidate.rollback-restore"; then
    log_status 'ROLLBACK_STATUS=restore-gateway-env-failed'
    return 1
  fi

  if ! restore_backup_file "$backup_dir/gateway-candidate.docker-compose.yml" "$live_gateway_candidate_compose" "$live_stage_dir/docker-compose.gateway-candidate.yml.rollback-restore"; then
    log_status 'ROLLBACK_STATUS=restore-gateway-compose-failed'
    return 1
  fi

  if ! docker compose \
    --project-name "$compose_project_name" \
    --env-file "$live_gateway_candidate_env" \
    -f "$live_gateway_candidate_compose" \
    up -d --no-deps --force-recreate gateway; then
    log_status 'ROLLBACK_STATUS=gateway-recreate-failed'
    return 1
  fi

  gateway_after_rollback_id="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter "label=com.docker.compose.service=gateway" --format '{{.ID}}')"
  [ "$(count_lines "$gateway_after_rollback_id")" = "1" ] || {
    log_status 'ROLLBACK_STATUS=gateway-container-count-invalid'
    return 1
  }
  gateway_after_rollback_id="$(printf '%s\n' "$gateway_after_rollback_id")"
  [ "$(docker inspect --format '{{.Config.Image}}' "$gateway_after_rollback_id")" = "$gateway_image_ref_before" ] || {
    log_status 'ROLLBACK_STATUS=gateway-image-ref-mismatch'
    return 1
  }
  [ "$(docker inspect --format '{{.Image}}' "$gateway_after_rollback_id")" = "$gateway_image_id_before" ] || {
    log_status 'ROLLBACK_STATUS=gateway-image-id-mismatch'
    return 1
  }

  current_non_gateway_ids="$(collect_service_container_ids | grep -v '|gateway$' | LC_ALL=C sort)"
  [ "$current_non_gateway_ids" = "$non_gateway_container_ids_before" ] || {
    log_status 'ROLLBACK_STATUS=non-gateway-container-drift'
    return 1
  }

  poll_http_endpoint "rollback localhost gateway readiness" "$localhost_gateway_url" "200" 30 2 2 5 || {
    log_status 'ROLLBACK_STATUS=localhost-gateway-not-ready'
    return 1
  }

  poll_http_endpoint "rollback gateway public health" "$gateway_public_url" "200" 5 2 2 5 || {
    log_status 'ROLLBACK_STATUS=gateway-public-smoke-failed'
    return 1
  }
  poll_http_endpoint "rollback frontend health" "$frontend_public_url" "200" 5 2 2 5 || {
    log_status 'ROLLBACK_STATUS=frontend-public-smoke-failed'
    return 1
  }
  poll_http_endpoint "rollback backend health" "$backend_public_health_url" "200" 5 2 2 5 || {
    log_status 'ROLLBACK_STATUS=backend-public-smoke-failed'
    return 1
  }
  poll_http_endpoint "rollback services health" "$services_public_health_url" "200" 5 2 2 5 || {
    log_status 'ROLLBACK_STATUS=services-public-smoke-failed'
    return 1
  }
  poll_http_endpoint "rollback orchestrator health" "$orchestrator_public_health_url" "200" 5 2 2 5 || {
    log_status 'ROLLBACK_STATUS=orchestrator-public-smoke-failed'
    return 1
  }

  rollback_running=0
  rollback_completed=1
  set_state "$STATE_ROLLED_BACK"
  trap 'handle_err $? $LINENO' ERR
  trap 'handle_signal INT' INT
  trap 'handle_signal TERM' TERM
  trap 'handle_signal HUP' HUP
  log_status 'ROLLBACK_STATUS=success'
  return 0
}

run_post_recreation_validation() {
  local gateway_container_id_after=""
  local current_non_gateway_ids=""
  local project_container_ids_running_after=""
  local containers_with_health=""
  local id=""
  local status=""
  local container_label_refs=""
  local volume_snapshot_after=""

  gateway_container_id_after="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project_name" --filter "label=com.docker.compose.service=gateway" --format '{{.ID}}')"
  [ "$(count_lines "$gateway_container_id_after")" = "1" ] || return 1
  gateway_container_id_after="$(printf '%s\n' "$gateway_container_id_after")"
  [ "$gateway_container_id_after" != "$gateway_container_id" ] || return 1

  [ "$(docker inspect --format '{{.State.Status}}' "$gateway_container_id_after")" = "running" ] || return 1

  gateway_health_status=""
  for attempt in $(seq 1 30); do
    gateway_health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$gateway_container_id_after")"
    if [ "$gateway_health_status" = "healthy" ]; then
      break
    fi
    sleep 2
  done

  [ "$gateway_health_status" = "healthy" ] || {
    log_status "POST_VALIDATION_STATUS=gateway-health-not-ready"
    return 1
  }
  [ "$(docker inspect --format '{{.Config.Image}}' "$gateway_container_id_after")" = "$gateway_image_ref_before" ] || return 1
  [ "$(docker inspect --format '{{.Image}}' "$gateway_container_id_after")" = "$gateway_image_id_before" ] || return 1

  if ! poll_http_endpoint "localhost gateway readiness" "$localhost_gateway_url" "200" 30 2 2 5; then
    return 1
  fi

  if ! python3 "$candidate_validator" \
    --compose "$live_compose" \
    --env-file "$live_env" \
    --expected-gateway-port "$expected_gateway_port"; then
    return 1
  fi

  if ! poll_http_endpoint "gateway public health" "$gateway_public_url" "200" 5 2 2 5; then
    return 1
  fi
  if ! poll_http_endpoint "frontend public health" "$frontend_public_url" "200" 5 2 2 5; then
    return 1
  fi
  if ! poll_http_endpoint "backend public health" "$backend_public_health_url" "200" 5 2 2 5; then
    return 1
  fi
  if ! poll_http_endpoint "services public health" "$services_public_health_url" "200" 5 2 2 5; then
    return 1
  fi
  if ! poll_http_endpoint "orchestrator public health" "$orchestrator_public_health_url" "200" 5 2 2 5; then
    return 1
  fi

  project_container_ids_running_after="$(docker ps --filter "label=com.docker.compose.project=$compose_project_name" --format '{{.ID}}' | LC_ALL=C sort)"
  [ "$(count_lines "$project_container_ids_running_after")" = "$expected_service_count" ] || return 1

  current_non_gateway_ids="$(collect_service_container_ids | grep -v '|gateway$' | LC_ALL=C sort)"
  [ "$current_non_gateway_ids" = "$non_gateway_container_ids_before" ] || return 1

  volume_snapshot_after="$(collect_volume_snapshot)"
  [ "$volume_snapshot_after" = "$volume_snapshot_before" ] || return 1

  [ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$gateway_container_id_after")" = "$live_compose" ] || return 1
  [ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.environment_file" }}' "$gateway_container_id_after")" = "$live_env" ] || return 1

  compose_quiet_output="$(
    docker compose \
      --project-name "$compose_project_name" \
      --env-file "$live_env" \
      -f "$live_compose" \
      config --quiet 2>&1
  )"
  [ -z "$compose_quiet_output" ] || return 1

  containers_with_health="$(
    collect_project_container_ids |
      while IFS= read -r id; do
        [ -n "$id" ] || continue
        docker inspect --format '{{if .State.Health}}{{.Id}}{{end}}' "$id"
      done |
      sed '/^$/d'
  )"
  if [ -n "$containers_with_health" ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      status="$(docker inspect --format '{{.State.Health.Status}}' "$id")"
      [ "$status" = "healthy" ] || return 1
    done <<< "$containers_with_health"
  fi

  container_label_refs="$(
    collect_project_container_ids |
      while IFS= read -r id; do
        [ -n "$id" ] || continue
        printf '%s|%s|%s\n' \
          "$id" \
          "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$id")" \
          "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.environment_file" }}' "$id")"
      done
  )"

  if printf '%s\n' "$container_label_refs" | grep -F "$live_gateway_candidate_compose" >/dev/null; then
    return 1
  fi
  if printf '%s\n' "$container_label_refs" | grep -F "$live_gateway_candidate_env" >/dev/null; then
    return 1
  fi

  return 0
}

cleanup_legacy_candidate_files() {
  local first_deleted=0

  for path in "$live_gateway_candidate_env" "$live_gateway_candidate_compose"; do
    [ -f "$path" ] || return 1
    [ ! -L "$path" ] || return 1
  done

  rm -- "$live_gateway_candidate_env"
  first_deleted=1

  if [ "${WAREHUB_TEST_FORCE_CLEANUP_SECOND_FAILURE:-0}" = "1" ]; then
    return 1
  fi

  rm -- "$live_gateway_candidate_compose"

  if [ "$first_deleted" -eq 1 ] && [ -f "$live_gateway_candidate_env" ]; then
    return 1
  fi

  return 0
}

temp_live_env="$live_stage_dir/.env.reconcile-new"
temp_live_compose="$live_stage_dir/docker-compose.yml.reconcile-new"

prepare_temp_live_file "$candidate_env" "$temp_live_env" "$live_env"
prepare_temp_live_file "$candidate_compose" "$temp_live_compose" "$live_compose"
verify_file_checksum_match "$candidate_env" "$temp_live_env"
verify_file_checksum_match "$candidate_compose" "$temp_live_compose"

run_test_hook before-first-live-mutation

set_state "$STATE_PROMOTION_STARTED"
mv -f "$temp_live_env" "$live_env"
run_test_hook after-live-env-rename
mv -f "$temp_live_compose" "$live_compose"
set_state "$STATE_PROMOTED"
run_test_hook after-live-promotion

if ! docker compose \
  --project-name "$compose_project_name" \
  --env-file "$live_env" \
  -f "$live_compose" \
  up -d --no-deps --force-recreate gateway; then
  remember_failure_context "reconciliation failed during gateway recreation"
  if rollback_runtime; then
    exit_with_code "$EXIT_ROLLBACK_SUCCEEDED" "$failure_context; rollback succeeded"
  fi
  exit_with_code "$EXIT_ROLLBACK_FAILED" "$failure_context; rollback failed"
fi

set_state "$STATE_GATEWAY_RECREATED"
run_test_hook after-gateway-recreation
run_test_hook during-post-validation

if ! run_post_recreation_validation; then
  remember_failure_context "post-validation failed after gateway recreation"
  if rollback_runtime; then
    exit_with_code "$EXIT_ROLLBACK_SUCCEEDED" "$failure_context; rollback succeeded"
  fi
  exit_with_code "$EXIT_ROLLBACK_FAILED" "$failure_context; rollback failed"
fi

set_state "$STATE_VALIDATED"
disable_rollback_traps

if ! cleanup_legacy_candidate_files; then
  exit_with_code "$EXIT_CLEANUP_INCOMPLETE" "reconciliation succeeded but legacy gateway-candidate cleanup is incomplete; canonical runtime remains active and rollback is intentionally skipped"
fi

set_state "$STATE_COMPLETED"
printf 'Stage runtime reconciliation completed successfully.\n'
exit "$EXIT_SUCCESS"

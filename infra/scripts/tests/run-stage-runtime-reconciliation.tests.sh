#!/usr/bin/env bash
set -Eeuo pipefail

EXIT_SUCCESS=0
EXIT_PRE_MUTATION_FAILURE=10
EXIT_ROLLBACK_SUCCEEDED=20
EXIT_ROLLBACK_FAILED=30
EXIT_SECURITY_FAILURE=40
EXIT_CLEANUP_INCOMPLETE=50

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
script_under_test="$repo_root/infra/scripts/run-stage-runtime-reconciliation.sh"
workflow_under_test="$repo_root/.github/workflows/stage-runtime-reconcile.yml"

failures=0
LAST_OUTPUT=""
LAST_RC=0

test_case() {
  local name="$1"
  shift

  if "$@"; then
    printf 'PASS %s\n' "$name"
  else
    printf 'FAIL %s\n' "$name"
    failures=$((failures + 1))
  fi
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if printf '%s' "$haystack" | grep -F -- "$needle" >/dev/null; then
    return 1
  fi
}

assert_file_contains() {
  local path="$1"
  local needle="$2"
  grep -F -- "$needle" "$path" >/dev/null
}

assert_file_not_contains() {
  local path="$1"
  local needle="$2"
  if grep -F -- "$needle" "$path" >/dev/null; then
    return 1
  fi
}

new_fixture_root() {
  mktemp -d "${TMPDIR:-/tmp}/warehub-stage-runtime-reconcile-tests.XXXXXX"
}

create_fixture() {
  local root="$1"
  local candidate_dir=""
  local live_dir="$root/live"
  local backup_root="$root/backups/stage"
  local secret_sentinel="TEST_SECRET_SENTINEL"

  candidate_dir="$(mktemp -d /tmp/warehub-stage-reconcile.fixture.XXXXXX)"
  mkdir -p "$live_dir" "$backup_root" "$root/docker-state"

  cat > "$candidate_dir/.env" <<EOF
BACKEND_IMAGE=ghcr.io/ravilkadev0/warehub/backend
BACKEND_STAGE_TAG=stage-8850b9c
FRONTEND_IMAGE=ghcr.io/ravilkadev0/warehub/frontend
FRONTEND_STAGE_TAG=stage-758bff4
GATEWAY_IMAGE=ghcr.io/ravilkadev0/warehub/gateway
GATEWAY_STAGE_TAG=stage-758bff4
MOBILE_IMAGE=ghcr.io/ravilkadev0/warehub/mobile
MOBILE_STAGE_TAG=stage-8850b9c
SERVICES_IMAGE=ghcr.io/ravilkadev0/warehub/services
SERVICES_STAGE_TAG=stage-8850b9c
ORCHESTRATOR_IMAGE=ghcr.io/ravilkadev0/warehub/orchestrator
ORCHESTRATOR_STAGE_TAG=stage-8850b9c
STAGE_DOMAIN=stage.example.test
STAGE_GATEWAY_PORT=8940
STAGE_PUBLIC_API_BASE_URL=https://stage.example.test/api/v1
STAGE_PUBLIC_SERVICES_API_BASE_URL=https://stage.example.test/api/v1/services
STAGE_PUBLIC_ORCHESTRATOR_API_BASE_URL=https://stage.example.test/api/v1/orchestrator
STAGE_POSTGRES_DB=warehub_stage
STAGE_POSTGRES_USER=warehub_stage
STAGE_POSTGRES_PASSWORD=$secret_sentinel
STAGE_SMTP_HOST=smtp.example.test
STAGE_SMTP_PORT=587
STAGE_SMTP_USERNAME=mailbox@example.test
STAGE_SMTP_PASSWORD=$secret_sentinel
STAGE_SMTP_FROM=no-reply@example.test
STAGE_SMTP_INSECURE=false
STAGE_PASSWORD_RESET_CODE_TTL_MINUTES=10
STAGE_PASSWORD_RESET_LOG_CODES=false
SERVICES_SECRET_KEY=$secret_sentinel
STAGE_RUN_MIGRATIONS_ON_STARTUP=false
STAGE_SERVICES_ALLOWED_HOSTS=stage.example.test,localhost,127.0.0.1
STAGE_BACKEND_AUTH_BASE_URL=http://backend:8932/api/v1
STAGE_BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS=stage.example.test,localhost,127.0.0.1
STAGE_ORCHESTRATOR_DATABASE_SERVICE_BASE_URL=http://services:8000
ORCHESTRATOR_HTTP_TIMEOUT_SECONDS=8
ORCHESTRATOR_HTTP_RETRIES=2
ORCHESTRATOR_IDEMPOTENCY_TTL_SECONDS=86400
ORCHESTRATOR_SERVICE_NAME=sb-sofort-orchestrator-service
ORCHESTRATOR_LOG_LEVEL=INFO
AFTERBUY_JV_LOGIN=user
AFTERBUY_JV_PASS=$secret_sentinel
AFTERBUY_XL_LOGIN=user
AFTERBUY_XL_PASS=$secret_sentinel
AFTERBUY_JV_LOGIN_URL=https://example.test/jv/login
AFTERBUY_XL_LOGIN_URL=https://example.test/xl/login
AFTERBUY_JV_COOKIE_CACHE_FILE=/tmp/jv-cookie.json
AFTERBUY_XL_COOKIE_CACHE_FILE=/tmp/xl-cookie.json
BACKEND_UPLOAD_STORAGE_BACKEND=ftp
BACKEND_UPLOAD_FTP_HOST=ftp.example.test
BACKEND_UPLOAD_FTP_USER=user
BACKEND_UPLOAD_FTP_PASS=$secret_sentinel
BACKEND_UPLOAD_FTP_PORT=21
BACKEND_UPLOAD_FTP_ROOT_DIR=warehub
BACKEND_UPLOAD_FTP_STORAGE_ROOT_DIR=storage
BACKEND_UPLOAD_FTP_AVATAR_DIR=avatar
BACKEND_STAGE_UPLOAD_FTP_PUBLIC_BASE_URL=https://stage.example.test/uploads
EOF

  cat > "$candidate_dir/docker-compose.yml" <<'EOF'
services:
  gateway:
    image: ${GATEWAY_IMAGE:?GATEWAY_IMAGE is required}:${GATEWAY_STAGE_TAG:?GATEWAY_STAGE_TAG is required}
    ports:
      - "127.0.0.1:${STAGE_GATEWAY_PORT:?STAGE_GATEWAY_PORT is required}:8080"
EOF

  cat > "$candidate_dir/verify-gateway-only-ports.py" <<'EOF'
#!/usr/bin/env python3
print("gateway validator stub")
EOF

  cp "$script_under_test" "$candidate_dir/run-stage-runtime-reconciliation.sh"
  cp "$candidate_dir/.env" "$live_dir/.env"
  cp "$candidate_dir/docker-compose.yml" "$live_dir/docker-compose.yml"
  printf 'gateway=1\n' > "$live_dir/.env.gateway-candidate"
  printf 'services:\n  gateway:\n    image: canonical\n' > "$live_dir/docker-compose.gateway-candidate.yml"

  live_env_sha="$(sha256sum "$live_dir/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$live_dir/docker-compose.yml" | awk '{print $1}')"
  cat > "$candidate_dir/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1d1615ca4c9bb8ae335bd2edff8052ef384a7d5c
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
EOF

  (
    cd "$candidate_dir"
    sha256sum \
      .env \
      docker-compose.yml \
      verify-gateway-only-ports.py \
      run-stage-runtime-reconciliation.sh \
      metadata.env > candidate.sha256
  )

  chmod 600 "$candidate_dir/.env" "$candidate_dir/docker-compose.yml" "$candidate_dir/verify-gateway-only-ports.py" "$candidate_dir/metadata.env" "$candidate_dir/candidate.sha256"
  chmod 700 "$candidate_dir/run-stage-runtime-reconciliation.sh"
  chmod 600 "$live_dir/.env" "$live_dir/docker-compose.yml" "$live_dir/.env.gateway-candidate" "$live_dir/docker-compose.gateway-candidate.yml"

  printf 'cid-gateway-old' > "$root/docker-state/gateway-container-id"
  printf '0' > "$root/docker-state/gateway-canonicalized"
  : > "$root/docker-state/docker-calls.log"
  : > "$root/docker-state/docker-up.log"
  : > "$root/docker-state/rollback-markers.log"
  : > "$root/docker-state/curl-calls.log"
  : > "$root/docker-state/sleep-calls.log"

  export TEST_FIXTURE_ROOT="$root"
  export TEST_CANDIDATE_DIR="$candidate_dir"
  export TEST_LIVE_DIR="$live_dir"
  export TEST_BACKUP_ROOT="$backup_root"
  export TEST_COMPOSE_PROJECT="warehub-stage"
  export TEST_GATEWAY_PORT="8940"
  export TEST_EXPECTED_SERVICE_COUNT="7"
  export TEST_SECRET_SENTINEL="$secret_sentinel"
  export WAREHUB_TEST_ALLOW_NONCANONICAL_STAGE_PATH=1
  export WAREHUB_STAGE_RUNTIME_RECONCILE_LOCK_PATH_OVERRIDE="$root/stage-runtime-reconcile.lock"
}

create_fake_bin() {
  local root="$1"
  local fake_bin="$root/fake-bin"
  mkdir -p "$fake_bin"

  cat > "$fake_bin/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
state_root="${TEST_FIXTURE_ROOT}/docker-state"
mkdir -p "$state_root"

services=(backend frontend gateway mobile orchestrator postgres services)

record_call() {
  printf '%s\n' "$*" >> "$state_root/docker-calls.log"
}

gateway_compose_label() {
  if [ "$(cat "$state_root/gateway-canonicalized")" = "1" ]; then
    printf '%s/docker-compose.yml' "$TEST_LIVE_DIR"
  else
    printf '%s/docker-compose.gateway-candidate.yml' "$TEST_LIVE_DIR"
  fi
}

gateway_env_label() {
  if [ "$(cat "$state_root/gateway-canonicalized")" = "1" ]; then
    printf '%s/.env' "$TEST_LIVE_DIR"
  else
    printf '%s/.env.gateway-candidate' "$TEST_LIVE_DIR"
  fi
}

container_id_for_service() {
  case "$1" in
    backend) echo cid-backend ;;
    frontend) echo cid-frontend ;;
    gateway) cat "$state_root/gateway-container-id" ;;
    mobile) echo cid-mobile ;;
    orchestrator) echo cid-orchestrator ;;
    postgres) echo cid-postgres ;;
    services) echo cid-services ;;
    *) exit 1 ;;
  esac
}

service_for_container_id() {
  case "$1" in
    cid-backend) echo backend ;;
    cid-frontend) echo frontend ;;
    cid-gateway-old|cid-gateway-new) echo gateway ;;
    cid-mobile) echo mobile ;;
    cid-orchestrator) echo orchestrator ;;
    cid-postgres) echo postgres ;;
    cid-services) echo services ;;
    *) exit 1 ;;
  esac
}

image_ref_for_service() {
  case "$1" in
    backend) echo ghcr.io/ravilkadev0/warehub/backend:stage-8850b9c ;;
    frontend) echo ghcr.io/ravilkadev0/warehub/frontend:stage-758bff4 ;;
    gateway) echo ghcr.io/ravilkadev0/warehub/gateway:stage-758bff4 ;;
    mobile) echo ghcr.io/ravilkadev0/warehub/mobile:stage-8850b9c ;;
    orchestrator) echo ghcr.io/ravilkadev0/warehub/orchestrator:stage-8850b9c ;;
    services) echo ghcr.io/ravilkadev0/warehub/services:stage-8850b9c ;;
    postgres) echo postgres:16-alpine ;;
    *) exit 1 ;;
  esac
}

image_id_for_service() {
  case "$1" in
    backend) echo sha256:image-backend ;;
    frontend) echo sha256:image-frontend ;;
    gateway) echo sha256:image-gateway ;;
    mobile) echo sha256:image-mobile ;;
    orchestrator) echo sha256:image-orchestrator ;;
    services) echo sha256:image-services ;;
    postgres) echo sha256:image-postgres ;;
    *) exit 1 ;;
  esac
}

default_health_for_service() {
  case "$1" in
    gateway|orchestrator|postgres) echo healthy ;;
    *) echo none ;;
  esac
}

mount_lines_for_service() {
  local service="$1"
  case "$service" in
    gateway)
      if [ "$(cat "$state_root/gateway-canonicalized")" = "1" ] && [ "${TEST_VOLUME_DRIFT_AFTER_CANONICALIZATION:-0}" = "1" ]; then
        printf 'volume|warehub-stage_gateway_data|/var/lib/docker/volumes/warehub-stage_gateway_data/_data|/var/cache/nginx\n'
      else
        printf 'volume|warehub-stage_gateway_config|/var/lib/docker/volumes/warehub-stage_gateway_config/_data|/etc/nginx/conf.d\n'
      fi
      ;;
    postgres)
      printf 'volume|warehub-stage_stage_pg_data|/var/lib/docker/volumes/warehub-stage_stage_pg_data/_data|/var/lib/postgresql/data\n'
      ;;
    orchestrator)
      printf 'volume|warehub-stage_stage_orchestrator_data|/var/lib/docker/volumes/warehub-stage_stage_orchestrator_data/_data|/app/data\n'
      ;;
    *)
      printf 'NONE||||\n'
      ;;
  esac
}

record_call "$*"

if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  ref="$5"
  service=""
  for candidate in "${services[@]}"; do
    if [ "$ref" = "$(image_ref_for_service "$candidate")" ]; then
      service="$candidate"
      break
    fi
  done
  [ -n "$service" ] || exit 1
  printf '%s|%s\n' "$(image_id_for_service "$service")" "$ref@sha256:${service}-digest"
  exit 0
fi

if [ "$1" = "inspect" ]; then
  format="$3"
  container_id="$4"
  service="$(service_for_container_id "$container_id")"
  state_var="TEST_SERVICE_STATE_${service}"
  state="${!state_var:-running}"
  health_var="TEST_SERVICE_HEALTH_${service}"
  health="${!health_var:-$(default_health_for_service "$service")}"

  case "$format" in
    '{{ index .Config.Labels "com.docker.compose.project.config_files" }}')
      if [ "$service" = "gateway" ]; then
        gateway_compose_label
      else
        printf '%s/docker-compose.yml' "$TEST_LIVE_DIR"
      fi
      ;;
    '{{ index .Config.Labels "com.docker.compose.project.environment_file" }}')
      if [ "$service" = "gateway" ]; then
        gateway_env_label
      else
        printf '%s/.env' "$TEST_LIVE_DIR"
      fi
      ;;
    '{{ index .Config.Labels "com.docker.compose.service" }}')
      printf '%s' "$service"
      ;;
    '{{.Config.Image}}')
      image_ref_for_service "$service"
      ;;
    '{{.Image}}')
      image_id_for_service "$service"
      ;;
    '{{.State.Status}}')
      printf '%s' "$state"
      ;;
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')
      printf '%s' "$health"
      ;;
    '{{.State.Health.Status}}')
      printf '%s' "$health"
      ;;
    '{{if .State.Health}}{{.Id}}{{end}}')
      if [ "$health" != "none" ]; then
        printf '%s\n' "$container_id"
      fi
      ;;
    '{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Source}}|{{.Destination}}{{"\n"}}{{end}}')
      mount_lines_for_service "$service"
      ;;
    *)
      echo "unsupported docker inspect format: $format" >&2
      exit 1
      ;;
  esac
  exit 0
fi

if [ "$1" = "ps" ]; then
  all=0
  unhealthy_filter=0
  restarting_filter=0
  exited_filter=0
  project_filter=""
  service_filter=""
  format='{{.ID}}'
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -a) all=1 ;;
      --filter)
        case "$2" in
          label=com.docker.compose.project=*) project_filter="${2##*=}" ;;
          label=com.docker.compose.service=*) service_filter="${2##*=}" ;;
          health=unhealthy) unhealthy_filter=1 ;;
          status=restarting) restarting_filter=1 ;;
          status=exited) exited_filter=1 ;;
        esac
        shift
        ;;
      --format)
        format="$2"
        shift
        ;;
    esac
    shift
  done

  [ -z "$project_filter" ] || [ "$project_filter" = "$TEST_COMPOSE_PROJECT" ] || exit 0

  if [ "$unhealthy_filter" = "1" ]; then
    for service in "${services[@]}"; do
      health_var="TEST_SERVICE_HEALTH_${service}"
      if [ "${!health_var:-$(default_health_for_service "$service")}" = "unhealthy" ]; then
        printf '%s\n' "$(container_id_for_service "$service")"
      fi
    done
    exit 0
  fi

  if [ "$restarting_filter" = "1" ] || [ "$exited_filter" = "1" ]; then
    exit 0
  fi

  for service in "${services[@]}"; do
    state_var="TEST_SERVICE_STATE_${service}"
    state="${!state_var:-running}"
    if [ "$all" != "1" ] && [ "$state" != "running" ]; then
      continue
    fi
    if [ "$state" = "missing" ]; then
      continue
    fi
    if [ -n "$service_filter" ] && [ "$service_filter" != "$service" ]; then
      continue
    fi

    id="$(container_id_for_service "$service")"
    case "$format" in
      '{{.ID}}')
        printf '%s\n' "$id"
        ;;
      '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}')
        printf '%s|warehub-stage-%s-1|%s|Up\n' "$id" "$service" "$(image_ref_for_service "$service")"
        ;;
      *)
        printf '%s\n' "$id"
        ;;
    esac
  done | LC_ALL=C sort
  exit 0
fi

if [ "$1" = "compose" ]; then
  shift
  project_name=""
  env_file=""
  compose_file=""
  [ "$1" = "--project-name" ] || exit 1
  project_name="$2"
  shift 2
  [ "$1" = "--env-file" ] || exit 1
  env_file="$2"
  shift 2
  [ "$1" = "-f" ] || exit 1
  compose_file="$2"
  shift 2

  [ "$project_name" = "$TEST_COMPOSE_PROJECT" ] || exit 1

  case "$1" in
    config)
      [ "$2" = "--quiet" ] || exit 1
      if [ "${TEST_COMPOSE_CONFIG_FAIL:-0}" = "1" ]; then
        printf 'compose warning\n'
        exit 1
      fi
      if [ "${TEST_COMPOSE_CONFIG_OUTPUT:-0}" = "1" ]; then
        printf 'compose warning\n'
      fi
      exit 0
      ;;
    up)
      expected_tail='up -d --no-deps --force-recreate gateway'
      actual_tail="$1 $2 $3 $4 $5"
      [ "$actual_tail" = "$expected_tail" ] || exit 1

      allowed_canonical_env="$TEST_LIVE_DIR/.env"
      allowed_canonical_compose="$TEST_LIVE_DIR/docker-compose.yml"
      allowed_rollback_env="$TEST_LIVE_DIR/.env.gateway-candidate"
      allowed_rollback_compose="$TEST_LIVE_DIR/docker-compose.gateway-candidate.yml"

      if [ "$env_file" = "$allowed_canonical_env" ] && [ "$compose_file" = "$allowed_canonical_compose" ]; then
        printf 'canonical\n' >> "$state_root/rollback-markers.log"
        printf '%s\n' "docker compose --project-name $TEST_COMPOSE_PROJECT --env-file $env_file -f $compose_file up -d --no-deps --force-recreate gateway" >> "$state_root/docker-up.log"
        if [ "${TEST_GATEWAY_RECREATE_FAIL:-0}" = "1" ]; then
          exit 1
        fi
        printf 'cid-gateway-new' > "$state_root/gateway-container-id"
        printf '1' > "$state_root/gateway-canonicalized"
        exit 0
      fi

      if [ "$env_file" = "$allowed_rollback_env" ] && [ "$compose_file" = "$allowed_rollback_compose" ]; then
        printf 'rollback\n' >> "$state_root/rollback-markers.log"
        printf '%s\n' "docker compose --project-name $TEST_COMPOSE_PROJECT --env-file $env_file -f $compose_file up -d --no-deps --force-recreate gateway" >> "$state_root/docker-up.log"
        if [ "${TEST_ROLLBACK_GATEWAY_RECREATE_FAIL:-0}" = "1" ]; then
          exit 1
        fi
        printf 'cid-gateway-old' > "$state_root/gateway-container-id"
        printf '0' > "$state_root/gateway-canonicalized"
        exit 0
      fi

      exit 1
      ;;
    *)
      exit 1
      ;;
  esac
fi

echo "unsupported docker invocation: $*" >&2
exit 1
EOF

  cat > "$fake_bin/curl" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
state_root="${TEST_FIXTURE_ROOT}/docker-state"
url="${@: -1}"
printf '%s\n' "$*" >> "$state_root/curl-calls.log"

call_counter() {
  local key="$1"
  local path="$state_root/${key}.count"
  local count=0
  if [ -f "$path" ]; then
    count="$(cat "$path")"
  fi
  count=$((count + 1))
  printf '%s' "$count" > "$path"
  printf '%s' "$count"
}

ready_after_or_default() {
  local name="$1"
  local default_value="$2"
  local value="${!name:-$default_value}"
  printf '%s' "$value"
}

gateway_canonicalized="$(cat "$state_root/gateway-canonicalized" 2>/dev/null || printf '0')"
key=""
expected_after=1
status=200

case "$url" in
  http://127.0.0.1:8940/gateway/healthz)
    key="localhost-gateway"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_LOCAL_GATEWAY_READY_AFTER 1)"
    else
      expected_after=1
    fi
    ;;
  https://stage.example.test/gateway/healthz)
    key="public-gateway"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_PUBLIC_GATEWAY_READY_AFTER 1)"
      status="${TEST_PUBLIC_GATEWAY_FINAL_STATUS:-200}"
    else
      expected_after=1
    fi
    ;;
  https://stage.example.test/login)
    key="public-frontend"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_PUBLIC_FRONTEND_READY_AFTER 1)"
      status="${TEST_PUBLIC_FRONTEND_FINAL_STATUS:-200}"
    else
      expected_after=1
    fi
    ;;
  https://stage.example.test/api/v1/healthz)
    key="public-backend"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_PUBLIC_BACKEND_READY_AFTER 1)"
      status="${TEST_PUBLIC_BACKEND_FINAL_STATUS:-200}"
    else
      expected_after=1
    fi
    ;;
  https://stage.example.test/api/v1/services/healthz)
    key="public-services"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_PUBLIC_SERVICES_READY_AFTER 1)"
      status="${TEST_PUBLIC_SERVICES_FINAL_STATUS:-200}"
    else
      expected_after=1
    fi
    ;;
  https://stage.example.test/api/v1/orchestrator/healthz)
    key="public-orchestrator"
    if [ "$gateway_canonicalized" = "1" ]; then
      expected_after="$(ready_after_or_default TEST_PUBLIC_ORCHESTRATOR_READY_AFTER 1)"
      status="${TEST_PUBLIC_ORCHESTRATOR_FINAL_STATUS:-200}"
    else
      expected_after=1
    fi
    ;;
  *)
    exit 22
    ;;
esac

attempt="$(call_counter "$key")"
if [ "$attempt" -lt "$expected_after" ]; then
  status=503
fi

if [ "$status" = "200" ]; then
  printf '200'
  exit 0
fi

printf '%s' "$status"
exit 22
EOF

  cat > "$fake_bin/python3" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [ "${TEST_GATEWAY_VALIDATOR_FAIL:-0}" = "1" ]; then
  exit 1
fi
if [ "${TEST_YAML_PARSE_ONLY:-0}" = "1" ]; then
  exit 0
fi
exit 0
EOF

  cat > "$fake_bin/flock" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [ "${TEST_FLOCK_FAIL:-0}" = "1" ]; then
  exit 1
fi
exit 0
EOF

  cat > "$fake_bin/sleep" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "${TEST_FIXTURE_ROOT}/docker-state/sleep-calls.log"
exit 0
EOF

  chmod +x "$fake_bin/docker" "$fake_bin/curl" "$fake_bin/python3" "$fake_bin/flock" "$fake_bin/sleep"
  export PATH="$fake_bin:$PATH"
}

run_script_capture() {
  set +e
  LAST_OUTPUT="$("$script_under_test" "$TEST_CANDIDATE_DIR" "$TEST_LIVE_DIR" "$TEST_COMPOSE_PROJECT" "$TEST_GATEWAY_PORT" "$TEST_EXPECTED_SERVICE_COUNT" "$TEST_BACKUP_ROOT" 2>&1)"
  LAST_RC=$?
  set -e
}

with_fixture() {
  local root=""
  local old_path="$PATH"
  local candidate_dir_cleanup=""
  local rc=0

  root="$(new_fixture_root)"
  unset \
    TEST_FLOCK_FAIL \
    TEST_GATEWAY_RECREATE_FAIL \
    TEST_ROLLBACK_GATEWAY_RECREATE_FAIL \
    TEST_COMPOSE_CONFIG_FAIL \
    TEST_COMPOSE_CONFIG_OUTPUT \
    TEST_GATEWAY_VALIDATOR_FAIL \
    TEST_VOLUME_DRIFT_AFTER_CANONICALIZATION \
    TEST_LOCAL_GATEWAY_READY_AFTER \
    TEST_PUBLIC_GATEWAY_READY_AFTER \
    TEST_PUBLIC_FRONTEND_READY_AFTER \
    TEST_PUBLIC_BACKEND_READY_AFTER \
    TEST_PUBLIC_SERVICES_READY_AFTER \
    TEST_PUBLIC_ORCHESTRATOR_READY_AFTER \
    TEST_PUBLIC_GATEWAY_FINAL_STATUS \
    TEST_PUBLIC_FRONTEND_FINAL_STATUS \
    TEST_PUBLIC_BACKEND_FINAL_STATUS \
    TEST_PUBLIC_SERVICES_FINAL_STATUS \
    TEST_PUBLIC_ORCHESTRATOR_FINAL_STATUS \
    WAREHUB_TEST_HOOK_POINT \
    WAREHUB_TEST_HOOK_ACTION \
    WAREHUB_TEST_FORCE_CLEANUP_SECOND_FAILURE \
    TEST_SERVICE_STATE_backend \
    TEST_SERVICE_STATE_frontend \
    TEST_SERVICE_STATE_gateway \
    TEST_SERVICE_STATE_mobile \
    TEST_SERVICE_STATE_orchestrator \
    TEST_SERVICE_STATE_postgres \
    TEST_SERVICE_STATE_services \
    TEST_SERVICE_HEALTH_backend \
    TEST_SERVICE_HEALTH_frontend \
    TEST_SERVICE_HEALTH_gateway \
    TEST_SERVICE_HEALTH_mobile \
    TEST_SERVICE_HEALTH_orchestrator \
    TEST_SERVICE_HEALTH_postgres \
    TEST_SERVICE_HEALTH_services || true

  create_fixture "$root"
  candidate_dir_cleanup="$TEST_CANDIDATE_DIR"
  create_fake_bin "$root"

  set +e
  "$@"
  rc=$?
  PATH="$old_path"
  set -e

  rm -rf -- "$root"
  if [[ -n "$candidate_dir_cleanup" ]] && [[ "$candidate_dir_cleanup" == /tmp/warehub-stage-reconcile.fixture.* ]]; then
    rm -rf -- "$candidate_dir_cleanup"
  fi
  return "$rc"
}

assert_rc() {
  local expected="$1"
  [ "$LAST_RC" -eq "$expected" ]
}

test_invalid_project_impl() {
  set +e
  LAST_OUTPUT="$("$script_under_test" "$TEST_CANDIDATE_DIR" "$TEST_LIVE_DIR" wrong-project "$TEST_GATEWAY_PORT" "$TEST_EXPECTED_SERVICE_COUNT" "$TEST_BACKUP_ROOT" 2>&1)"
  LAST_RC=$?
  set -e
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "compose project name must be warehub-stage"
}

test_invalid_project() {
  with_fixture test_invalid_project_impl
}

test_metadata_command_substitution_rejected_impl() {
  printf 'SOURCE_COMMIT_SHA=$(touch %s/metadata-pwned)\nEXPECTED_LIVE_ENV_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nEXPECTED_LIVE_COMPOSE_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' "$TEST_FIXTURE_ROOT" > "$TEST_CANDIDATE_DIR/metadata.env"
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" &&
    [ ! -e "$TEST_FIXTURE_ROOT/metadata-pwned" ] &&
    assert_contains "$LAST_OUTPUT" "metadata.env contains an invalid line"
}

test_metadata_command_substitution_rejected() {
  with_fixture test_metadata_command_substitution_rejected_impl
}

test_metadata_backticks_rejected_impl() {
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<'EOF'
SOURCE_COMMIT_SHA=`touch hacked`
EXPECTED_LIVE_ENV_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EXPECTED_LIVE_COMPOSE_SHA256=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE"
}

test_metadata_backticks_rejected() {
  with_fixture test_metadata_backticks_rejected_impl
}

test_metadata_duplicate_key_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1d1615ca4c9bb8ae335bd2edff8052ef384a7d5c
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "duplicate key"
}

test_metadata_duplicate_key_rejected() {
  with_fixture test_metadata_duplicate_key_rejected_impl
}

test_metadata_unknown_key_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1d1615ca4c9bb8ae335bd2edff8052ef384a7d5c
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
UNEXPECTED_KEY=123
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "unknown key"
}

test_metadata_unknown_key_rejected() {
  with_fixture test_metadata_unknown_key_rejected_impl
}

test_metadata_quoted_sha_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA="1d1615ca4c9bb8ae335bd2edff8052ef384a7d5c"
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE"
}

test_metadata_quoted_sha_rejected() {
  with_fixture test_metadata_quoted_sha_rejected_impl
}

test_metadata_uppercase_sha_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1D1615CA4C9BB8AE335BD2EDFF8052EF384A7D5C
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "SOURCE_COMMIT_SHA must be a lowercase 40-character SHA"
}

test_metadata_uppercase_sha_rejected() {
  with_fixture test_metadata_uppercase_sha_rejected_impl
}

test_metadata_short_sha_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  live_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1d1615ca4c9bb8ae335bd2edff8052ef384a7d
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EXPECTED_LIVE_COMPOSE_SHA256=$live_compose_sha
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE"
}

test_metadata_short_sha_rejected() {
  with_fixture test_metadata_short_sha_rejected_impl
}

test_metadata_missing_key_rejected_impl() {
  live_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  cat > "$TEST_CANDIDATE_DIR/metadata.env" <<EOF
SOURCE_COMMIT_SHA=1d1615ca4c9bb8ae335bd2edff8052ef384a7d5c
EXPECTED_LIVE_ENV_SHA256=$live_env_sha
EOF
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "must contain exactly three keys"
}

test_metadata_missing_key_rejected() {
  with_fixture test_metadata_missing_key_rejected_impl
}

test_wrong_live_hash_impl() {
  sed -i 's/^EXPECTED_LIVE_ENV_SHA256=.*/EXPECTED_LIVE_ENV_SHA256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' "$TEST_CANDIDATE_DIR/metadata.env"
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_PRE_MUTATION_FAILURE" && assert_contains "$LAST_OUTPUT" "live env SHA-256 does not match expected metadata"
}

test_wrong_live_hash() {
  with_fixture test_wrong_live_hash_impl
}

test_symlink_candidate_impl() {
  rm -f "$TEST_CANDIDATE_DIR/metadata.env"
  ln -s "$TEST_CANDIDATE_DIR/.env" "$TEST_CANDIDATE_DIR/metadata.env"
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "metadata.env must not be a symlink"
}

test_symlink_candidate() {
  with_fixture test_symlink_candidate_impl
}

test_path_traversal_rejected_impl() {
  mkdir -p "$TEST_CANDIDATE_DIR/nested"
  printf x > "$TEST_CANDIDATE_DIR/nested/extra"
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "candidate bundle contains unexpected entries"
}

test_path_traversal_rejected() {
  with_fixture test_path_traversal_rejected_impl
}

test_lock_contention_impl() {
  export TEST_FLOCK_FAIL=1
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "lock is already held"
}

test_lock_contention() {
  with_fixture test_lock_contention_impl
}

test_missing_gateway_candidate_files_impl() {
  rm -f "$TEST_LIVE_DIR/.env.gateway-candidate"
  run_script_capture
  assert_rc "$EXIT_SECURITY_FAILURE" && assert_contains "$LAST_OUTPUT" "required live file not found"
}

test_missing_gateway_candidate_files() {
  with_fixture test_missing_gateway_candidate_files_impl
}

test_wrong_gateway_labels_impl() {
  printf '1' > "$TEST_FIXTURE_ROOT/docker-state/gateway-canonicalized"
  run_script_capture
  assert_rc "$EXIT_PRE_MUTATION_FAILURE" && assert_contains "$LAST_OUTPUT" "gateway container does not point to gateway candidate compose file"
}

test_wrong_gateway_labels() {
  with_fixture test_wrong_gateway_labels_impl
}

test_image_ref_change_rejected_impl() {
  sed -i 's/^GATEWAY_STAGE_TAG=.*/GATEWAY_STAGE_TAG=stage-drift/' "$TEST_LIVE_DIR/.env"
  updated_live_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  sed -i "s/^EXPECTED_LIVE_ENV_SHA256=.*/EXPECTED_LIVE_ENV_SHA256=$updated_live_sha/" "$TEST_CANDIDATE_DIR/metadata.env"
  (
    cd "$TEST_CANDIDATE_DIR"
    sha256sum .env docker-compose.yml verify-gateway-only-ports.py run-stage-runtime-reconciliation.sh metadata.env > candidate.sha256
  )
  run_script_capture
  assert_rc "$EXIT_PRE_MUTATION_FAILURE" && assert_contains "$LAST_OUTPUT" "gateway image ref changed"
}

test_image_ref_change_rejected() {
  with_fixture test_image_ref_change_rejected_impl
}

test_signal_before_mutation_no_rollback_impl() {
  export WAREHUB_TEST_HOOK_POINT=before-first-live-mutation
  export WAREHUB_TEST_HOOK_ACTION=signal:TERM
  run_script_capture
  assert_rc "$EXIT_PRE_MUTATION_FAILURE" &&
    [ ! -s "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log" ] &&
    assert_contains "$LAST_OUTPUT" "received TERM during state PRE_MUTATION"
}

test_signal_before_mutation_no_rollback() {
  with_fixture test_signal_before_mutation_no_rollback_impl
}

test_term_after_env_rename_rolls_back_once_impl() {
  export WAREHUB_TEST_HOOK_POINT=after-live-env-rename
  export WAREHUB_TEST_HOOK_ACTION=signal:TERM
  original_compose_sha="$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')"
  original_env_sha="$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')"
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ] &&
    [ "$(sha256sum "$TEST_LIVE_DIR/.env" | awk '{print $1}')" = "$original_env_sha" ] &&
    [ "$(sha256sum "$TEST_LIVE_DIR/docker-compose.yml" | awk '{print $1}')" = "$original_compose_sha" ]
}

test_term_after_env_rename_rolls_back_once() {
  with_fixture test_term_after_env_rename_rolls_back_once_impl
}

test_hup_after_promotion_rolls_back_once_impl() {
  export WAREHUB_TEST_HOOK_POINT=after-live-promotion
  export WAREHUB_TEST_HOOK_ACTION=signal:HUP
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ] &&
    assert_contains "$LAST_OUTPUT" "received HUP during state PROMOTED"
}

test_hup_after_promotion_rolls_back_once() {
  with_fixture test_hup_after_promotion_rolls_back_once_impl
}

test_term_during_post_validation_rolls_back_once_impl() {
  export WAREHUB_TEST_HOOK_POINT=during-post-validation
  export WAREHUB_TEST_HOOK_ACTION=signal:TERM
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ] &&
    assert_contains "$LAST_OUTPUT" "received TERM during state GATEWAY_RECREATED"
}

test_term_during_post_validation_rolls_back_once() {
  with_fixture test_term_during_post_validation_rolls_back_once_impl
}

test_backup_created_and_atomic_promotion_impl() {
  run_script_capture
  backup_dir="$(find "$TEST_BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  assert_rc "$EXIT_SUCCESS" &&
    [ -n "$backup_dir" ] &&
    [ -f "$backup_dir/live.env" ] &&
    [ -f "$backup_dir/live.docker-compose.yml" ] &&
    [ -f "$backup_dir/volume-snapshot-before.txt" ] &&
    [ ! -e "$TEST_LIVE_DIR/.env.reconcile-new" ] &&
    [ ! -e "$TEST_LIVE_DIR/docker-compose.yml.reconcile-new" ]
}

test_backup_created_and_atomic_promotion() {
  with_fixture test_backup_created_and_atomic_promotion_impl
}

test_gateway_ready_on_third_attempt_impl() {
  export TEST_LOCAL_GATEWAY_READY_AFTER=3
  run_script_capture
  assert_rc "$EXIT_SUCCESS" &&
    [ "$(grep -c 'http://127.0.0.1:8940/gateway/healthz' "$TEST_FIXTURE_ROOT/docker-state/curl-calls.log")" -ge 3 ]
}

test_gateway_ready_on_third_attempt() {
  with_fixture test_gateway_ready_on_third_attempt_impl
}

test_gateway_never_ready_rolls_back_impl() {
  export TEST_LOCAL_GATEWAY_READY_AFTER=99
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ]
}

test_gateway_never_ready_rolls_back() {
  with_fixture test_gateway_never_ready_rolls_back_impl
}

test_public_endpoint_transient_failure_then_success_impl() {
  export TEST_PUBLIC_GATEWAY_READY_AFTER=2
  run_script_capture
  assert_rc "$EXIT_SUCCESS" &&
    [ "$(grep -c 'https://stage.example.test/gateway/healthz' "$TEST_FIXTURE_ROOT/docker-state/curl-calls.log")" -ge 2 ]
}

test_public_endpoint_transient_failure_then_success() {
  with_fixture test_public_endpoint_transient_failure_then_success_impl
}

test_permanent_public_failure_rolls_back_impl() {
  export TEST_PUBLIC_BACKEND_FINAL_STATUS=503
  export TEST_PUBLIC_BACKEND_READY_AFTER=1
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ]
}

test_permanent_public_failure_rolls_back() {
  with_fixture test_permanent_public_failure_rolls_back_impl
}

test_volume_drift_rolls_back_impl() {
  export TEST_VOLUME_DRIFT_AFTER_CANONICALIZATION=1
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log")" -eq 1 ]
}

test_volume_drift_rolls_back() {
  with_fixture test_volume_drift_rolls_back_impl
}

test_gateway_only_recreation_command_impl() {
  run_script_capture
  up_log="$TEST_FIXTURE_ROOT/docker-state/docker-up.log"
  assert_rc "$EXIT_SUCCESS" &&
    assert_file_contains "$up_log" "docker compose --project-name warehub-stage --env-file $TEST_LIVE_DIR/.env -f $TEST_LIVE_DIR/docker-compose.yml up -d --no-deps --force-recreate gateway" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker compose down" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker compose pull" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker compose stop" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker compose restart" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker restart" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker rm" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "docker image rm" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "systemctl restart" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-calls.log" "systemctl reload"
}

test_gateway_only_recreation_command() {
  with_fixture test_gateway_only_recreation_command_impl
}

test_other_services_not_recreated_impl() {
  run_script_capture
  assert_rc "$EXIT_SUCCESS" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-up.log" "backend" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-up.log" "frontend" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-up.log" "services" &&
    assert_file_not_contains "$TEST_FIXTURE_ROOT/docker-state/docker-up.log" "orchestrator"
}

test_other_services_not_recreated() {
  with_fixture test_other_services_not_recreated_impl
}

test_success_cleanup_impl() {
  run_script_capture
  assert_rc "$EXIT_SUCCESS" &&
    [ ! -e "$TEST_LIVE_DIR/.env.gateway-candidate" ] &&
    [ ! -e "$TEST_LIVE_DIR/docker-compose.gateway-candidate.yml" ]
}

test_success_cleanup() {
  with_fixture test_success_cleanup_impl
}

test_partial_cleanup_failure_impl() {
  export WAREHUB_TEST_FORCE_CLEANUP_SECOND_FAILURE=1
  run_script_capture
  assert_rc "$EXIT_CLEANUP_INCOMPLETE" &&
    [ ! -e "$TEST_LIVE_DIR/.env.gateway-candidate" ] &&
    [ -e "$TEST_LIVE_DIR/docker-compose.gateway-candidate.yml" ] &&
    [ "$(grep -c '^rollback$' "$TEST_FIXTURE_ROOT/docker-state/rollback-markers.log" || true)" -eq 0 ]
}

test_partial_cleanup_failure() {
  with_fixture test_partial_cleanup_failure_impl
}

test_promotion_failure_rollback_impl() {
  export TEST_GATEWAY_RECREATE_FAIL=1
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_SUCCEEDED" &&
    [ -e "$TEST_LIVE_DIR/.env.gateway-candidate" ] &&
    [ -e "$TEST_LIVE_DIR/docker-compose.gateway-candidate.yml" ]
}

test_promotion_failure_rollback() {
  with_fixture test_promotion_failure_rollback_impl
}

test_rollback_failure_exit_code_impl() {
  export TEST_GATEWAY_RECREATE_FAIL=1
  export TEST_ROLLBACK_GATEWAY_RECREATE_FAIL=1
  run_script_capture
  assert_rc "$EXIT_ROLLBACK_FAILED" && assert_contains "$LAST_OUTPUT" "rollback failed"
}

test_rollback_failure_exit_code() {
  with_fixture test_rollback_failure_exit_code_impl
}

test_secret_sentinel_not_logged_impl() {
  run_script_capture
  assert_rc "$EXIT_SUCCESS" && assert_not_contains "$LAST_OUTPUT" "$TEST_SECRET_SENTINEL"
}

test_secret_sentinel_not_logged() {
  with_fixture test_secret_sentinel_not_logged_impl
}

test_workflow_exit_code_propagation_static_impl() {
  python3 - "$workflow_under_test" <<'PY'
import pathlib
import re
import sys

workflow_path = pathlib.Path(sys.argv[1])
text = workflow_path.read_text(encoding="utf-8")

forbidden_pattern = re.compile(
    r'if\s+!\s+"\$candidate_dir/run-stage-runtime-reconciliation\.sh"'
    r'[\s\S]*?;\s*then\s+helper_rc=\$\?\s*fi',
    re.MULTILINE,
)
safe_pattern = re.compile(
    r'if\s+"\$candidate_dir/run-stage-runtime-reconciliation\.sh"'
    r'[\s\S]*?;\s*then\s+helper_rc=0\s+else\s+helper_rc=\$\?\s*fi',
    re.MULTILINE,
)
case_exit_pattern = re.compile(
    r'case\s+"\$helper_rc"\s+in[\s\S]*?\n\s*30\)[\s\S]*?\n\s*50\)'
    r'[\s\S]*?esac\s+exit\s+"\$helper_rc"',
    re.MULTILINE,
)

if forbidden_pattern.search(text):
    raise SystemExit("forbidden helper_rc capture pattern is present in workflow")

if not safe_pattern.search(text):
    raise SystemExit("safe helper_rc capture pattern is missing from workflow")

if 'run-stage-runtime-reconciliation.sh" || true' in text:
    raise SystemExit("workflow masks helper exit code with || true")

if not case_exit_pattern.search(text):
    raise SystemExit("workflow no longer preserves helper_rc through case/exit handling")

if 'Stage runtime reconciliation helper failed after live mutation, and rollback also failed.' not in text:
    raise SystemExit("workflow no longer distinguishes helper exit code 30")

if 'Stage runtime reconciliation helper succeeded, but legacy candidate cleanup is incomplete.' not in text:
    raise SystemExit("workflow no longer distinguishes helper exit code 50")
PY
}

test_workflow_exit_code_propagation_static() {
  test_workflow_exit_code_propagation_static_impl
}

test_case "invalid project" test_invalid_project
test_case "metadata command substitution rejected" test_metadata_command_substitution_rejected
test_case "metadata backticks rejected" test_metadata_backticks_rejected
test_case "metadata duplicate key rejected" test_metadata_duplicate_key_rejected
test_case "metadata unknown key rejected" test_metadata_unknown_key_rejected
test_case "metadata quoted sha rejected" test_metadata_quoted_sha_rejected
test_case "metadata uppercase sha rejected" test_metadata_uppercase_sha_rejected
test_case "metadata short sha rejected" test_metadata_short_sha_rejected
test_case "metadata missing key rejected" test_metadata_missing_key_rejected
test_case "wrong live hash" test_wrong_live_hash
test_case "symlink candidate" test_symlink_candidate
test_case "path traversal rejected" test_path_traversal_rejected
test_case "lock contention" test_lock_contention
test_case "missing gateway candidate files" test_missing_gateway_candidate_files
test_case "wrong gateway labels" test_wrong_gateway_labels
test_case "image ref change rejected" test_image_ref_change_rejected
test_case "signal before mutation does not rollback" test_signal_before_mutation_no_rollback
test_case "term after env rename rolls back once" test_term_after_env_rename_rolls_back_once
test_case "hup after promotion rolls back once" test_hup_after_promotion_rolls_back_once
test_case "term during post validation rolls back once" test_term_during_post_validation_rolls_back_once
test_case "backup created and atomic promotion" test_backup_created_and_atomic_promotion
test_case "gateway ready on third attempt" test_gateway_ready_on_third_attempt
test_case "gateway never ready rolls back" test_gateway_never_ready_rolls_back
test_case "public endpoint transient failure then success" test_public_endpoint_transient_failure_then_success
test_case "permanent public failure rolls back" test_permanent_public_failure_rolls_back
test_case "volume drift rolls back" test_volume_drift_rolls_back
test_case "gateway only recreation command" test_gateway_only_recreation_command
test_case "other services not recreated" test_other_services_not_recreated
test_case "success cleanup" test_success_cleanup
test_case "partial cleanup failure" test_partial_cleanup_failure
test_case "promotion failure rollback" test_promotion_failure_rollback
test_case "rollback failure exit code" test_rollback_failure_exit_code
test_case "secret sentinel not logged" test_secret_sentinel_not_logged
test_case "workflow exit code propagation static" test_workflow_exit_code_propagation_static

if [ "$failures" -ne 0 ]; then
  printf 'run-stage-runtime-reconciliation tests failed: %s\n' "$failures" >&2
  exit 1
fi

printf 'run-stage-runtime-reconciliation tests passed.\n'

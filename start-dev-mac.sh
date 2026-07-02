#!/usr/bin/env bash

set -euo pipefail

deps_only=false
no_apps=false
skip_frontend=false
skip_backend=false
skip_services=false
skip_orchestrator=false
with_migrations=false
with_backend_migrations=false

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_env_path="$repo_root/.env"
compose_file="$repo_root/infra/local/docker-compose.dev.yml"
local_dev_log_directory="$repo_root/logs/local-dev"
local_dependency_cache_directory="$repo_root/.venv/local-dev"

app_names=("frontend" "backend" "services" "services-jv-worker" "orchestrator")
app_labels=("Frontend" "Backend" "Database-service" "Database-service JV worker" "Orchestrator")
app_workdirs=(
  "$repo_root/apps/frontend"
  "$repo_root/apps/backend"
  "$repo_root/services/database-service"
  "$repo_root/services/database-service"
  "$repo_root/services/orchestrator"
)
app_urls=(
  "http://127.0.0.1:8931"
  "http://127.0.0.1:8932/api/v1/healthz"
  "http://127.0.0.1:8934/api/v1/healthz"
  "background worker"
  "http://127.0.0.1:8935/api/v1/healthz"
)
app_log_filenames=(
  "frontend.log"
  "backend.log"
  "database-service.log"
  "database-service-jv-worker.log"
  "orchestrator.log"
)
app_pid_filenames=(
  "frontend.pid"
  "backend.pid"
  "database-service.pid"
  "database-service-jv-worker.pid"
  "orchestrator.pid"
)
started_log_paths=("" "" "" "" "")

required_python_version="3.13.2"
python_search_targets=()
python_search_findings=()
loaded_root_env_keys=()

usage() {
  cat <<'EOF'
Usage: ./start-dev-mac.sh [options]

Options:
  --deps-only
  --no-apps
  --skip-frontend
  --skip-backend
  --skip-services
  --skip-orchestrator
  --with-migrations
  --with-backend-migrations
  --help
EOF
}

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
    die "Run start-dev-mac.sh from repo root: $expected"
  fi
}

assert_docker() {
  command_exists docker || die "docker is not available on PATH."
  docker compose version >/dev/null
}

assert_docker_daemon_ready() {
  docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || die "Docker daemon is unavailable. Start Docker Desktop and wait until 'docker info' succeeds."
}

assert_root_env_file() {
  [[ -f "$root_env_path" ]] || die "Missing root .env file: $root_env_path"
}

assert_compose_config() {
  docker compose -f "$compose_file" config >/dev/null
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

import_root_env() {
  local raw_line line key value
  loaded_root_env_keys=()

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
      loaded_root_env_keys+=("$key")
    fi
  done <"$root_env_path"

  if [[ "${#loaded_root_env_keys[@]}" -eq 0 ]]; then
    die "Root .env does not contain any KEY=value entries: $root_env_path"
  fi

  info "Loaded root .env into startup environment (${#loaded_root_env_keys[@]} keys)."
}

get_env_or_default() {
  local name="$1"
  local fallback="$2"
  local current="${!name-}"
  if [[ -n "$current" ]]; then
    printf '%s\n' "$current"
    return
  fi
  printf '%s\n' "$fallback"
}

set_env_if_missing() {
  local name="$1"
  local value="$2"
  if [[ -z "${!name-}" ]]; then
    export "$name=$value"
  fi
}

initialize_local_runtime_env() {
  local frontend_port backend_port services_port orchestrator_port
  local postgres_db postgres_user postgres_password postgres_host postgres_port
  local root_dev_postgres_host backend_origin services_origin orchestrator_origin frontend_origin database_url

  frontend_port="$(get_env_or_default "DEV_FRONTEND_PORT" "8931")"
  backend_port="$(get_env_or_default "DEV_BACKEND_PORT" "8932")"
  services_port="$(get_env_or_default "DEV_SERVICES_PORT" "8934")"
  orchestrator_port="$(get_env_or_default "DEV_ORCHESTRATOR_PORT" "8935")"
  postgres_db="warehub"
  postgres_user="warehub"
  postgres_password="warehub"
  postgres_host="127.0.0.1"
  postgres_port="$(get_env_or_default "DEV_POSTGRES_PORT" "8933")"
  root_dev_postgres_host="${DEV_POSTGRES_HOST-}"
  backend_origin="http://127.0.0.1:$backend_port"
  services_origin="http://127.0.0.1:$services_port"
  orchestrator_origin="http://127.0.0.1:$orchestrator_port"
  frontend_origin="http://127.0.0.1:$frontend_port"
  database_url="postgres://warehub:warehub@127.0.0.1:$postgres_port/warehub"

  export DEV_FRONTEND_PORT="$frontend_port"
  export DEV_BACKEND_PORT="$backend_port"
  export DEV_SERVICES_PORT="$services_port"
  export DEV_ORCHESTRATOR_PORT="$orchestrator_port"
  export DEV_POSTGRES_DB="$postgres_db"
  export DEV_POSTGRES_USER="$postgres_user"
  export DEV_POSTGRES_PASSWORD="$postgres_password"
  export DEV_POSTGRES_HOST="$postgres_host"
  export DEV_POSTGRES_HOST_PORT="$postgres_port"
  export WAREHUB_LOCAL_DEV_ROOT_ENV_ACTIVE="true"
  export APP_ENV="dev"
  export APP_PORT="$backend_port"
  export PORT="$frontend_port"
  export POSTGRES_DB="$postgres_db"
  export POSTGRES_USER="$postgres_user"
  export POSTGRES_PASSWORD="$postgres_password"
  export POSTGRES_HOST="$postgres_host"
  export POSTGRES_PORT="$postgres_port"
  export DATABASE_URL="$database_url"
  export BACKEND_ORIGIN="$backend_origin"
  export SERVICES_ORIGIN="$services_origin"
  export ORCHESTRATOR_ORIGIN="$orchestrator_origin"
  export NEXT_PUBLIC_API_BASE_URL="$backend_origin/api/v1"
  export BACKEND_INTERNAL_API_BASE_URL="http://127.0.0.1:$backend_port/api/v1"
  export BACKEND_API_BASE_URL="$backend_origin/api/v1"
  export NEXT_PUBLIC_SERVICES_API_BASE_URL="$services_origin/api/v1"
  export SERVICES_API_BASE_URL="$services_origin"
  export NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL="$orchestrator_origin/api/v1"
  export ORCHESTRATOR_API_BASE_URL="$orchestrator_origin"
  export MOBILE_DEV_API_BASE_URL="http://127.0.0.1:$backend_port/api/v1"
  export DATABASE_SERVICE_BASE_URL="$services_origin"
  export ORCHESTRATOR_SERVICE_AUTH_TOKEN="warehub-local-orchestrator"
  export ORCHESTRATOR_SERVICE_ALLOWED_HOSTS="127.0.0.1,127.0.0.1"
  export ORCHESTRATOR_HOST="0.0.0.0"
  export ORCHESTRATOR_PORT="$orchestrator_port"

  set_env_if_missing "SKIP_DB_MIGRATIONS" "true"
  set_env_if_missing "CORS_ALLOW_ORIGINS" "$frontend_origin,http://127.0.0.1:$frontend_port"
  set_env_if_missing "ALLOWED_HOSTS" "127.0.0.1,127.0.0.1"
  set_env_if_missing "CORS_ALLOWED_ORIGINS" "$frontend_origin,http://127.0.0.1:$frontend_port"
  set_env_if_missing "CSRF_TRUSTED_ORIGINS" "$frontend_origin,http://127.0.0.1:$frontend_port"
  set_env_if_missing "BACKEND_AUTH_BASE_URL" "http://127.0.0.1:$backend_port/api/v1"
  set_env_if_missing "BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS" "127.0.0.1,127.0.0.1"
  set_env_if_missing "NEXT_PUBLIC_APP_ENV" "dev"

  if [[ -n "$root_dev_postgres_host" && "$root_dev_postgres_host" != "127.0.0.1" && "$root_dev_postgres_host" != "127.0.0.1" ]]; then
    info "Overriding nonlocal DEV_POSTGRES_HOST for local runtime with 127.0.0.1."
  fi

  info "Derived local runtime env from root .env for frontend, backend, services, and orchestrator."
}

get_python_version_string() {
  local python_path="$1"
  shift || true
  "$python_path" "$@" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")' 2>/dev/null | head -n 1 | tr -d '\r'
}

test_required_python_version() {
  local python_path="$1"
  shift || true
  local version_text
  version_text="$(get_python_version_string "$python_path" "$@")"
  [[ "$version_text" == "$required_python_version" ]]
}

add_python_search_finding() {
  local candidate="$1"
  local version="${2-}"
  if [[ -z "$version" ]]; then
    python_search_findings+=("$candidate=<unresolved>")
    return
  fi
  python_search_findings+=("$candidate=$version")
}

resolve_python() {
  python_search_targets=("python3.13" "python3" "python")
  python_search_findings=()
  local version_text

  if command_exists python3.13; then
    version_text="$(get_python_version_string "$(command -v python3.13)")"
    add_python_search_finding "python3.13" "$version_text"
    if [[ "$version_text" == "$required_python_version" ]]; then
      printf '%s\n' "$(command -v python3.13)"
      return
    fi
  fi

  if command_exists python3; then
    version_text="$(get_python_version_string "$(command -v python3)")"
    add_python_search_finding "python3" "$version_text"
    if [[ "$version_text" == "$required_python_version" ]]; then
      printf '%s\n' "$(command -v python3)"
      return
    fi
  fi

  if command_exists python; then
    version_text="$(get_python_version_string "$(command -v python)")"
    add_python_search_finding "python" "$version_text"
    if [[ "$version_text" == "$required_python_version" ]]; then
      printf '%s\n' "$(command -v python)"
      return
    fi
  fi

  die "Unable to find Python $required_python_version on PATH. Checked: ${python_search_targets[*]}. Found versions: ${python_search_findings[*]:-none}. Install Python $required_python_version and make either 'python3.13', 'python3', or 'python' point to that exact version."
}

ensure_local_dependency_cache_directory() {
  mkdir -p "$local_dependency_cache_directory"
}

ensure_local_dev_log_directory() {
  mkdir -p "$local_dev_log_directory"
}

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

get_combined_file_hash() {
  local path hash
  for path in "$@"; do
    hash="$(sha256_file "$path")"
    printf '%s|%s\n' "$path" "$hash"
  done | LC_ALL=C sort | shasum -a 256 | awk '{print $1}'
}

test_app_selected_for_startup() {
  local app_name="$1"

  if [[ "$deps_only" == true || "$no_apps" == true ]]; then
    return 1
  fi

  case "$app_name" in
    frontend) [[ "$skip_frontend" == false ]] ;;
    backend) [[ "$skip_backend" == false ]] ;;
    services) [[ "$skip_services" == false ]] ;;
    orchestrator) [[ "$skip_orchestrator" == false ]] ;;
    *) return 1 ;;
  esac
}

ensure_frontend_dependencies() {
  local frontend_directory="$repo_root/apps/frontend"
  local package_json_path="$frontend_directory/package.json"
  local package_lock_path="$frontend_directory/package-lock.json"
  local pnpm_lock_path="$frontend_directory/pnpm-lock.yaml"
  local yarn_lock_path="$frontend_directory/yarn.lock"
  local hash_file_path="$local_dependency_cache_directory/frontend.dependencies.sha256"
  local node_modules_path="$frontend_directory/node_modules"
  local dependency_inputs=("$package_json_path")
  local install_command=("install")
  local current_hash previous_hash should_install=false

  command_exists npm || die "Unable to find npm on PATH."

  if [[ -f "$package_lock_path" ]]; then
    dependency_inputs+=("$package_lock_path")
    install_command=("ci")
  elif [[ -f "$pnpm_lock_path" ]]; then
    dependency_inputs+=("$pnpm_lock_path")
  elif [[ -f "$yarn_lock_path" ]]; then
    dependency_inputs+=("$yarn_lock_path")
  fi

  info "frontend dependency cache path: $hash_file_path"

  current_hash="$(get_combined_file_hash "${dependency_inputs[@]}")"
  if [[ -f "$hash_file_path" ]]; then
    previous_hash="$(tr -d '[:space:]' <"$hash_file_path")"
  else
    previous_hash=""
  fi

  if [[ ! -d "$node_modules_path" || -z "$previous_hash" || "$current_hash" != "$previous_hash" ]]; then
    should_install=true
  fi

  if [[ "$should_install" == false ]]; then
    info "frontend dependencies unchanged; skipping install."
    return
  fi

  info "frontend dependency hash changed or node_modules missing; installing dependencies."
  (
    cd "$frontend_directory"
    npm "${install_command[@]}"
  )
  printf '%s\n' "$current_hash" >"$hash_file_path"
}

test_python313_2() {
  local python_path="$1"
  test_required_python_version "$python_path"
}

assert_managed_venv_path() {
  local venv_path="$1"
  local managed_venv_root="$repo_root/.venv"

  case "$venv_path" in
    "$managed_venv_root"|"$managed_venv_root"/*) ;;
    *) die "Refusing to modify unmanaged virtual environment path: $venv_path" ;;
  esac
}

recreate_managed_venv() {
  local service_name="$1"
  local venv_path="$2"
  local python_bootstrap="$3"

  assert_managed_venv_path "$venv_path"
  rm -rf "$venv_path"
  mkdir -p "$(dirname "$venv_path")"
  info "$service_name virtual environment missing or invalid; creating $venv_path"
  "$python_bootstrap" -m venv "$venv_path"
}

ensure_python_service_dependencies() {
  local service_name="$1"
  local working_directory="$2"
  local venv_path="$3"
  local python_env_name="$4"
  local venv_env_name="$5"
  local requirements_path="$working_directory/requirements.txt"
  local venv_python_path="$venv_path/bin/python"
  local hash_file_path="$local_dependency_cache_directory/$service_name.requirements.sha256"
  local python_bootstrap current_hash previous_hash should_install=false recreated=false pip_args

  [[ -f "$requirements_path" ]] || die "Missing dependency manifest: $requirements_path"
  python_bootstrap="$(resolve_python)"

  info "$service_name venv path: $venv_path"

  if [[ ! -x "$venv_python_path" ]]; then
    recreate_managed_venv "$service_name" "$venv_path" "$python_bootstrap"
    recreated=true
  elif ! test_python313_2 "$venv_python_path"; then
    info "$service_name virtual environment is not using Python $required_python_version; recreating $venv_path"
    recreate_managed_venv "$service_name" "$venv_path" "$python_bootstrap"
    recreated=true
  fi

  current_hash="$(get_combined_file_hash "$requirements_path")"
  if [[ -f "$hash_file_path" ]]; then
    previous_hash="$(tr -d '[:space:]' <"$hash_file_path")"
  else
    previous_hash=""
  fi

  if [[ "$recreated" == true || -z "$previous_hash" || "$current_hash" != "$previous_hash" ]]; then
    should_install=true
  fi

  if [[ "$should_install" == true ]]; then
    if [[ "$recreated" == true ]]; then
      info "$service_name virtual environment recreated; installing dependencies."
    else
      info "$service_name dependency hash changed; installing dependencies."
    fi

    pip_args=(-m pip install --disable-pip-version-check -r "$requirements_path")
    (
      cd "$working_directory"
      "$venv_python_path" "${pip_args[@]}"
    )
    printf '%s\n' "$current_hash" >"$hash_file_path"
  else
    info "$service_name dependencies unchanged; skipping install."
  fi

  export "$python_env_name=$venv_python_path"
  export "$venv_env_name=$venv_path"
}

ensure_backend_dependencies() {
  command_exists cargo || die "Backend requires cargo on PATH."
}

get_docker_compose_container_id() {
  local service_name="$1"
  docker compose -f "$compose_file" ps -q "$service_name" | tr -d '[:space:]'
}

get_dependency_container_state() {
  local service_name="$1"
  local container_id state
  container_id="$(get_docker_compose_container_id "$service_name")"

  if [[ -z "$container_id" ]]; then
    printf '%s\n' "missing"
    return
  fi

  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" | tr -d '[:space:]')"
  if [[ -z "$state" ]]; then
    printf '%s\n' "unknown"
    return
  fi

  printf '%s\n' "$state"
}

test_local_dependencies_healthy() {
  local service_name required_state state
  local services=("warehub-postgres:healthy" "warehub-redis:running_or_healthy" "warehub-minio:running_or_healthy" "warehub-rabbitmq:running_or_healthy")

  for service_name in "${services[@]}"; do
    required_state="${service_name##*:}"
    service_name="${service_name%%:*}"
    state="$(get_dependency_container_state "$service_name")"

    if [[ "$required_state" == "healthy" ]]; then
      [[ "$state" == "healthy" ]] || return 1
    else
      [[ "$state" == "running" || "$state" == "healthy" ]] || return 1
    fi
  done

  return 0
}

wait_for_dependency_state() {
  local service_name="$1"
  local label="$2"
  local require_healthy="$3"
  local timeout_seconds="${4:-90}"
  local deadline state

  deadline=$((SECONDS + timeout_seconds))
  while (( SECONDS < deadline )); do
    state="$(get_dependency_container_state "$service_name")"
    if [[ "$require_healthy" == "true" ]]; then
      if [[ "$state" == "healthy" ]]; then
        return
      fi
      if [[ "$state" == "unhealthy" || "$state" == "exited" || "$state" == "dead" ]]; then
        die "$label container is not healthy: $state"
      fi
    else
      if [[ "$state" == "running" || "$state" == "healthy" ]]; then
        return
      fi
      if [[ "$state" == "exited" || "$state" == "dead" ]]; then
        die "$label container is not running: $state"
      fi
    fi
    sleep 2
  done

  die "Timed out waiting for $label local dependency readiness."
}

wait_for_local_dependencies_ready() {
  wait_for_dependency_state "warehub-postgres" "Postgres" "true"
  wait_for_dependency_state "warehub-redis" "Redis" "false"
  wait_for_dependency_state "warehub-minio" "MinIO" "false"
  wait_for_dependency_state "warehub-rabbitmq" "RabbitMQ" "false"
  info "Local Docker dependencies are ready."
}

start_local_dependencies() {
  if test_local_dependencies_healthy; then
    info "Docker dependencies already running; reusing existing containers."
    return
  fi

  info "Starting missing or unhealthy Docker dependencies..."
  docker compose -f "$compose_file" up -d
  wait_for_local_dependencies_ready
}

should_skip_app() {
  local app_name="$1"
  case "$app_name" in
    frontend) [[ "$skip_frontend" == true ]] ;;
    backend) [[ "$skip_backend" == true ]] ;;
    services) [[ "$skip_services" == true ]] ;;
    services-jv-worker) [[ "$skip_services" == true ]] ;;
    orchestrator) [[ "$skip_orchestrator" == true ]] ;;
    *) return 1 ;;
  esac
}

build_local_runtime_env_lines() {
  local keys=(
    DEV_FRONTEND_PORT
    DEV_BACKEND_PORT
    DEV_SERVICES_PORT
    DEV_ORCHESTRATOR_PORT
    DEV_POSTGRES_DB
    DEV_POSTGRES_USER
    DEV_POSTGRES_PASSWORD
    DEV_POSTGRES_HOST
    DEV_POSTGRES_HOST_PORT
    WAREHUB_LOCAL_DEV_ROOT_ENV_ACTIVE
    APP_ENV
    APP_PORT
    PORT
    POSTGRES_DB
    POSTGRES_USER
    POSTGRES_PASSWORD
    POSTGRES_HOST
    POSTGRES_PORT
    DATABASE_URL
    BACKEND_ORIGIN
    SERVICES_ORIGIN
    ORCHESTRATOR_ORIGIN
    NEXT_PUBLIC_API_BASE_URL
    BACKEND_INTERNAL_API_BASE_URL
    BACKEND_API_BASE_URL
    NEXT_PUBLIC_SERVICES_API_BASE_URL
    SERVICES_API_BASE_URL
    NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL
    ORCHESTRATOR_API_BASE_URL
    MOBILE_DEV_API_BASE_URL
    DATABASE_SERVICE_BASE_URL
    ORCHESTRATOR_SERVICE_AUTH_TOKEN
    ORCHESTRATOR_SERVICE_ALLOWED_HOSTS
    ORCHESTRATOR_HOST
    ORCHESTRATOR_PORT
    SKIP_DB_MIGRATIONS
    CORS_ALLOW_ORIGINS
    ALLOWED_HOSTS
    CORS_ALLOWED_ORIGINS
    CSRF_TRUSTED_ORIGINS
    BACKEND_AUTH_BASE_URL
    BACKEND_SESSION_BRIDGE_ALLOWED_HOSTS
    NEXT_PUBLIC_APP_ENV
    DATABASE_SERVICE_PYTHON_EXE
    DATABASE_SERVICE_VENV_PATH
    ORCHESTRATOR_PYTHON_EXE
    ORCHESTRATOR_VENV_PATH
  )
  local key value

  for key in "${keys[@]}"; do
    value="${!key-}"
    [[ -n "$value" ]] || continue
    printf '%s=%s\n' "$key" "$value"
  done
}

reset_local_dev_log_file() {
  local path="$1"
  local directory resolved_path base_name extension timestamp
  directory="$(dirname "$path")"
  mkdir -p "$directory"
  resolved_path="$path"

  if [[ -e "$path" ]] && ! rm -f "$path" 2>/dev/null; then
    base_name="${path##*/}"
    extension=""
    if [[ "$base_name" == *.* ]]; then
      extension=".${base_name##*.}"
      base_name="${base_name%.*}"
    fi
    timestamp="$(date '+%Y%m%d-%H%M%S')"
    resolved_path="$directory/${base_name}-${timestamp}${extension}"
    warn "Log file is locked and cannot be replaced: $path"
    info "Using fallback log file: $resolved_path"
  fi

  : >"$resolved_path"
  printf '%s\n' "$resolved_path"
}

get_command_for_app() {
  local app_name="$1"

  case "$app_name" in
    frontend) printf '%s\n' "npm run dev" ;;
    backend)
      if [[ "$with_backend_migrations" == true ]]; then
        printf '%s\n' "env SKIP_DB_MIGRATIONS=false cargo run"
      else
        printf '%s\n' "cargo run"
      fi
      ;;
    services)
      if [[ "$with_migrations" == true ]]; then
        printf '%s\n' "\"$DATABASE_SERVICE_PYTHON_EXE\" manage.py migrate --fake-initial --noinput && \"$DATABASE_SERVICE_PYTHON_EXE\" manage.py runserver 0.0.0.0:8934"
      else
        printf '%s\n' "\"$DATABASE_SERVICE_PYTHON_EXE\" manage.py runserver 0.0.0.0:8934"
      fi
      ;;
    services-jv-worker)
      printf '%s\n' "\"$DATABASE_SERVICE_PYTHON_EXE\" manage.py run_jv_batch_worker"
      ;;
    orchestrator)
      printf '%s\n' "\"$ORCHESTRATOR_PYTHON_EXE\" -m uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload --reload-dir src --reload-exclude 'data/*'"
      ;;
    *) die "Unsupported app: $app_name" ;;
  esac
}

start_app_in_background() {
  local app_index="$1"
  local app_name="$2"
  local app_label="$3"
  local working_directory="$4"
  local log_path="$5"
  local pid_path="$6"
  local command_text launcher_python runtime_env_lines

  command_text="$(get_command_for_app "$app_name")"
  started_log_paths[$app_index]="$log_path"
  launcher_python="$(resolve_python)"
  runtime_env_lines="$(build_local_runtime_env_lines)"

  APP_WORKING_DIRECTORY="$working_directory" \
  APP_LOG_PATH="$log_path" \
  APP_PID_PATH="$pid_path" \
  APP_COMMAND_TEXT="$command_text" \
  APP_NAME="$app_name" \
  APP_RUNTIME_ENV_LINES="$runtime_env_lines" \
  "$launcher_python" - <<'PY'
import os
import subprocess

working_directory = os.environ["APP_WORKING_DIRECTORY"]
log_path = os.environ["APP_LOG_PATH"]
pid_path = os.environ["APP_PID_PATH"]
command_text = os.environ["APP_COMMAND_TEXT"]
app_name = os.environ["APP_NAME"]
runtime_env_lines = os.environ.get("APP_RUNTIME_ENV_LINES", "")

shell_command = (
    f"cd {subprocess.list2cmdline([working_directory])} && "
    f"echo Starting {app_name} in {subprocess.list2cmdline([working_directory])} >> {subprocess.list2cmdline([log_path])} && "
    f"( {command_text} ) >> {subprocess.list2cmdline([log_path])} 2>&1; "
    f"status=$?; echo Process {app_name} exited with status $status >> {subprocess.list2cmdline([log_path])}"
)

child_env = os.environ.copy()
for raw_line in runtime_env_lines.splitlines():
    line = raw_line.strip()
    if not line or "=" not in line:
        continue
    key, value = line.split("=", 1)
    child_env[key] = value

with open(os.devnull, "rb") as stdin_stream:
    process = subprocess.Popen(
        ["bash", "-lc", shell_command],
        env=child_env,
        stdin=stdin_stream,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
with open(pid_path, "w", encoding="utf-8") as pid_file:
    pid_file.write(f"{process.pid}\n")
PY
  info "Started $app_label in background. Log: $log_path"
}

start_local_apps() {
  local enabled_count=0 index default_log_path log_path pid_path

  for index in "${!app_names[@]}"; do
    if should_skip_app "${app_names[$index]}"; then
      continue
    fi
    enabled_count=$((enabled_count + 1))
  done

  if (( enabled_count == 0 )); then
    info "No local app processes selected."
    return
  fi

  info "Starting local apps..."

  for index in "${!app_names[@]}"; do
    if should_skip_app "${app_names[$index]}"; then
      continue
    fi
    default_log_path="$local_dev_log_directory/${app_log_filenames[$index]}"
    log_path="$(reset_local_dev_log_file "$default_log_path")"
    pid_path="$local_dev_log_directory/${app_pid_filenames[$index]}"
    rm -f "$pid_path"
    start_app_in_background "$index" "${app_names[$index]}" "${app_labels[$index]}" "${app_workdirs[$index]}" "$log_path" "$pid_path"
  done
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

get_listening_process_ids_for_port() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

stop_warehub_local_app_processes() {
  local ports=(8931 8932 8934 8935)
  local stopped_any=false
  local port attempt process_ids index pid_path

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

  for index in "${!app_pid_filenames[@]}"; do
    pid_path="$local_dev_log_directory/${app_pid_filenames[$index]}"
    if [[ -f "$pid_path" ]]; then
      stop_pid_file_process "$pid_path"
      stopped_any=true
    fi
  done

  if [[ "$stopped_any" == false ]]; then
    info "No WareHub app listeners were running on ports 8931, 8932, 8934, 8935."
  fi
}

print_startup_summary() {
  local app_mode log_path index

  if [[ "$deps_only" == true || "$no_apps" == true ]]; then
    app_mode="Dependencies only"
  else
    app_mode="Dependencies started, apps running in background"
  fi

  info ""
  info "WareHub local dev startup complete."
  info "Mode: $app_mode"
  info "Local env source of truth: $root_env_path"

  if [[ "$deps_only" == false && "$no_apps" == false ]]; then
    info ""
    info "Started services:"
    for index in "${!app_names[@]}"; do
      if should_skip_app "${app_names[$index]}"; then
        continue
      fi
      info "  ${app_labels[$index]}: ${app_urls[$index]}"
    done

    info ""
    info "Logs:"
    for index in "${!app_names[@]}"; do
      if should_skip_app "${app_names[$index]}"; then
        continue
      fi
      log_path="${started_log_paths[$index]}"
      if [[ -z "$log_path" ]]; then
        log_path="$local_dev_log_directory/${app_log_filenames[$index]}"
      fi
      info "  ${app_labels[$index]}: $log_path"
    done
  fi

  if [[ "$skip_orchestrator" == false && "$skip_services" == true ]]; then
    info ""
    warn "Database-service is skipped while orchestrator is running."
    warn "Product Editor and other orchestrator flows that call database-service will fail until services are started."
  fi

  info ""
  info "Local URLs:"
  info "  Frontend:            http://127.0.0.1:8931"
  info "  Backend:             http://127.0.0.1:8932"
  info "  Backend API:         http://127.0.0.1:8932/api/v1"
  info "  Backend health:      http://127.0.0.1:8932/api/v1/healthz"
  info "  Database-service:    http://127.0.0.1:8934"
  info "  Services health:     http://127.0.0.1:8934/api/v1/healthz"
  info "  Orchestrator:        http://127.0.0.1:8935"
  info "  Orchestrator health: http://127.0.0.1:8935/api/v1/healthz"
  info "  Postgres:            127.0.0.1:8933"
  info "  Redis:               127.0.0.1:8936"
  info "  RabbitMQ:            127.0.0.1:8937"
  info "  RabbitMQ UI:         http://127.0.0.1:15672"
  info "  MinIO API:           http://127.0.0.1:9000"
  info "  MinIO Console:       http://127.0.0.1:9001"

  info ""
  info "Manual smoke checks:"
  info "  curl -fsS http://127.0.0.1:8932/api/v1/healthz"
  info "  curl -fsS http://127.0.0.1:8934/api/v1/healthz"
  info "  curl -fsS http://127.0.0.1:8935/api/v1/healthz"

  info ""
  if [[ "$with_migrations" == true || "$with_backend_migrations" == true ]]; then
    if [[ "$with_migrations" == true ]]; then
      info "WithMigrations enabled: database-service will run 'manage.py migrate' before runserver."
    fi
    if [[ "$with_backend_migrations" == true ]]; then
      info "WithBackendMigrations enabled: backend will start with SKIP_DB_MIGRATIONS=false."
    fi
  else
    info "Migrations are not run automatically."
    info "Pass --with-migrations for local Django migrations."
    info "Pass --with-backend-migrations for local backend SQLx migrations."
  fi
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --deps-only) deps_only=true ;;
    --no-apps) no_apps=true ;;
    --skip-frontend) skip_frontend=true ;;
    --skip-backend) skip_backend=true ;;
    --skip-services) skip_services=true ;;
    --skip-orchestrator) skip_orchestrator=true ;;
    --with-migrations) with_migrations=true ;;
    --with-backend-migrations) with_backend_migrations=true ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
  shift
done

assert_repo_root
assert_docker
assert_docker_daemon_ready
assert_root_env_file
import_root_env
initialize_local_runtime_env
assert_compose_config
ensure_local_dev_log_directory
ensure_local_dependency_cache_directory
info "Cleaning previous WareHub local app processes..."
stop_warehub_local_app_processes
start_local_dependencies

if test_app_selected_for_startup "frontend"; then
  ensure_frontend_dependencies
fi
if test_app_selected_for_startup "backend"; then
  ensure_backend_dependencies
fi
if test_app_selected_for_startup "services"; then
  ensure_python_service_dependencies "database-service" "$repo_root/services/database-service" "$repo_root/.venv/database-service" "DATABASE_SERVICE_PYTHON_EXE" "DATABASE_SERVICE_VENV_PATH"
fi
if test_app_selected_for_startup "orchestrator"; then
  ensure_python_service_dependencies "orchestrator" "$repo_root/services/orchestrator" "$repo_root/.venv/orchestrator" "ORCHESTRATOR_PYTHON_EXE" "ORCHESTRATOR_VENV_PATH"
fi

if [[ "$deps_only" == false && "$no_apps" == false ]]; then
  start_local_apps
fi

print_startup_summary

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
compose_file="$repo_root/infra/local/docker-compose.dev.yml"
local_dev_log_directory="$repo_root/logs/local-dev"

app_names=("frontend" "backend" "services" "orchestrator")
app_labels=("Frontend" "Backend" "Database-service" "Orchestrator")
app_workdirs=(
  "$repo_root/apps/frontend"
  "$repo_root/apps/backend"
  "$repo_root/services/database-service"
  "$repo_root/services/orchestrator"
)
app_urls=(
  "http://localhost:8931"
  "http://localhost:8932/healthz"
  "http://localhost:8934/healthz"
  "http://localhost:8935/healthz"
)
app_log_filenames=(
  "frontend.log"
  "backend.log"
  "database-service.log"
  "orchestrator.log"
)
started_log_paths=("" "" "" "")

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

resolve_python() {
  if command_exists python3; then
    printf '%s\n' "python3"
    return
  fi

  if command_exists python; then
    printf '%s\n' "python"
    return
  fi

  die "Unable to find Python. Install python3 or add python to PATH."
}

resolve_python_for_directory() {
  local working_directory="$1"
  local venv_python="$working_directory/.venv/bin/python"

  if [[ -x "$venv_python" ]]; then
    printf '%s\n' "$venv_python"
    return
  fi

  resolve_python
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

assert_compose_config() {
  docker compose -f "$compose_file" config >/dev/null
}

assert_local_requirements() {
  [[ -f "$repo_root/apps/backend/.env.example" ]] || die "Missing env example: $repo_root/apps/backend/.env.example"
  [[ -f "$repo_root/apps/frontend/.env.example" ]] || die "Missing env example: $repo_root/apps/frontend/.env.example"
  [[ -f "$repo_root/services/database-service/.env.example" ]] || die "Missing env example: $repo_root/services/database-service/.env.example"
  [[ -f "$repo_root/services/orchestrator/.env.example" ]] || die "Missing env example: $repo_root/services/orchestrator/.env.example"
}

ensure_frontend_dependencies() {
  local working_directory="$repo_root/apps/frontend"
  command_exists npm || die "Frontend requires npm on PATH."

  if [[ -x "$working_directory/node_modules/.bin/next" ]]; then
    return
  fi

  info "Frontend dependencies are missing. Running npm ci in $working_directory"
  (
    cd "$working_directory"
    npm ci
  )
}

ensure_backend_dependencies() {
  command_exists cargo || die "Backend requires cargo on PATH."
}

ensure_python_virtualenv() {
  local working_directory="$1"
  local python_cmd="$2"

  if [[ -x "$working_directory/.venv/bin/python" ]]; then
    return
  fi

  if command_exists uv; then
    info "Creating Python virtualenv with uv in $working_directory"
    (
      cd "$working_directory"
      uv venv
    )
    return
  fi

  info "Creating Python virtualenv with $python_cmd in $working_directory"
  "$python_cmd" -m venv "$working_directory/.venv"
}

install_python_requirements() {
  local working_directory="$1"
  local requirements_file="$2"
  local base_python_cmd="$3"
  local venv_python="$working_directory/.venv/bin/python"

  ensure_python_virtualenv "$working_directory" "$base_python_cmd"

  if command_exists uv; then
    info "Installing Python requirements with uv in $working_directory"
    (
      cd "$working_directory"
      uv pip install --python "$venv_python" -r "$requirements_file"
    )
    return
  fi

  info "Installing Python requirements with pip in $working_directory"
  if "$venv_python" -m pip install -r "$requirements_file"; then
    return
  fi

  if grep -q '^httpx' "$requirements_file" && ! "$venv_python" -c "import httpcore" >/dev/null 2>&1; then
    info "pip install failed and httpcore is still missing. Trying direct httpcore wheel bootstrap from PyPI JSON."
    install_httpcore_direct "$venv_python"
    "$venv_python" -m pip install -r "$requirements_file"
    return
  fi

  die "Python requirements install failed: $requirements_file"
}

install_httpcore_direct() {
  local venv_python="$1"
  local wheel_url

  wheel_url="$("$venv_python" - <<'PY'
import json
import sys
import urllib.request

with urllib.request.urlopen("https://pypi.org/pypi/httpcore/json", timeout=20) as response:
    data = json.load(response)

release = data["info"]["version"]
for file_info in data["releases"][release]:
    filename = file_info.get("filename", "")
    if filename.endswith(".whl"):
        print(file_info["url"])
        sys.exit(0)

sys.exit("No httpcore wheel URL found in PyPI JSON")
PY
)" || die "Unable to resolve httpcore wheel URL from PyPI JSON."

  info "Installing direct httpcore wheel: $wheel_url"
  "$venv_python" -m pip install "$wheel_url"
}

ensure_database_service_dependencies() {
  local working_directory="$repo_root/services/database-service"
  local python_cmd requirements_file
  requirements_file="$working_directory/requirements.txt"
  python_cmd="$(resolve_python)"

  if [[ -x "$working_directory/.venv/bin/python" ]] && "$working_directory/.venv/bin/python" -c "import django" >/dev/null 2>&1; then
    return
  fi

  if "$python_cmd" -c "import django" >/dev/null 2>&1; then
    return
  fi

  install_python_requirements "$working_directory" "$requirements_file" "$python_cmd"
  "$working_directory/.venv/bin/python" -c "import django" >/dev/null 2>&1 || die "Database-service Python dependencies are still unavailable after install. Source of truth: $requirements_file"
}

ensure_orchestrator_dependencies() {
  local working_directory="$repo_root/services/orchestrator"
  local python_cmd requirements_file
  requirements_file="$working_directory/requirements.txt"
  python_cmd="$(resolve_python)"

  if [[ -x "$working_directory/.venv/bin/python" ]] && "$working_directory/.venv/bin/python" -c "import uvicorn" >/dev/null 2>&1; then
    return
  fi

  if "$python_cmd" -c "import uvicorn" >/dev/null 2>&1; then
    return
  fi

  install_python_requirements "$working_directory" "$requirements_file" "$python_cmd"
  "$working_directory/.venv/bin/python" -c "import uvicorn" >/dev/null 2>&1 || die "Orchestrator Python dependencies are still unavailable after install. Source of truth: $requirements_file"
}

ensure_selected_app_dependencies() {
  if [[ "$deps_only" == true || "$no_apps" == true ]]; then
    return
  fi

  if [[ "$skip_frontend" == false ]]; then
    ensure_frontend_dependencies
  fi

  if [[ "$skip_backend" == false ]]; then
    ensure_backend_dependencies
  fi

  if [[ "$skip_services" == false ]]; then
    ensure_database_service_dependencies
  fi

  if [[ "$skip_orchestrator" == false ]]; then
    ensure_orchestrator_dependencies
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

set_dotenv_value() {
  local path="$1"
  local key="$2"
  local value="$3"
  local tmp_file escaped_value
  tmp_file="$(mktemp)"
  escaped_value="$(escape_sed_replacement "$value")"

  if grep -q "^${key}=" "$path"; then
    sed "s/^${key}=.*/${key}=${escaped_value}/" "$path" >"$tmp_file"
  else
    cat "$path" >"$tmp_file"
    printf '%s=%s\n' "$key" "$value" >>"$tmp_file"
  fi

  mv "$tmp_file" "$path"
}

ensure_local_env_file() {
  local target_path="$1"
  local example_path="$2"
  shift 2

  if [[ -f "$target_path" ]]; then
    info "Keeping existing local env file: $target_path"
    return
  fi

  cp "$example_path" "$target_path"

  while [[ "$#" -gt 0 ]]; do
    local key="$1"
    local value="$2"
    set_dotenv_value "$target_path" "$key" "$value"
    shift 2
  done

  info "Created local env file from example: $target_path"
}

ensure_local_env_files() {
  ensure_local_env_file \
    "$repo_root/apps/backend/.env" \
    "$repo_root/apps/backend/.env.example" \
    "DATABASE_URL" "postgres://warehub:warehub@localhost:8933/warehub" \
    "APP_ENV" "dev" \
    "APP_PORT" "8932" \
    "SKIP_DB_MIGRATIONS" "true" \
    "CORS_ALLOW_ORIGINS" "http://localhost:8931"

  ensure_local_env_file \
    "$repo_root/apps/frontend/.env.local" \
    "$repo_root/apps/frontend/.env.example" \
    "NEXT_PUBLIC_API_BASE_URL" "http://localhost:8932/api/v1" \
    "BACKEND_INTERNAL_API_BASE_URL" "http://127.0.0.1:8932/api/v1" \
    "NEXT_PUBLIC_SERVICES_API_BASE_URL" "http://localhost:8934" \
    "NEXT_PUBLIC_ORCHESTRATOR_API_BASE_URL" "http://localhost:8935" \
    "BACKEND_ORIGIN" "http://localhost:8932" \
    "SERVICES_ORIGIN" "http://localhost:8934" \
    "PORT" "8931" \
    "NODE_ENV" "development"

  ensure_local_env_file \
    "$repo_root/services/database-service/.env" \
    "$repo_root/services/database-service/.env.example" \
    "POSTGRES_DB" "warehub" \
    "POSTGRES_USER" "warehub" \
    "POSTGRES_PASSWORD" "warehub" \
    "POSTGRES_HOST" "localhost" \
    "POSTGRES_PORT" "8933" \
    "DATABASE_URL" "postgresql://warehub:warehub@localhost:8933/warehub" \
    "DEBUG" "true" \
    "ALLOWED_HOSTS" "127.0.0.1,localhost"

  ensure_local_env_file \
    "$repo_root/services/orchestrator/.env" \
    "$repo_root/services/orchestrator/.env.example" \
    "DATABASE_SERVICE_BASE_URL" "http://127.0.0.1:8934" \
    "ORCHESTRATOR_PORT" "8935" \
    "ORCHESTRATOR_HOST" "0.0.0.0"
}

wait_for_postgres_healthy() {
  local timeout_seconds="${1:-90}"
  local deadline container_id health
  deadline=$((SECONDS + timeout_seconds))
  container_id=""

  while (( SECONDS < deadline )); do
    container_id="$(docker compose -f "$compose_file" ps -q warehub-postgres | tr -d '[:space:]')"
    if [[ -n "$container_id" ]]; then
      break
    fi
    sleep 2
  done

  [[ -n "$container_id" ]] || die "Postgres container was not created by local compose."

  while (( SECONDS < deadline )); do
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" | tr -d '[:space:]')"
    if [[ "$health" == "healthy" ]]; then
      info "Postgres is healthy."
      return
    fi
    if [[ "$health" == "unhealthy" || "$health" == "exited" || "$health" == "dead" ]]; then
      die "Postgres container is not healthy: $health"
    fi
    sleep 2
  done

  die "Timed out waiting for Postgres to become healthy."
}

start_local_dependencies() {
  info "Restarting local Docker dependencies..."
  docker compose -f "$compose_file" down
  info "Starting WareHub local dependencies from $compose_file"
  docker compose -f "$compose_file" up -d
  wait_for_postgres_healthy
}

ensure_local_dev_log_directory() {
  mkdir -p "$local_dev_log_directory"
}

clear_frontend_dev_cache() {
  local frontend_cache_dir="$repo_root/apps/frontend/.next"
  if [[ -d "$frontend_cache_dir" ]]; then
    rm -rf "$frontend_cache_dir"
    info "Cleared frontend Next.js dev cache: $frontend_cache_dir"
  fi
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
  local python_cmd

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
      python_cmd="$(resolve_python_for_directory "$repo_root/services/database-service")"
      if [[ "$with_migrations" == true ]]; then
        printf '%s\n' "$python_cmd manage.py migrate --fake-initial --noinput && $python_cmd manage.py runserver 0.0.0.0:8934"
      else
        printf '%s\n' "$python_cmd manage.py runserver 0.0.0.0:8934"
      fi
      ;;
    orchestrator)
      python_cmd="$(resolve_python_for_directory "$repo_root/services/orchestrator")"
      printf '%s\n' "$python_cmd -m uvicorn src.sofort_orchestrator.main:app --host 0.0.0.0 --port 8935 --reload"
      ;;
    *) die "Unsupported app: $app_name" ;;
  esac
}

shell_quote() {
  printf '%q' "$1"
}

start_app_in_background() {
  local app_index="$1"
  local app_name="$2"
  local app_label="$3"
  local working_directory="$4"
  local log_path="$5"
  local command_text
  local launcher_python
  command_text="$(get_command_for_app "$app_name")"
  started_log_paths[$app_index]="$log_path"
  launcher_python="$(resolve_python)"

  APP_WORKING_DIRECTORY="$working_directory" \
  APP_LOG_PATH="$log_path" \
  APP_COMMAND_TEXT="$command_text" \
  APP_NAME="$app_name" \
  "$launcher_python" - <<'PY'
import os
import subprocess

working_directory = os.environ["APP_WORKING_DIRECTORY"]
log_path = os.environ["APP_LOG_PATH"]
command_text = os.environ["APP_COMMAND_TEXT"]
app_name = os.environ["APP_NAME"]

shell_command = (
    f"cd {subprocess.list2cmdline([working_directory])} && "
    f"echo Starting {app_name} in {subprocess.list2cmdline([working_directory])} >> {subprocess.list2cmdline([log_path])} && "
    f"( {command_text} ) >> {subprocess.list2cmdline([log_path])} 2>&1; "
    f"status=$?; echo Process {app_name} exited with status $status >> {subprocess.list2cmdline([log_path])}"
)

with open(os.devnull, "rb") as stdin_stream:
    subprocess.Popen(
        ["bash", "-lc", shell_command],
        stdin=stdin_stream,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
PY
  info "Started $app_label in background. Log: $log_path"
}

should_skip_app() {
  local app_name="$1"
  case "$app_name" in
    frontend) [[ "$skip_frontend" == true ]] ;;
    backend) [[ "$skip_backend" == true ]] ;;
    services) [[ "$skip_services" == true ]] ;;
    orchestrator) [[ "$skip_orchestrator" == true ]] ;;
    *) return 1 ;;
  esac
}

start_local_apps() {
  local enabled_count=0 index default_log_path log_path

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
    start_app_in_background "$index" "${app_names[$index]}" "${app_labels[$index]}" "${app_workdirs[$index]}" "$log_path"
  done
}

get_listening_process_ids_for_port() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

stop_warehub_local_app_processes() {
  local ports=(8931 8932 8934 8935)
  local stopped_any=false
  local port attempt process_ids

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

  info ""
  info "Local URLs:"
  info "  Frontend:            http://localhost:8931"
  info "  Backend:             http://localhost:8932"
  info "  Backend API:         http://localhost:8932/api/v1"
  info "  Backend health:      http://localhost:8932/healthz"
  info "  Database-service:    http://localhost:8934"
  info "  Services health:     http://localhost:8934/healthz"
  info "  Orchestrator:        http://localhost:8935"
  info "  Orchestrator health: http://localhost:8935/healthz"
  info "  Postgres:            localhost:8933"
  info "  Redis:               localhost:8936"
  info "  RabbitMQ:            localhost:8937"
  info "  RabbitMQ UI:         http://localhost:15672"
  info "  MinIO API:           http://localhost:9000"
  info "  MinIO Console:       http://localhost:9001"

  info ""
  info "Manual smoke checks:"
  info "  curl -fsS http://localhost:8932/healthz"
  info "  curl -fsS http://localhost:8934/healthz"
  info "  curl -fsS http://localhost:8935/healthz"

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
assert_compose_config
assert_local_requirements
ensure_selected_app_dependencies
ensure_local_env_files
ensure_local_dev_log_directory
info "Cleaning previous WareHub local app processes..."
stop_warehub_local_app_processes
start_local_dependencies

if [[ "$deps_only" == false && "$no_apps" == false ]]; then
  if [[ "$skip_frontend" == false ]]; then
    clear_frontend_dev_cache
  fi
  start_local_apps
fi

print_startup_summary

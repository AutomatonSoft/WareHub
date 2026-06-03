#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-prod.sh --version vX.Y.Z [--services-list backend,frontend,mobile,services]
  ./scripts/release-prod.sh --backend vX.Y.Z [--frontend vX.Y.Z] [--mobile vX.Y.Z] [--services vX.Y.Z]

Options:
  --version <tag>       Set the same prod version for selected services.
  --backend <tag>       Set backend prod version only.
  --frontend <tag>      Set frontend prod version only.
  --mobile <tag>        Set mobile prod version only.
  --services <tag>      Set services prod version only.
  --services-list <list> Comma-separated list: backend,frontend,mobile,services (default: all).
  --env-file <path>     Path to env file (default: .env).
  --versions-file <path> Path to versions file (default: versions.env).
  --no-pull             Skip docker compose pull.
  -h, --help            Show this help.
EOF
}

ENV_FILE=".env"
VERSIONS_FILE="versions.env"
SERVICES_CSV="backend,frontend,mobile,services"
GLOBAL_VERSION=""
BACKEND_VERSION=""
FRONTEND_VERSION=""
MOBILE_VERSION=""
SERVICES_VERSION=""
DO_PULL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) GLOBAL_VERSION="${2:-}"; shift 2 ;;
    --backend) BACKEND_VERSION="${2:-}"; shift 2 ;;
    --frontend) FRONTEND_VERSION="${2:-}"; shift 2 ;;
    --mobile) MOBILE_VERSION="${2:-}"; shift 2 ;;
    --services) SERVICES_VERSION="${2:-}"; shift 2 ;;
    --services-list) SERVICES_CSV="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --versions-file) VERSIONS_FILE="${2:-}"; shift 2 ;;
    --no-pull) DO_PULL=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

if [[ ! -f "deploy/prod/docker-compose.yml" ]]; then
  echo "Run this script from sofortbot-infra root."
  exit 1
fi

IFS=',' read -r -a SERVICES <<<"$SERVICES_CSV"
declare -A PICK=( ["backend"]=0 ["frontend"]=0 ["mobile"]=0 ["services"]=0 )
for svc in "${SERVICES[@]}"; do
  trimmed="$(echo "$svc" | xargs)"
  if [[ -z "${PICK[$trimmed]+x}" ]]; then
    echo "Invalid service in --services-list: $trimmed"
    exit 1
  fi
  PICK["$trimmed"]=1
done

SEMVER_RE='^v[0-9]+\.[0-9]+\.[0-9]+$'

if [[ -z "$GLOBAL_VERSION" && -z "$BACKEND_VERSION" && -z "$FRONTEND_VERSION" && -z "$MOBILE_VERSION" && -z "$SERVICES_VERSION" ]]; then
  if [[ -f "$VERSIONS_FILE" ]]; then
    GLOBAL_VERSION="$(grep '^PROD_VERSION=' "$VERSIONS_FILE" | cut -d'=' -f2- || true)"
  fi
fi

if [[ -n "$GLOBAL_VERSION" ]]; then
  if [[ ! "$GLOBAL_VERSION" =~ $SEMVER_RE ]]; then
    echo "Invalid --version: $GLOBAL_VERSION (expected vX.Y.Z)"
    exit 1
  fi
  [[ "${PICK[backend]}" -eq 1 && -z "$BACKEND_VERSION" ]] && BACKEND_VERSION="$GLOBAL_VERSION"
  [[ "${PICK[frontend]}" -eq 1 && -z "$FRONTEND_VERSION" ]] && FRONTEND_VERSION="$GLOBAL_VERSION"
  [[ "${PICK[mobile]}" -eq 1 && -z "$MOBILE_VERSION" ]] && MOBILE_VERSION="$GLOBAL_VERSION"
  [[ "${PICK[services]}" -eq 1 && -z "$SERVICES_VERSION" ]] && SERVICES_VERSION="$GLOBAL_VERSION"
fi

validate_ver() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing version for $name."
    exit 1
  fi
  if [[ ! "$value" =~ $SEMVER_RE ]]; then
    echo "Invalid version for $name: $value (expected vX.Y.Z)"
    exit 1
  fi
}

set_env_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf "\n%s=%s\n" "$key" "$value" >> "$file"
  fi
}

get_env_value() {
  local key="$1"
  local file="$2"
  grep "^${key}=" "$file" | cut -d'=' -f2- | tail -n1
}

wait_for_image_tag() {
  local image_ref="$1"
  local attempts="${2:-40}"
  local sleep_seconds="${3:-15}"
  local i

  for ((i = 1; i <= attempts; i++)); do
    if docker manifest inspect "$image_ref" >/dev/null 2>&1; then
      echo "Image is available: $image_ref"
      return 0
    fi
    echo "Waiting for image ($i/$attempts): $image_ref"
    sleep "$sleep_seconds"
  done

  echo "Timed out waiting for image: $image_ref"
  return 1
}

COMPOSE_SERVICES=()

if [[ "${PICK[backend]}" -eq 1 ]]; then
  validate_ver "backend" "$BACKEND_VERSION"
  set_env_var "BACKEND_APP_VERSION" "$BACKEND_VERSION" "$ENV_FILE"
  COMPOSE_SERVICES+=("backend")
fi

if [[ "${PICK[frontend]}" -eq 1 ]]; then
  validate_ver "frontend" "$FRONTEND_VERSION"
  set_env_var "FRONTEND_APP_VERSION" "$FRONTEND_VERSION" "$ENV_FILE"
  COMPOSE_SERVICES+=("frontend")
fi

if [[ "${PICK[mobile]}" -eq 1 ]]; then
  validate_ver "mobile" "$MOBILE_VERSION"
  set_env_var "MOBILE_APP_VERSION" "$MOBILE_VERSION" "$ENV_FILE"
  set_env_var "MOBILE_PROD_APP_VERSION" "$MOBILE_VERSION" "$ENV_FILE"
  COMPOSE_SERVICES+=("mobile")
fi

if [[ "${PICK[services]}" -eq 1 ]]; then
  validate_ver "services" "$SERVICES_VERSION"
  set_env_var "SERVICES_APP_VERSION" "$SERVICES_VERSION" "$ENV_FILE"
  COMPOSE_SERVICES+=("services")
fi

echo "Updated $ENV_FILE:"
[[ "${PICK[backend]}" -eq 1 ]] && grep '^BACKEND_APP_VERSION=' "$ENV_FILE"
[[ "${PICK[frontend]}" -eq 1 ]] && grep '^FRONTEND_APP_VERSION=' "$ENV_FILE"
[[ "${PICK[mobile]}" -eq 1 ]] && grep '^MOBILE_APP_VERSION=' "$ENV_FILE"
[[ "${PICK[services]}" -eq 1 ]] && grep '^SERVICES_APP_VERSION=' "$ENV_FILE"

if [[ "$DO_PULL" -eq 1 ]]; then
  WAIT_ATTEMPTS="${WAIT_IMAGE_ATTEMPTS:-40}"
  WAIT_SLEEP_SECONDS="${WAIT_IMAGE_SLEEP_SECONDS:-15}"

  if [[ "${PICK[backend]}" -eq 1 ]]; then
    BACKEND_IMAGE_REF="$(get_env_value "BACKEND_IMAGE" "$ENV_FILE"):$(get_env_value "BACKEND_APP_VERSION" "$ENV_FILE")"
    wait_for_image_tag "$BACKEND_IMAGE_REF" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[frontend]}" -eq 1 ]]; then
    FRONTEND_IMAGE_REF="$(get_env_value "FRONTEND_IMAGE" "$ENV_FILE"):$(get_env_value "FRONTEND_APP_VERSION" "$ENV_FILE")"
    wait_for_image_tag "$FRONTEND_IMAGE_REF" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[mobile]}" -eq 1 ]]; then
    MOBILE_IMAGE_REF="$(get_env_value "MOBILE_IMAGE" "$ENV_FILE"):$(get_env_value "MOBILE_APP_VERSION" "$ENV_FILE")"
    wait_for_image_tag "$MOBILE_IMAGE_REF" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[services]}" -eq 1 ]]; then
    SERVICES_IMAGE_REF="$(get_env_value "SERVICES_IMAGE" "$ENV_FILE"):$(get_env_value "SERVICES_APP_VERSION" "$ENV_FILE")"
    wait_for_image_tag "$SERVICES_IMAGE_REF" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  docker compose -f deploy/prod/docker-compose.yml --env-file "$ENV_FILE" pull "${COMPOSE_SERVICES[@]}"
fi

docker compose -f deploy/prod/docker-compose.yml --env-file "$ENV_FILE" up -d --force-recreate "${COMPOSE_SERVICES[@]}"

echo "Prod release complete for: ${COMPOSE_SERVICES[*]}"

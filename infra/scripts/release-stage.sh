#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-stage.sh [--tag stage-latest] [--services backend,frontend,mobile,services]
  ./scripts/release-stage.sh --backend-tag <tag> [--frontend-tag <tag>] [--mobile-tag <tag>] [--services-tag <tag>]

Options:
  --tag <tag>            Set the same stage tag for selected services (default: stage-latest).
  --backend-tag <tag>    Set backend stage tag only.
  --frontend-tag <tag>   Set frontend stage tag only.
  --mobile-tag <tag>     Set mobile stage tag only.
  --services-tag <tag>   Set services stage tag only.
  --services <list>      Comma-separated list: backend,frontend,mobile,services (default: all).
  --env-file <path>      Path to env file (default: .env).
  --versions-file <path> Path to versions file (default: versions.env).
  --no-pull              Skip docker compose pull.
  -h, --help             Show this help.
EOF
}

ENV_FILE=".env"
VERSIONS_FILE="versions.env"
SERVICES_CSV="backend,frontend,mobile,services"
GLOBAL_TAG="stage-latest"
BACKEND_TAG=""
FRONTEND_TAG=""
MOBILE_TAG=""
SERVICES_TAG=""
DO_PULL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) GLOBAL_TAG="${2:-}"; shift 2 ;;
    --backend-tag) BACKEND_TAG="${2:-}"; shift 2 ;;
    --frontend-tag) FRONTEND_TAG="${2:-}"; shift 2 ;;
    --mobile-tag) MOBILE_TAG="${2:-}"; shift 2 ;;
    --services-tag) SERVICES_TAG="${2:-}"; shift 2 ;;
    --services) SERVICES_CSV="${2:-}"; shift 2 ;;
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

if [[ ! -f "deploy/stage/docker-compose.yml" ]]; then
  echo "Run this script from sofortbot-infra root."
  exit 1
fi

IFS=',' read -r -a SERVICES <<<"$SERVICES_CSV"
declare -A PICK=( ["backend"]=0 ["frontend"]=0 ["mobile"]=0 ["services"]=0 )
for svc in "${SERVICES[@]}"; do
  trimmed="$(echo "$svc" | xargs)"
  if [[ -z "${PICK[$trimmed]+x}" ]]; then
    echo "Invalid service in --services: $trimmed"
    exit 1
  fi
  PICK["$trimmed"]=1
done

[[ "${PICK[backend]}" -eq 1 && -z "$BACKEND_TAG" ]] && BACKEND_TAG="$GLOBAL_TAG"
[[ "${PICK[frontend]}" -eq 1 && -z "$FRONTEND_TAG" ]] && FRONTEND_TAG="$GLOBAL_TAG"
[[ "${PICK[mobile]}" -eq 1 && -z "$MOBILE_TAG" ]] && MOBILE_TAG="$GLOBAL_TAG"
[[ "${PICK[services]}" -eq 1 && -z "$SERVICES_TAG" ]] && SERVICES_TAG="$GLOBAL_TAG"

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

wait_for_image_or_fallback_stage_latest() {
  local image_key="$1"
  local tag_key="$2"
  local env_file="$3"
  local attempts="$4"
  local sleep_seconds="$5"
  local fallback_tag="stage-latest"
  local current_tag
  local image_name
  local current_ref
  local fallback_ref

  current_tag="$(get_env_value "$tag_key" "$env_file")"
  image_name="$(get_env_value "$image_key" "$env_file")"
  current_ref="${image_name}:${current_tag}"

  if wait_for_image_tag "$current_ref" "$attempts" "$sleep_seconds"; then
    return 0
  fi

  if [[ "$current_tag" != "$fallback_tag" && "$current_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-stage\.[0-9]+$ ]]; then
    fallback_ref="${image_name}:${fallback_tag}"
    echo "Requested stage image '$current_ref' is not available."
    echo "Falling back to '$fallback_ref'."
    wait_for_image_tag "$fallback_ref" "$attempts" "$sleep_seconds"
    set_env_var "$tag_key" "$fallback_tag" "$env_file"
    return 0
  fi

  return 1
}

STAGE_VERSION_VALUE=""
if [[ -f "$VERSIONS_FILE" ]]; then
  STAGE_VERSION_VALUE="$(grep '^STAGE_VERSION=' "$VERSIONS_FILE" | cut -d'=' -f2- || true)"
fi

resolve_stage_mobile_apk_version() {
  local env_file="$1"
  local apk_url
  local version_url
  local version_value

  apk_url="$(grep '^MOBILE_STAGE_APK_URL=' "$env_file" | cut -d'=' -f2- || true)"
  if [[ -z "$apk_url" ]]; then
    return 1
  fi

  if [[ "$apk_url" == *.apk ]]; then
    version_url="${apk_url%.apk}.version"
  else
    version_url="${apk_url}.version"
  fi

  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  version_value="$(curl -fsSL --max-time 8 "$version_url" 2>/dev/null | tr -d '\r\n' || true)"
  if [[ "$version_value" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    printf '%s' "$version_value"
    return 0
  fi

  return 1
}

COMPOSE_SERVICES=()

if [[ "${PICK[backend]}" -eq 1 ]]; then
  set_env_var "BACKEND_STAGE_TAG" "$BACKEND_TAG" "$ENV_FILE"
  COMPOSE_SERVICES+=("backend")
fi

if [[ "${PICK[frontend]}" -eq 1 ]]; then
  set_env_var "FRONTEND_STAGE_TAG" "$FRONTEND_TAG" "$ENV_FILE"
  COMPOSE_SERVICES+=("frontend")
fi

if [[ "${PICK[mobile]}" -eq 1 ]]; then
  set_env_var "MOBILE_STAGE_TAG" "$MOBILE_TAG" "$ENV_FILE"
  COMPOSE_SERVICES+=("mobile")
fi

if [[ "${PICK[services]}" -eq 1 ]]; then
  set_env_var "SERVICES_STAGE_TAG" "$SERVICES_TAG" "$ENV_FILE"
  COMPOSE_SERVICES+=("services")
fi

if [[ "${PICK[mobile]}" -eq 1 ]]; then
  if MOBILE_STAGE_APP_VERSION_VALUE="$(resolve_stage_mobile_apk_version "$ENV_FILE")"; then
    set_env_var "MOBILE_STAGE_APP_VERSION" "$MOBILE_STAGE_APP_VERSION_VALUE" "$ENV_FILE"
  elif [[ -n "$STAGE_VERSION_VALUE" ]]; then
    set_env_var "MOBILE_STAGE_APP_VERSION" "$STAGE_VERSION_VALUE" "$ENV_FILE"
  elif [[ -n "$MOBILE_TAG" ]]; then
    set_env_var "MOBILE_STAGE_APP_VERSION" "$MOBILE_TAG" "$ENV_FILE"
  fi
fi

echo "Updated $ENV_FILE:"
[[ "${PICK[backend]}" -eq 1 ]] && grep '^BACKEND_STAGE_TAG=' "$ENV_FILE"
[[ "${PICK[frontend]}" -eq 1 ]] && grep '^FRONTEND_STAGE_TAG=' "$ENV_FILE"
[[ "${PICK[mobile]}" -eq 1 ]] && grep '^MOBILE_STAGE_TAG=' "$ENV_FILE"
[[ "${PICK[services]}" -eq 1 ]] && grep '^SERVICES_STAGE_TAG=' "$ENV_FILE"
[[ "${PICK[mobile]}" -eq 1 ]] && grep '^MOBILE_STAGE_APP_VERSION=' "$ENV_FILE"

if [[ "$DO_PULL" -eq 1 ]]; then
  WAIT_ATTEMPTS="${WAIT_IMAGE_ATTEMPTS:-40}"
  WAIT_SLEEP_SECONDS="${WAIT_IMAGE_SLEEP_SECONDS:-15}"

  if [[ "${PICK[backend]}" -eq 1 ]]; then
    wait_for_image_or_fallback_stage_latest "BACKEND_IMAGE" "BACKEND_STAGE_TAG" "$ENV_FILE" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[frontend]}" -eq 1 ]]; then
    wait_for_image_or_fallback_stage_latest "FRONTEND_IMAGE" "FRONTEND_STAGE_TAG" "$ENV_FILE" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[mobile]}" -eq 1 ]]; then
    wait_for_image_or_fallback_stage_latest "MOBILE_IMAGE" "MOBILE_STAGE_TAG" "$ENV_FILE" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  if [[ "${PICK[services]}" -eq 1 ]]; then
    wait_for_image_or_fallback_stage_latest "SERVICES_IMAGE" "SERVICES_STAGE_TAG" "$ENV_FILE" "$WAIT_ATTEMPTS" "$WAIT_SLEEP_SECONDS"
  fi

  docker compose -f deploy/stage/docker-compose.yml --env-file "$ENV_FILE" pull "${COMPOSE_SERVICES[@]}"
fi

docker compose -f deploy/stage/docker-compose.yml --env-file "$ENV_FILE" up -d --force-recreate "${COMPOSE_SERVICES[@]}"

echo "Stage release complete for: ${COMPOSE_SERVICES[*]}"

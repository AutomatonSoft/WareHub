#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-infra.sh --env stage
  ./scripts/release-infra.sh --env prod [--remove-orphans]
  ./scripts/release-infra.sh --env stage --services frontend,backend

Options:
  --env <stage|prod>     Target environment.
  --services <list>      Optional service list for compose up.
  --env-file <path>      Env file path (default: .env).
  --remove-orphans       Pass --remove-orphans to compose up.
  --no-pull              Skip compose pull step.
  -h, --help             Show this help.
EOF
}

TARGET_ENV=""
SERVICES_CSV=""
ENV_FILE=".env"
REMOVE_ORPHANS=0
DO_PULL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) TARGET_ENV="${2:-}"; shift 2 ;;
    --services) SERVICES_CSV="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --remove-orphans) REMOVE_ORPHANS=1; shift ;;
    --no-pull) DO_PULL=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ "$TARGET_ENV" != "stage" && "$TARGET_ENV" != "prod" ]]; then
  echo "--env must be 'stage' or 'prod'"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE"
  exit 1
fi

COMPOSE_FILE="deploy/${TARGET_ENV}/docker-compose.yml"
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE"
  exit 1
fi

UP_ARGS=(-d --force-recreate)
if [[ "$REMOVE_ORPHANS" -eq 1 ]]; then
  UP_ARGS+=(--remove-orphans)
fi

if [[ -n "$SERVICES_CSV" ]]; then
  IFS=',' read -r -a SERVICES <<<"$SERVICES_CSV"
else
  SERVICES=()
fi

echo "Deploying infra environment: $TARGET_ENV"
echo "Compose file: $COMPOSE_FILE"
echo "Env file: $ENV_FILE"

if [[ "$DO_PULL" -eq 1 ]]; then
  if [[ "${#SERVICES[@]}" -gt 0 ]]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull "${SERVICES[@]}"
  else
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
  fi
fi

if [[ "${#SERVICES[@]}" -gt 0 ]]; then
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up "${UP_ARGS[@]}" "${SERVICES[@]}"
else
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up "${UP_ARGS[@]}"
fi

echo "Infra deploy complete: $TARGET_ENV"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="${ENV_FILE:-.env}"
GENERATED_COMPOSE="${GENERATED_COMPOSE:-docker-compose.generated.yml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it from .env.example first."
  echo "Example:"
  echo "  cp .env.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${GITEA_INSTANCE_URL:-}" || -z "${GITEA_RUNNER_REGISTRATION_TOKEN:-}" ]]; then
  echo "GITEA_INSTANCE_URL and GITEA_RUNNER_REGISTRATION_TOKEN are required in $ENV_FILE"
  exit 1
fi

if [[ "${GITEA_RUNNER_REGISTRATION_TOKEN}" == "replace_with_runner_registration_token" ]]; then
  echo "Set a real GITEA_RUNNER_REGISTRATION_TOKEN in $ENV_FILE"
  exit 1
fi

RUNNER_NAME_PREFIX="${GITEA_RUNNER_NAME_PREFIX:-sofortbot}"
SHARED_RUNNER_COUNT="${SHARED_RUNNER_COUNT:-8}"
MOBILE_RUNNER_COUNT="${MOBILE_RUNNER_COUNT:-4}"
SHARED_RUNNER_LABELS="${SHARED_RUNNER_LABELS:-backend-ci,backend-cd,frontend-ci,frontend-cd,infra-ci,infra-cd,service-ci,service-cd,shared}"
MOBILE_RUNNER_LABELS="${MOBILE_RUNNER_LABELS:-mobile-ci,mobile-cd,mobile-shared}"
TOTAL_RUNNER_COUNT=$((SHARED_RUNNER_COUNT + MOBILE_RUNNER_COUNT))

if ! [[ "$SHARED_RUNNER_COUNT" =~ ^[0-9]+$ ]] || [[ "$SHARED_RUNNER_COUNT" -lt 1 ]]; then
  echo "SHARED_RUNNER_COUNT must be a positive integer. Current value: $SHARED_RUNNER_COUNT"
  exit 1
fi

if ! [[ "$MOBILE_RUNNER_COUNT" =~ ^[0-9]+$ ]] || [[ "$MOBILE_RUNNER_COUNT" -lt 1 ]]; then
  echo "MOBILE_RUNNER_COUNT must be a positive integer. Current value: $MOBILE_RUNNER_COUNT"
  exit 1
fi

cat > "$GENERATED_COMPOSE" <<EOF
services:
EOF

for i in $(seq 1 "$SHARED_RUNNER_COUNT"); do
  id="$(printf "%02d" "$i")"
  svc="runner-shared-${id}"
  data_dir="./${svc}"
  mkdir -p "$data_dir"
  cat >> "$GENERATED_COMPOSE" <<EOF
  ${svc}:
    image: gitea/act_runner:latest
    restart: unless-stopped
    environment:
      GITEA_INSTANCE_URL: ${GITEA_INSTANCE_URL}
      GITEA_RUNNER_REGISTRATION_TOKEN: ${GITEA_RUNNER_REGISTRATION_TOKEN}
      GITEA_RUNNER_NAME: ${RUNNER_NAME_PREFIX}-shared-${id}
      GITEA_RUNNER_LABELS: ${SHARED_RUNNER_LABELS}
    command: >
      sh -lc '
      if [ ! -f /data/.runner ]; then
        act_runner register
        --no-interactive
        --instance "${GITEA_INSTANCE_URL}"
        --token "${GITEA_RUNNER_REGISTRATION_TOKEN}"
        --name "$${GITEA_RUNNER_NAME}"
        --labels "$${GITEA_RUNNER_LABELS}";
      fi;
      exec act_runner daemon
      '
    volumes:
      - ${data_dir}:/data
      - /var/run/docker.sock:/var/run/docker.sock
EOF
done

for i in $(seq 1 "$MOBILE_RUNNER_COUNT"); do
  id="$(printf "%02d" "$i")"
  svc="runner-mobile-${id}"
  data_dir="./${svc}"
  mkdir -p "$data_dir"
  cat >> "$GENERATED_COMPOSE" <<EOF
  ${svc}:
    image: gitea/act_runner:latest
    restart: unless-stopped
    environment:
      GITEA_INSTANCE_URL: ${GITEA_INSTANCE_URL}
      GITEA_RUNNER_REGISTRATION_TOKEN: ${GITEA_RUNNER_REGISTRATION_TOKEN}
      GITEA_RUNNER_NAME: ${RUNNER_NAME_PREFIX}-mobile-${id}
      GITEA_RUNNER_LABELS: ${MOBILE_RUNNER_LABELS}
    command: >
      sh -lc '
      if [ ! -f /data/.runner ]; then
        act_runner register
        --no-interactive
        --instance "${GITEA_INSTANCE_URL}"
        --token "${GITEA_RUNNER_REGISTRATION_TOKEN}"
        --name "$${GITEA_RUNNER_NAME}"
        --labels "$${GITEA_RUNNER_LABELS}";
      fi;
      exec act_runner daemon
      '
    volumes:
      - ${data_dir}:/data
      - /var/run/docker.sock:/var/run/docker.sock
EOF
done

docker compose --env-file "$ENV_FILE" -f "$GENERATED_COMPOSE" up -d
docker compose --env-file "$ENV_FILE" -f "$GENERATED_COMPOSE" ps

echo
echo "Started ${TOTAL_RUNNER_COUNT} runners: ${SHARED_RUNNER_COUNT} shared + ${MOBILE_RUNNER_COUNT} mobile"
echo "Shared labels: ${SHARED_RUNNER_LABELS}"
echo "Mobile labels: ${MOBILE_RUNNER_LABELS}"
echo "Compose file: ${SCRIPT_DIR}/${GENERATED_COMPOSE}"

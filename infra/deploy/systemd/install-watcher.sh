#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  sudo ./deploy/systemd/install-watcher.sh [--infra-dir /abs/path/to/sofortbot-infra]

Description:
  Installs and enables the deploy-watcher systemd service so it starts automatically on boot
  and restarts automatically after failures.
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="$ROOT_DIR"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --infra-dir) INFRA_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

if [[ -z "$INFRA_DIR" || ! -d "$INFRA_DIR" ]]; then
  echo "Invalid --infra-dir: $INFRA_DIR"
  exit 1
fi

if [[ ! -f "$INFRA_DIR/scripts/deploy-watcher.sh" ]]; then
  echo "deploy-watcher.sh not found in: $INFRA_DIR/scripts"
  exit 1
fi

SERVICE_NAME="sofortbot-deploy-watcher.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"
TMP_SERVICE="$(mktemp)"
trap 'rm -f "$TMP_SERVICE"' EXIT

cat > "$TMP_SERVICE" <<EOF
[Unit]
Description=SofortBOT Deploy Watcher
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INFRA_DIR}
ExecStart=/usr/bin/env bash ${INFRA_DIR}/scripts/deploy-watcher.sh
Restart=always
RestartSec=5
Environment=POLL_INTERVAL_SECONDS=20
Environment=WATCHER_SKIP_INFRA_GIT_PULL=1

[Install]
WantedBy=multi-user.target
EOF

install -m 0644 "$TMP_SERVICE" "$SERVICE_PATH"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

echo "Installed and enabled: $SERVICE_NAME"
systemctl --no-pager --full status "$SERVICE_NAME" || true

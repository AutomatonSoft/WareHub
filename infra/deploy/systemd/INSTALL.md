# Deploy Watcher (systemd)

## 1) Install and enable (recommended)

From `sofortbot-infra` root on the server:

```bash
chmod +x deploy/systemd/install-watcher.sh
sudo ./deploy/systemd/install-watcher.sh
```

If your infra path is different:

```bash
sudo ./deploy/systemd/install-watcher.sh --infra-dir /opt/sofortbot/sofortbot-infra
```

## 2) Manual install (optional)

```bash
sudo cp deploy/systemd/sofortbot-deploy-watcher.service /etc/systemd/system/
```

If your infra path differs from `/home/server/sofotbot/infra`, edit:
- `WorkingDirectory`
- `ExecStart`

## 3) Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sofortbot-deploy-watcher.service
```

## 4) Verify status

```bash
sudo systemctl status sofortbot-deploy-watcher.service
journalctl -u sofortbot-deploy-watcher.service -f
```

## 5) One-time prerequisites

- Docker CLI must be available on server host.
- Host must be authenticated to private registry used in `.env`:

```bash
docker login <registry-host>
```

The watcher checks image tags via `docker manifest inspect` and deploys only when all required images exist (`backend`, `frontend`, `mobile`, `services`).

Once enabled with `systemctl enable`, it will start automatically on every server reboot.

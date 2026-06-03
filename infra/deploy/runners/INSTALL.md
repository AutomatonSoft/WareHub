# Gitea Runners (8 Shared + 4 Mobile)

This setup starts 12 persistent runners:

- 8 shared runners for backend/frontend/service/infra jobs
- 4 dedicated mobile runners for mobile jobs

Default shared labels:

- `backend-ci`, `backend-cd`
- `frontend-ci`, `frontend-cd`
- `infra-ci`, `infra-cd`
- `service-ci`, `service-cd`
- `shared`

Default mobile labels:

- `mobile-ci`, `mobile-cd`, `mobile-shared`

## 1) Prepare env

```bash
cd /home/server/sofotbot/infra/deploy/runners
cp .env.example .env
```

Set `GITEA_RUNNER_REGISTRATION_TOKEN` in `.env`.

Optional tuning in `.env`:

- `SHARED_RUNNER_COUNT` (default `8`)
- `MOBILE_RUNNER_COUNT` (default `4`)
- `SHARED_RUNNER_LABELS`
- `MOBILE_RUNNER_LABELS`

## 2) Start 12 runners (one command)

```bash
chmod +x ./install-12-runners.sh && ./install-12-runners.sh
```

## 3) Verify

```bash
docker compose --env-file .env -f docker-compose.generated.yml ps
docker compose --env-file .env -f docker-compose.generated.yml logs -f --tail=100
```

## 4) Restart/update

```bash
docker compose --env-file .env -f docker-compose.generated.yml pull
docker compose --env-file .env -f docker-compose.generated.yml up -d
```

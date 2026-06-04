# database-service

## Local Bootstrap Contract

- Monorepo path: `services/database-service`
- Dependency manifest source of truth: `services/database-service/requirements.txt`
- `services/requirements.txt` is no longer the source of truth for `database-service` bootstrap
- Local untracked env file: `services/database-service/.env`
- Service-local Docker build context: `services`
- Service-local Dockerfile path inside that context: `database-service/Dockerfile`
- Local Docker Compose file: `services/database-service/docker-compose.yml`
- Migrations are manual and are not auto-run by the local compose flow

## Validate Local Compose

Run from repo root:

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml config
```

## Optional Service-Local Docker Flow

This is local/dev only.

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml up --build
```

Exposed ports:

- Django API: `http://localhost:8934`
- PostgreSQL: `localhost:8543`

Stop:

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml down
```

Stop and remove the service-local Postgres volume:

```powershell
Set-Location I:\WareHub
docker compose -f services/database-service/docker-compose.yml down -v
```

## Manual Host-Run Notes

- If you run the service directly on the host, keep `services/database-service/.env` local and untracked.
- Use `services/database-service/requirements.txt` as the dependency source of truth.
- Do not treat migrations as implicit startup behavior.

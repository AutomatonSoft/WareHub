# database_service

## Run with Docker Compose

```bash
cd database_service
docker compose up --build
```

Services:

- Django API: `http://localhost:8000`
- PostgreSQL: `localhost:5432`

Stop:

```bash
docker compose down
```

Stop and remove Postgres volume:

```bash
docker compose down -v
```

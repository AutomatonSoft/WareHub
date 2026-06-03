# Структура репозитория WareHub

## Назначение

Этот репозиторий является новым clean monorepo для поэтапной консолидации существующих проектов. На текущем этапе в репозитории разрешены только skeleton-структура, базовая документация и безопасные плейсхолдеры.

## Целевая структура

```text
WareHub/
  apps/
    backend/
    frontend/
    mobile/

  services/
    database-service/
    orchestrator/

  infra/
    local/
    deploy/
      stage/
      prod/
    nginx/
    scripts/
    docs/

  docs/
    adr/
    architecture/
    ci-cd/
    runbooks/

  tools/
  .github/
    workflows/
```

## Маппинг старых репозиториев в новый monorepo

- `sofortbot-backend` -> `apps/backend`
- `sofortbot-frontend` -> `apps/frontend`
- `sofortbot-mobile` -> `apps/mobile`
- `sofortbot-services/services/database_service` -> `services/database-service`
- `sofortbot-services/services/sb-sofort-orchestrator-service` -> `services/orchestrator`
- `sofortbot-infra` -> `infra`

## Правила Slice 1

- Не копировать код из старых репозиториев.
- Не копировать `.env` файлы и любые секреты.
- Не создавать CI/CD workflow.
- Не выполнять deploy, миграции или изменения stage/prod.
- Для пустых каталогов использовать `.gitkeep`.

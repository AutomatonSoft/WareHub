# Политика ветвления и релизов

## Основные ветки

- `main`
- `stage`
- `feature/*`
- `fix/*`
- `hotfix/*`

## Flow

- `feature/*` -> PR -> `stage`
- `stage` -> PR -> `main`
- `hotfix/*` -> PR -> `main` -> back-merge `main` to `stage`

## Versioning

- Production tags: `v1.0.0`
- RC tags: `v1.0.0-rc.1`
- Для audited releases запрещен deploy по тегу `latest`

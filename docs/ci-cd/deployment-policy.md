# Политика деплоя

## Общие правила

- Деплой в `stage` должен быть автоматическим после merge в ветку `stage`.
- Деплой в `production` должен запускаться только после manual approval и только после merge в `main`.
- Полностью автоматический production deploy запрещен.

## Миграции и бэкапы

- Перед production migrations обязателен backup.
- Миграции не должны запускаться неявно во время старта приложения в production.

## Проверки после деплоя

- После каждого deploy обязателен healthcheck.
- Rollback должен выполняться на immutable previous image tag.

# Политика backup и restore

## Целевое состояние

- Перед каждым production deploy с migrations должен выполняться PostgreSQL backup.
- Реализация через `pg_dump` и `pg_restore` будет добавлена в следующих slices.

## Шаблон имени backup

```text
warehub_prod_YYYYMMDD_HHMMSS_before_v1.0.0.sql.gz
```

## Обязательные требования

- До автоматизации production deploy должен существовать отдельный restore runbook.
- Backup должен проверяться на доступность и целостность.
- Процедура restore должна быть протестирована до production cutover.

## Текущее состояние

Автоматизация backup/restore пока не реализована.

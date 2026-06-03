# Политика миграций

## Общие правила

- SQLx и Django migrations требуют unified ownership.
- Одна таблица должна иметь одного владельца миграций.
- Неявные production migrations на startup запрещены.
- Миграции должны выполняться только явным отдельным шагом.
- Перед production migration обязателен backup.
- Destructive migrations требуют manual review.

## Классификация миграций

- `backward-compatible`
- `requires maintenance window`
- `destructive/non-reversible without restore`

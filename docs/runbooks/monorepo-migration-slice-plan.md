# План slice-миграции monorepo

## Slice 1: skeleton/docs

Goal:
- Создать clean monorepo skeleton, базовую структуру каталогов и начальную документацию.

Do not touch:
- Старые репозитории
- Production
- Stage
- Deploy
- Миграции
- Код приложений

Acceptance criteria:
- Создана целевая структура каталогов
- Созданы root-файлы и обязательные документы
- В репозитории нет кода приложений, реальных секретов и workflow

## Slice 2: copy code excluding secrets/artifacts

Goal:
- Перенести код в новый monorepo без секретов, сборочных артефактов и локальных мусорных файлов.

Do not touch:
- Production deploy
- Stage deploy
- Реальные `.env`
- Миграции production

Acceptance criteria:
- Код скопирован только в целевые каталоги
- Секреты и артефакты исключены
- История и маппинг компонентов документированы

## Slice 3: fix paths/local dev

Goal:
- Привести локальные пути, конфиги и dev-скрипты к работе внутри monorepo.

Do not touch:
- Production
- Stage
- CI deploy

Acceptance criteria:
- Локальная разработка стартует из нового monorepo
- Пути и зависимости согласованы
- Документация local dev обновлена

## Slice 4: CI only

Goal:
- Добавить CI-проверки без deploy-логики.

Do not touch:
- Stage deploy
- Prod deploy
- Автоматические production migrations

Acceptance criteria:
- Появились только CI workflow
- Сборка, тесты и линтеры выполняются в PR
- Секреты для deploy не используются

## Slice 5: stage deploy

Goal:
- Добавить безопасный stage deploy pipeline.

Do not touch:
- Production deploy
- Production migrations без явного шага

Acceptance criteria:
- Deploy в `stage` выполняется после merge в `stage`
- Используются environment secrets
- Есть post-deploy healthcheck

## Slice 6: backup + explicit migrations

Goal:
- Добавить backup workflow и отдельный управляемый шаг миграций.

Do not touch:
- Полностью автоматический production deploy
- Необратимые миграции без review

Acceptance criteria:
- Перед production migrations выполняется backup
- Миграции запускаются отдельным explicit шагом
- Описаны rollback notes

## Slice 7: prod deploy with manual approval

Goal:
- Ввести production deploy с ручным подтверждением.

Do not touch:
- Автодеплой в production без approval

Acceptance criteria:
- Production deploy требует manual approval
- Есть immutable image tag rollback
- Runbook восстановления готов

## Slice 8: archive old repos

Goal:
- Архивировать старые репозитории после полного cutover.

Do not touch:
- Архивацию до подтвержденного cutover

Acceptance criteria:
- Новый monorepo признан source of truth
- Старые репозитории переведены в archive/read-only режим
- Документация migration completion оформлена

# Политика секретов

## Базовые правила

- Реальные `.env` файлы запрещены в git.
- В репозитории разрешены только `.env.example` и `*.example` плейсхолдеры.
- Реальные секреты должны храниться вне репозитория.

## Целевые GitHub Environments

В следующих slices планируется использовать GitHub Environments:

- `stage`
- `production`

## Обязательные будущие секреты

- `STAGE_SSH_HOST`
- `STAGE_SSH_USER`
- `STAGE_SSH_KEY`
- `AFTERBUY_JV_PARTNER_TOKEN`
- `AFTERBUY_JV_ACCOUNT_TOKEN`
- `AFTERBUY_XL_PARTNER_TOKEN`
- `AFTERBUY_XL_ACCOUNT_TOKEN`
- `AFTERBUY_CH_PARTNER_TOKEN`
- `AFTERBUY_CH_ACCOUNT_TOKEN`
- `STAGE_ENV_FILE`
- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_KEY`
- `PROD_ENV_FILE`
- `REGISTRY_TOKEN`
- `DATABASE_URL` placeholders
- Android signing placeholders

## Исторический риск

В истории старого `sofortbot-infra/.env` ранее появлялись секреты. Все значения, которые могли быть в этом файле, считаются кандидатами на обязательную ротацию до production cutover.

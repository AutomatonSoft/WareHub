# ROTATION_EXECUTION_TEMPLATE

Use one copy of this template per rotation batch.

## Header

- Date (UTC):
- Operator:
- Approver (if required):
- Environment scope: `stage` / `prod` / `dev` / mixed
- Change ticket / incident ID:

## Secrets in Scope

List only secret identifiers, never values.

1. `<SECRET_KEY_NAME_1>`
2. `<SECRET_KEY_NAME_2>`
3. `<SECRET_KEY_NAME_3>`

## Pre-Checks

1. Backup/rollback window confirmed: `yes/no`
2. Access to runtime `.env` confirmed: `yes/no`
3. Health endpoints baseline checked: `yes/no`
4. Related service owners notified: `yes/no`

## Execution Log

1. Stage update timestamp:
2. Stage deploy command:
3. Stage verification commands and result:
4. Prod update timestamp:
5. Prod deploy command:
6. Prod verification commands and result:

## Verification Checklist

1. `docker compose ... ps` healthy for updated services: `pass/fail`
2. `/healthz` and `/readyz` checks: `pass/fail`
3. Auth-dependent flows smoke check: `pass/fail`
4. Upload/FTP flows smoke check (if applicable): `pass/fail`
5. Marketplace integration smoke check (if applicable): `pass/fail`

## Rollback

- Rollback required: `yes/no`
- If yes, rollback command(s):
- Post-rollback verification result:

## Closure

- Old credentials revoked: `yes/no`
- `SECRET_FINDINGS_REGISTER.md` updated: `yes/no`
- Follow-up actions:


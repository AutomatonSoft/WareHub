# Password Reset SMTP Env Contract

This runbook covers the backend password reset SMTP contract for stage and production.

## Required backend runtime variables

- `SMTP_HOST`
- `SMTP_FROM`

## Optional backend runtime variables

- `SMTP_PORT`
  - default: `587`
- `SMTP_USERNAME`
  - secret when SMTP auth is used
- `SMTP_PASSWORD`
  - secret when SMTP auth is used
- `SMTP_INSECURE`
  - default: `false`
  - set to `true` only for local/dev style plaintext SMTP testing
- `PASSWORD_RESET_CODE_TTL_MINUTES`
  - default: `10`
- `PASSWORD_RESET_LOG_CODES`
  - default: `false`
  - local/dev debugging only
  - must stay `false` on stage and production

## Current backend behavior

- The backend emails a six-digit reset code.
- The backend does not currently use `PASSWORD_RESET_BASE_URL`, `PUBLIC_FRONTEND_URL`, or `FRONTEND_PUBLIC_URL` for password reset delivery.
- Missing SMTP config fails server-side with a clear backend error log.
- Malformed JSON at `POST /api/v1/auth/password/reset/request` is rejected before the handler runs.
- API responses must not include SMTP credentials or reset codes.
- `POST /api/v1/auth/password/reset/request` returns `204 No Content` when the email is unknown, so the response does not disclose whether an account exists.
- In local/dev, if SMTP delivery is not configured and `PASSWORD_RESET_LOG_CODES=true`, the reset code is logged instead of emailed.

## Request format and local verification

Expected request body:

```json
{ "email": "user@example.com" }
```

PowerShell-safe example:

```powershell
$body = @{ email = "user@example.com" } | ConvertTo-Json -Compress
Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8932/api/v1/auth/password/reset/request" `
  -ContentType "application/json" `
  -Body $body
```

Broken PowerShell single-quote or hash-literal style JSON can fail with an error like:

```text
Failed to parse the request body as JSON: key must be a string at line 1 column 2
```

## Stage and production env indirection

Stage backend compose expects:

- `STAGE_SMTP_HOST`
- `STAGE_SMTP_PORT`
- `STAGE_SMTP_USERNAME`
- `STAGE_SMTP_PASSWORD`
- `STAGE_SMTP_FROM`
- `STAGE_SMTP_INSECURE`
- `STAGE_PASSWORD_RESET_CODE_TTL_MINUTES`
- `STAGE_PASSWORD_RESET_LOG_CODES`

Production backend compose expects:

- `PROD_SMTP_HOST`
- `PROD_SMTP_PORT`
- `PROD_SMTP_USERNAME`
- `PROD_SMTP_PASSWORD`
- `PROD_SMTP_FROM`
- `PROD_SMTP_INSECURE`
- `PROD_PASSWORD_RESET_CODE_TTL_MINUTES`
- `PROD_PASSWORD_RESET_LOG_CODES`

## Secret handling

Secrets:

- `STAGE_SMTP_HOST`
- `STAGE_SMTP_USERNAME`
- `STAGE_SMTP_PASSWORD`
- `PROD_SMTP_HOST`
- `PROD_SMTP_USERNAME`
- `PROD_SMTP_PASSWORD`

Non-secret or low-sensitivity configuration:

- `SMTP_PORT`
- `SMTP_FROM`
- `SMTP_INSECURE`
- `PASSWORD_RESET_CODE_TTL_MINUTES`
- `PASSWORD_RESET_LOG_CODES`

For local real-SMTP verification:

- keep real credentials only in an ignored local `.env`
- do not commit `.env`, `.env.bak*`, or copied secret files
- keep `PASSWORD_RESET_LOG_CODES=false` when validating real SMTP delivery

## Verification without printing secret values

On the target host, verify the env file contains the required keys without echoing their values:

```sh
grep -E '^(STAGE_SMTP_HOST|STAGE_SMTP_PORT|STAGE_SMTP_USERNAME|STAGE_SMTP_PASSWORD|STAGE_SMTP_FROM|STAGE_SMTP_INSECURE|STAGE_PASSWORD_RESET_CODE_TTL_MINUTES|STAGE_PASSWORD_RESET_LOG_CODES)=' .env | sed 's/=.*/=<set>/'
```

Then validate compose expansion:

```sh
docker compose --env-file .env -f docker-compose.yml config --quiet
```

## Restart scope after env changes

- Recreate `backend` only.
- `frontend`, `services`, `mobile`, `orchestrator`, `postgres`, nginx, and migrations are not part of this change.

## SMTP mode behavior

- `SMTP_INSECURE=true` uses plaintext SMTP via `builder_dangerous(...)`.
- `SMTP_INSECURE=false` with `SMTP_PORT=587` uses required `STARTTLS`.
- `SMTP_INSECURE=false` with `SMTP_PORT=465` uses TLS-wrapped SMTP.
- Other secure custom ports stay operator-confirmed territory and should be matched to the mail provider's documented TLS mode.

For ALL-INKL style SMTP on port `587`, the host should look like:

- `wXXXXXXX.kasserver.com`

Verified local ALL-INKL shape:

- `SMTP_HOST=w01da3ea.kasserver.com`
- `SMTP_PORT=587`
- `SMTP_INSECURE=false`
- `SMTP_FROM=info@jvmoebel.at`

Recommended sender format for `.env`:

- use the plain mailbox form, for example `SMTP_FROM=info@jvmoebel.at`

Display-name sender format such as `SMTP_FROM=WareHub <info@jvmoebel.at>` should only be used if the runtime/env parser is confirmed to preserve it correctly.

If the provider rejects the sender, align `SMTP_FROM` with the same mailbox used in `SMTP_USERNAME`.

## Expected verification

- Submit a password reset request from the stage login flow.
- Confirm the backend stays healthy and logs no SMTP secret values.
- Confirm the email contains the reset code.
- Keep `PASSWORD_RESET_LOG_CODES=false` after verification.
- If a mailbox password was exposed during manual troubleshooting, rotate it outside chat and update runtime env without printing the new value.

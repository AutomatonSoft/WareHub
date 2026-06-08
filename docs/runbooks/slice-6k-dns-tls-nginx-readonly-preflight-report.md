# Slice 6K - DNS/TLS/Nginx Read-Only Preflight Report

## 1. Scope

- Goal: document read-only DNS/TLS/nginx preflight results for stage and prod domains before any deploy.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is based only on repository files and the provided verified non-secret read-only check results.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- GHCR pull is verified.
- Server access is verified.
- Sanitized env templates exist:
  - `infra/deploy/stage/env.stage.sanitized.template`
  - `infra/deploy/prod/env.prod.sanitized.template`
- No deploy has been performed yet.

## 3. DNS Verification Results

- Windows `nslookup` against resolver `2606:4700:4700::1111` returned `No response from server` for:
  - `stagewarehub.automatonsoft.de`
  - `warehub.automatonsoft.de`
- Server-side `getent hosts` succeeded for both domains.
- Verified server-side resolution:
  - `stagewarehub.automatonsoft.de -> 217.160.149.34`
  - `warehub.automatonsoft.de -> 217.160.149.34`

Conclusion:

- DNS appears usable from the server.
- The Windows resolver behavior should still be noted as an operator-side verification issue to revisit later.

## 4. HTTP/HTTPS Verification Results

- `curl -I https://stagewarehub.automatonsoft.de` returned `HTTP/1.1 502 Bad Gateway` from nginx.
- `curl -I https://warehub.automatonsoft.de` returned `HTTP/1.1 502 Bad Gateway` from nginx.

Conclusion:

- Both domains reach nginx successfully.
- The `502` result is consistent with nginx being reachable before WareHub upstream containers are running on the planned backend/frontend ports.

## 5. TLS Certificate Verification Results

| Domain | Issuer | Expiry | Days Valid | Status |
|---|---|---|---|---|
| `stagewarehub.automatonsoft.de` | `Let's Encrypt E7` | `2026-07-01 11:25:23+00:00` | `23` | valid |
| `warehub.automatonsoft.de` | `Let's Encrypt E7` | `2026-07-01 11:28:16+00:00` | `23` | valid |

Notes:

- Both stage and prod certificates were verified by `openssl` and `certbot`.
- Certificate validity is short enough that renewal status still needs a dedicated follow-up check.

## 6. Nginx Verification Results

- Running `nginx -t` as `cddeploy` failed because the command could not read nginx logs or certificate material with that permission level.
- Running `nginx -t` as root succeeded:
  - syntax is ok
  - configuration file test is successful
- Root-level `nginx -t` also reported:
  - `4096 worker_connections exceed open file resource limit: 1024`
- Existing server_name evidence:
  - `/etc/nginx/conf.d/stagewarehub.conf` exists and contains `server_name stagewarehub.automatonsoft.de`
  - `/etc/nginx/conf.d/warehub.conf` exists and contains `server_name warehub.automatonsoft.de`
- No nginx reload was performed.

## 7. Port Conflict Verification

- Planned stage ports are currently free in the read-only check:
  - `8941`
  - `8942`
  - `8943`
  - `8944`
  - `8945`
- Planned prod ports are currently free in the read-only check:
  - `8951`
  - `8952`
  - `8953`
  - `8954`
  - `8955`
- The shared server already has many other services and ports in use.
- Port isolation must remain strict.
- No ports were changed in this slice.

## 8. Existing Projects Safety Notes

Existing projects and services were observed on the shared server, including:

- `productron_prod`
- `productbaseapi`
- `productbaseapi-dev`
- `time_counter`
- `gen_images`
- `posterapp`
- `netdata`

These existing projects were not modified.

## 9. Certbot/Renewal Risks

- `certbot certificates` showed both WareHub certificates valid for `23` days.
- `systemctl list-timers` did not show a visible `certbot` or `letsencrypt` timer in the captured result.
- `certbot certificates` also showed other non-WareHub certificates with shorter remaining validity:
  - `hiw-gen.automatonsoft.de` valid `6` days
  - `posterapp.automatonsoft.de` valid `6` days
  - `productron.automatonsoft.de` valid `7` days
  - `git.automatonsoft.de` valid `20` days
- Renewal automation should be checked in a future server-hardening slice.
- No certbot configuration was modified in this slice.

## 10. Commands Executed

The following commands were part of the documented read-only verification evidence:

- `nslookup stagewarehub.automatonsoft.de`
- `nslookup warehub.automatonsoft.de`
- `curl -I https://stagewarehub.automatonsoft.de`
- `curl -I https://warehub.automatonsoft.de`
- `ssh warehub-stage "hostname && whoami && nginx -t && ss -tulpn | grep -E ':80|:443|:8941|:8942|:8943|:8944|:8945|:8951|:8952|:8953|:8954|:8955'"`
- `ssh root@217.160.149.34 "nginx -t"`
- `ssh warehub-stage "ss -tulpn | grep -E ':8941|:8942|:8943|:8944|:8945|:8951|:8952|:8953|:8954|:8955' || true"`
- `ssh warehub-stage "find /etc/nginx -maxdepth 3 -type f \( -name '*.conf' -o -name '*.conf.template' \) -print"`
- `ssh root@217.160.149.34 'grep -R "server_name" /etc/nginx 2>/dev/null || true'`
- `ssh warehub-stage "openssl s_client -connect stagewarehub.automatonsoft.de:443 -servername stagewarehub.automatonsoft.de"`
- `ssh warehub-stage "openssl s_client -connect warehub.automatonsoft.de:443 -servername warehub.automatonsoft.de"`
- `ssh root@217.160.149.34 "systemctl list-timers --all | grep -E 'certbot|letsencrypt' || true"`
- `ssh root@217.160.149.34 "certbot certificates 2>/dev/null || true"`
- `ssh warehub-stage "getent hosts stagewarehub.automatonsoft.de || true"`
- `ssh warehub-stage "getent hosts warehub.automatonsoft.de || true"`

Note:

- The initial combined `cddeploy` `nginx -t` and `ss` command did not complete the `ss` part because `nginx -t` failed first; the WareHub port check was repeated separately afterward and returned no matching listeners.

Not executed in this slice:

- no deploy command
- no nginx reload
- no `docker compose up`

## 11. Remaining Blockers Before First Stage Deploy

- real `STAGE_ENV_FILE` not created
- GitHub Environment secrets not created
- nginx upstream returns `502` until WareHub containers run
- `docker compose config` not run with real stage env
- migration plan not executed
- deploy workflow not added
- cert renewal automation not confirmed
- exposed GHCR token must be revoked or replaced if not already done

## 12. Recommended Next Slice

- `Slice 6L - stage env secret contract and GitHub Environment setup plan`

Important:

- Slice 6L should not deploy
- Slice 6L should not commit real secrets
- Slice 6L should prepare exact GitHub Environment secret and variable names only

## 13. Explicit Non-Goals

- no deploy
- no docker compose up
- no real `.env` creation
- no server changes
- no nginx edit
- no nginx reload
- no certbot changes
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes

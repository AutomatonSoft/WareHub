# Slice 6H - Server Access Preflight Report

## 1. Scope

- Goal: document the confirmed non-secret server access facts for both stage and prod deploy paths on the same server.
- Repository root: `I:\WareHub`
- Allowed change in this slice: add this runbook only.
- This report is based only on repository files and the provided verified non-secret server facts.
- This slice does not deploy anything.

## 2. Confirmed Baseline

- CI is green.
- GHCR publish is verified.
- Verified immutable image tag: `stage-a1c2946`
- No deploy has been performed yet.
- Slice 6H is server access preflight only.

## 3. Confirmed Server Facts Table

| Item | Value | Status | Notes |
|---|---|---|---|
| server host | `217.160.149.34` | confirmed | provided verified fact |
| server hostname | `betterserver-new` | confirmed | provided verified fact |
| server OS | `AlmaLinux 9.7` | confirmed | provided verified fact |
| SSH port | `22` | confirmed | provided verified fact |
| deploy user | `cddeploy` | confirmed | provided verified fact |
| base deploy path | `/opt/warehub` | confirmed | provided verified fact |
| stage deploy path | `/opt/warehub/stage` | confirmed | provided verified fact |
| prod deploy path | `/opt/warehub/prod` | confirmed | provided verified fact |
| shared path | `/opt/warehub/shared` | confirmed | provided verified fact |
| backups path | `/opt/warehub/backups` | confirmed | provided verified fact |
| logs path | `/opt/warehub/logs` | confirmed | provided verified fact |
| Docker version | `29.4.1` | confirmed | provided verified fact |
| Docker Compose version | `v5.1.3` | confirmed | provided verified fact |
| nginx version | `1.20.1` | confirmed | provided verified fact |
| nginx status | `active/running` | confirmed | provided verified fact |
| listening ports | `22, 80, 443` | confirmed | provided verified fact |
| root filesystem | `719G total, 315G available, 57% used` | confirmed | provided verified fact |
| memory | `23Gi total, 7.1Gi available` | confirmed | provided verified fact |
| swap | `8.0Gi total, 6.7Gi free` | confirmed | provided verified fact |
| stage SSH alias | `warehub-stage` | confirmed | local workstation SSH alias |
| prod SSH alias | `warehub-prod` | confirmed | local workstation SSH alias |

## 4. Stage/Prod Path Layout

- `/opt/warehub`
- `/opt/warehub/stage`
- `/opt/warehub/prod`
- `/opt/warehub/shared`
- `/opt/warehub/backups`
- `/opt/warehub/logs`

Ownership and write-access confirmation:

- `/opt/warehub` ownership: `cddeploy:cddeploy`
- `/opt/warehub/stage` ownership: `cddeploy:cddeploy`
- `/opt/warehub/prod` ownership: `cddeploy:cddeploy`
- `cddeploy` has confirmed write access to:
  - `/opt/warehub/stage`
  - `/opt/warehub/prod`

## 5. SSH Access Verification

- deploy user: `cddeploy`
- SSH port: `22`
- stage alias: `warehub-stage`
- prod alias: `warehub-prod`

Commands used:

```bash
ssh warehub-stage "whoami && hostname && pwd"
ssh warehub-prod "whoami && hostname && cd /opt/warehub/prod && pwd"
```

Successful observed outputs:

For `warehub-stage`:

```text
cddeploy
betterserver-new
/home/cddeploy
```

For `warehub-prod`:

```text
cddeploy
betterserver-new
/opt/warehub/prod
```

No private key contents are included in this report.

## 6. Runtime Prerequisites Verification

- Docker version confirmed: `29.4.1`
- Docker Compose version confirmed: `v5.1.3`
- nginx version confirmed: `1.20.1`
- nginx status confirmed: `active/running`
- listening ports confirmed: `22`, `80`, `443`
- disk status confirmed:
  - root filesystem `719G total, 315G available, 57% used`
- memory status confirmed:
  - `23Gi total, 7.1Gi available`
- swap status confirmed:
  - `8.0Gi total, 6.7Gi free`

## 7. Stage/Prod Same-Server Separation Requirements

Stage and prod are allowed on the same server only if they remain separated by:

- deploy path
- env file
- compose project name
- container names
- ports
- volumes
- image tags
- nginx server blocks
- backup paths
- logs paths

## 8. Remaining TODOs Before Deploy

- `STAGE_ENV_FILE` not created
- `PROD_ENV_FILE` not created
- GitHub Environment secrets not created
- GHCR pull from server not yet verified
- DNS for stage domain not verified in this slice
- SSL certificate for stage domain not verified in this slice
- nginx WareHub server block not installed or verified in this slice
- compose config not run on server with real env
- migration plan not executed
- no deploy workflow added

## 9. Commands Executed / Verified

The following commands are documented as evidence for this slice:

- `hostnamectl`
- `whoami`
- `pwd`
- `docker --version`
- `docker compose version`
- `nginx -v`
- `systemctl status nginx --no-pager`
- `ss -tulpn | grep -E ':80|:443|:22'`
- `df -h`
- `free -h`
- `ssh warehub-stage "whoami && hostname && pwd"`
- `ssh warehub-prod "whoami && hostname && cd /opt/warehub/prod && pwd"`
- write test in `/opt/warehub/stage` and `/opt/warehub/prod`

No deploy command was executed.

## 10. Recommended Next Slice

- `Slice 6I - GHCR pull preflight and stage/prod env contract`

Important:

- Slice 6I may use SSH only after explicit approval.
- Slice 6I should verify Docker login or pull only.
- Slice 6I should not deploy.
- Slice 6I should not create real `.env` in the repository.

## 11. Explicit Non-Goals

- no deploy
- no docker compose up
- no `.env` creation
- no GitHub Secrets changes
- no deploy workflow added
- no runtime changes
- no script changes
- no compose changes
- no Dockerfile changes
- no source changes

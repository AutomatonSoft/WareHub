# Frontend E2E Debugging Runbook

## 1) Quick preflight

```powershell
$env:E2E_LOGIN="your_login"
$env:E2E_PASSWORD="your_password"
npm run e2e:preflight
```

Checks:
- `E2E_LOGIN/E2E_PASSWORD` presence
- frontend login reachability (`http://localhost:8931/login` or `E2E_BASE_URL`)
- backend health reachability (`http://localhost:8932/healthz` or `E2E_BACKEND_HEALTH_URL`)

## 2) Local ports and services

Expected dev ports:
- frontend: `8931`
- backend auth/api: `8932`
- services api: `8934`

Check:

```powershell
Invoke-WebRequest http://localhost:8931/login -UseBasicParsing
Invoke-WebRequest http://localhost:8932/healthz -UseBasicParsing
Invoke-WebRequest http://localhost:8934/api/v1/openapi.json -UseBasicParsing
```

If `ECONNREFUSED`:
- restart `./start-dev.ps1 -Flag 2`
- verify backend/frontend processes are running

## 3) Common login issue

If e2e stays on `/login`, verify credentials directly:

```powershell
$body = @{ login = "YOUR_LOGIN"; password = "YOUR_PASSWORD" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8932/api/v1/auth/login -Body $body -ContentType "application/json"
```

Invalid credentials usually return `400/401`; e2e auth helper prints status and response body.

## 4) Run the needed suite

```powershell
npm run test:e2e:smoke
npm run test:e2e:table
npm run test:e2e:visual
npm run test:e2e:mutation
npm run test:e2e:perf
npm run test:e2e:flaky
```

## 5) Trace diagnostics

On failure Playwright saves `trace.zip` under `test-results/...`.

Open trace:

```powershell
npx playwright show-trace .\test-results\<folder>\trace.zip
```

Review:
- actual URL and redirect chain
- network calls (`/api/v1/auth/login`, `/inventory/rows/`)
- browser console and script errors

## 6) Visual regression issues

To intentionally update baseline:

```powershell
$env:E2E_VISUAL="1"
npx playwright test e2e/visual-regression.spec.ts --update-snapshots --workers=1
```

Baselines are in `e2e/__screenshots__/...`.

## 7) SSH DB tunnel issues (dev)

If `start-dev.ps1` fails on SSH:
- check SSH host reachability and keys
- check `DEV_DB_TUNNEL_*` in `sofortbot-infra/.env`
- if server is temporarily unavailable, disable tunnel (`DEV_DB_TUNNEL_ENABLED=false`) and use local DB

## 8) When to open an issue

Open an issue if:
- preflight passes but e2e still fails in CI
- mismatch happens only in CI and is not reproducible locally
- flaky rate is growing for the same spec

Attach:
- reproduction steps
- `trace.zip`
- screenshot/video from `test-results`
- commit SHA and suite command

## 9) CI artifact naming convention

E2E CI uploads follow:
- `e2e-<suite>-<run_id>-<run_attempt>`

Examples:
- `e2e-smoke-123456789-1`
- `e2e-visual-123456789-1`

## 10) Route-level network mocks (negative tests)

Use helper:
- `e2e/helpers/network-mocks.ts`

Available utilities:
- `mockRouteAbort(page, "**/inventory/rows/**")`
- `mockRouteDelayThenContinue(page, pattern, delayMs)`
- `mockJsonResponse(page, pattern, status, body)`

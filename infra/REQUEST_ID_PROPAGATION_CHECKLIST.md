# REQUEST_ID_PROPAGATION_CHECKLIST

End-to-end request id propagation verification.

Goal:
- confirm `x-request-id` is generated (if absent),
- propagated across frontend proxy and upstream services,
- present in response headers and error envelopes.

Scope:
- local verification only, no deploy.

## 1. Preconditions

1. Frontend proxy routes are reachable:
   - `/api/services/*`
   - `/api/orchestrator/*`
2. Backend and orchestrator are running in the target environment.
3. Use a unique marker id for each check.

## 2. Frontend proxy -> services check

```bash
RID="rid-services-$(date +%s)"
curl -i \
  -H "x-request-id: ${RID}" \
  "http://127.0.0.1:8931/api/services/v1/marketplace/hood/health/"
```

Expected:
- response contains header `x-request-id`,
- value equals `${RID}` or upstream-provided id traceable to `${RID}` path,
- non-2xx errors still include `request_id` in JSON body.

## 3. Frontend proxy -> orchestrator check

```bash
RID="rid-orch-$(date +%s)"
curl -i \
  -H "x-request-id: ${RID}" \
  "http://127.0.0.1:8931/api/orchestrator/jobs/non-existent-job-id"
```

Expected:
- response header `x-request-id` present,
- error body includes `request_id`,
- value is stable across header/body for the same response.

## 4. Auto-generation check (no incoming header)

```bash
curl -i "http://127.0.0.1:8931/api/services/v1/marketplace/kaufland/health/"
curl -i "http://127.0.0.1:8931/api/orchestrator/jobs/non-existent-job-id"
```

Expected:
- `x-request-id` is present even without request header,
- generated value is non-empty and request-scoped.

## 5. Backend direct check

```bash
RID="rid-backend-$(date +%s)"
curl -i -H "x-request-id: ${RID}" "http://127.0.0.1:8932/healthz"
curl -i -H "x-request-id: ${RID}" "http://127.0.0.1:8932/api/v1/healthz"
```

Expected:
- backend response includes `x-request-id`,
- propagation/mirroring behavior is consistent.

## 6. Pass criteria

- All tested paths return response header `x-request-id`.
- Error envelopes include `request_id` where applicable.
- No endpoint silently drops tracing id at proxy boundary.

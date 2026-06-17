from __future__ import annotations

from copy import deepcopy

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi


DOMAIN_ORDER = [
    "healthz",
    "readyz",
    "openapi.json",
    "metrics",
    "jobs",
    "product-editor",
    "products",
    "reconciliation",
]

TAG_CONFIG = {
    "healthz": ("System", "System health, readiness and OpenAPI endpoints."),
    "readyz": ("System", "System health, readiness and OpenAPI endpoints."),
    "openapi.json": ("System", "System health, readiness and OpenAPI endpoints."),
    "metrics": ("System", "Runtime metrics and operational diagnostics."),
    "jobs": ("Jobs", "Async orchestrator job intake and inspection endpoints."),
    "product-editor": ("Product Editor", "Product Editor discover, load, plan, apply and job-status endpoints."),
    "products": ("Products", "Direct orchestrator product update endpoints."),
    "reconciliation": ("Reconciliation", "Reconciliation planning and report retrieval endpoints."),
}


def install_custom_openapi(app: FastAPI) -> None:
    def custom_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema

        schema = get_openapi(
            title=app.title,
            version=app.version,
            description="WareHub orchestrator API for async jobs, product editor flows and reconciliation operations.",
            routes=app.routes,
        )
        app.openapi_schema = enrich_openapi_document(schema)
        return app.openapi_schema

    app.openapi = custom_openapi


def enrich_openapi_document(document: dict) -> dict:
    enriched = deepcopy(document)
    paths = enriched.get("paths", {})
    paths.setdefault(
        "/api/v1/openapi.json",
        {
            "get": {
                "summary": "Get orchestrator OpenAPI schema",
                "description": "Returns the normalized OpenAPI document for the orchestrator service.",
                "responses": {
                    "200": {
                        "description": "OpenAPI JSON document."
                    }
                },
            }
        },
    )

    for path, path_item in paths.items():
        for method, operation in list(path_item.items()):
            if method not in {"get", "post", "put", "patch", "delete"} or not isinstance(operation, dict):
                continue
            enrich_operation(path, method, operation)

    enriched["paths"] = dict(sorted(paths.items(), key=lambda item: path_sort_key(item[0])))
    enriched["tags"] = build_tags(paths)
    enriched["x-tagGroups"] = [
        {
            "name": "Orchestrator",
            "tags": [tag["name"] for tag in build_tags(paths)],
        }
    ]
    return enriched


def enrich_operation(path: str, method: str, operation: dict) -> None:
    domain = get_domain(path)
    tag_name, _ = TAG_CONFIG.get(domain, (title_case(domain), ""))
    operation["tags"] = [tag_name]
    operation["operationId"] = build_operation_id(method, path)

    if not str(operation.get("summary") or "").strip():
        operation["summary"] = build_summary(path, method)
    if not str(operation.get("description") or "").strip():
        operation["description"] = build_description(path, method)

    responses = operation.setdefault("responses", {})
    for status_code, response in list(responses.items()):
        if isinstance(response, dict) and not str(response.get("description") or "").strip():
            response["description"] = default_response_description(status_code)


def build_tags(paths: dict) -> list[dict]:
    tags = []
    seen = set()
    for path in paths:
        domain = get_domain(path)
        tag_name, description = TAG_CONFIG.get(domain, (title_case(domain), f"{title_case(domain)} endpoints."))
        if tag_name in seen:
            continue
        seen.add(tag_name)
        tags.append({"name": tag_name, "description": description})
    return sorted(tags, key=lambda item: tag_sort_key(item["name"]))


def tag_sort_key(name: str) -> tuple[int, str]:
    order = []
    for domain in DOMAIN_ORDER:
        tag_name, _ = TAG_CONFIG.get(domain, (title_case(domain), ""))
        if tag_name not in order:
            order.append(tag_name)
    try:
        return (order.index(name), name)
    except ValueError:
        return (len(order), name)


def path_sort_key(path: str) -> tuple[int, str, str]:
    domain = get_domain(path)
    try:
        return (DOMAIN_ORDER.index(domain), domain, path)
    except ValueError:
        return (len(DOMAIN_ORDER), domain, path)


def build_operation_id(method: str, path: str) -> str:
    normalized_path = path.strip("/").replace("/", "_").replace("{", "").replace("}", "")
    normalized_path = normalized_path.replace("-", "_")
    return f"orchestrator_{method}_{normalized_path}"


def get_domain(path: str) -> str:
    segments = [segment for segment in path.split("/") if segment]
    if len(segments) < 3:
        return "root"
    if segments[2] == "orchestrator":
        return segments[3] if len(segments) > 3 else "orchestrator"
    return segments[2]


def title_case(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").title().strip()


def build_summary(path: str, method: str) -> str:
    tail = [segment for segment in path.split("/") if segment][2:]
    if tail[:1] == ["healthz"]:
        return "Orchestrator health check"
    if tail[:1] == ["readyz"]:
        return "Orchestrator readiness check"
    if tail[:1] == ["metrics"]:
        return "Get orchestrator metrics"
    if tail[:2] == ["orchestrator", "products"]:
        return "Update orchestrator product"
    if tail[:2] == ["orchestrator", "jobs"] and len(tail) == 2 and method == "post":
        return "Create orchestrator job"
    if tail[:3] == ["orchestrator", "jobs", "batch"]:
        return "Create orchestrator jobs batch"
    if tail[:4] == ["orchestrator", "jobs", "status", "batch"]:
        return "Get orchestrator batch job statuses"
    if tail[:2] == ["orchestrator", "jobs"] and "events" in tail:
        return "List orchestrator job events"
    if tail[:2] == ["orchestrator", "jobs"] and "attempts" in tail:
        return "List orchestrator job attempts"
    if tail[:2] == ["orchestrator", "jobs"]:
        return "Get orchestrator job"
    if tail[:3] == ["orchestrator", "product-editor", "discover"]:
        return "Discover Product Editor context"
    if tail[:3] == ["orchestrator", "product-editor", "load"]:
        return "Load Product Editor data"
    if tail[:3] == ["orchestrator", "product-editor", "plan"]:
        return "Plan Product Editor changes"
    if tail[:3] == ["orchestrator", "product-editor", "apply"]:
        return "Apply Product Editor plan"
    if tail[:3] == ["orchestrator", "product-editor", "jobs"]:
        return "Get Product Editor job status"
    if tail[:3] == ["orchestrator", "reconciliation", "diff"]:
        return "Reconcile orchestrator state"
    if tail[:3] == ["orchestrator", "reconciliation", "reports"] and len(tail) == 3:
        return "List reconciliation reports"
    if tail[:3] == ["orchestrator", "reconciliation", "reports"]:
        return "Get reconciliation report"
    if tail[:1] == ["openapi.json"]:
        return "Get orchestrator OpenAPI schema"
    return f"{method.upper()} {path}"


def build_description(path: str, method: str) -> str:
    tail = [segment for segment in path.split("/") if segment][2:]
    if path == "/api/v1/healthz":
        return "Lightweight liveness probe for the orchestrator process."
    if path == "/api/v1/readyz":
        return "Readiness probe that validates the orchestrator idempotency store connection."
    if path == "/api/v1/openapi.json":
        return "Returns the normalized OpenAPI document for the orchestrator service."
    if path == "/api/v1/metrics":
        return "Returns in-memory request, job store, database pool and circuit-breaker metrics."
    if tail[:2] == ["orchestrator", "products"]:
        return "Executes a direct orchestrator product update request for the provided EAN across selected channels."
    if tail[:2] == ["orchestrator", "jobs"] and len(tail) == 2:
        return "Queues one asynchronous orchestrator job and returns its job identifier."
    if tail[:3] == ["orchestrator", "jobs", "batch"]:
        return "Queues multiple orchestrator jobs in a single request."
    if tail[:4] == ["orchestrator", "jobs", "status", "batch"]:
        return "Loads status snapshots for multiple orchestrator job identifiers."
    if tail[:2] == ["orchestrator", "jobs"] and "events" in tail:
        return "Returns recorded event history for one orchestrator job."
    if tail[:2] == ["orchestrator", "jobs"] and "attempts" in tail:
        return "Returns execution attempt history for one orchestrator job."
    if tail[:2] == ["orchestrator", "jobs"]:
        return "Returns the current persisted status for one orchestrator job."
    if tail[:3] == ["orchestrator", "product-editor", "discover"]:
        return "Discovers Product Editor groups, capabilities and initial warnings for a given EAN."
    if tail[:3] == ["orchestrator", "product-editor", "load"]:
        return "Loads Product Editor baseline data and current target state for a selected group."
    if tail[:3] == ["orchestrator", "product-editor", "plan"]:
        return "Builds a Product Editor execution plan from draft changes and selected targets."
    if tail[:3] == ["orchestrator", "product-editor", "apply"]:
        return "Applies a previously generated Product Editor plan after explicit confirmation."
    if tail[:3] == ["orchestrator", "product-editor", "jobs"]:
        return "Returns Product Editor job status, target execution state and warnings."
    if tail[:3] == ["orchestrator", "reconciliation", "diff"]:
        return "Computes desired-versus-actual channel state differences for one EAN."
    if tail[:3] == ["orchestrator", "reconciliation", "reports"] and len(tail) == 3:
        return "Lists stored reconciliation reports, optionally filtered by request parameters."
    if tail[:3] == ["orchestrator", "reconciliation", "reports"]:
        return "Returns one persisted reconciliation report by identifier."
    return f"{build_summary(path, method)}."


def default_response_description(status_code: str) -> str:
    return {
        "200": "Request completed successfully.",
        "201": "Resource created successfully.",
        "202": "Request accepted for processing.",
        "204": "Request completed successfully with no response body.",
        "400": "Request validation failed.",
        "401": "Authentication is required or provided credentials are invalid.",
        "403": "Authenticated caller does not have permission to perform this action.",
        "404": "Requested resource was not found.",
        "409": "Request conflicts with the current resource state.",
        "422": "Request body failed schema validation.",
        "429": "Request was rate-limited.",
        "500": "Internal server error.",
        "502": "Upstream dependency request failed.",
        "503": "Service dependency is unavailable.",
    }.get(status_code, "Request response.")

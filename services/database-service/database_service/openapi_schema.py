import json
import warnings
from copy import deepcopy

from rest_framework.schemas.openapi import SchemaGenerator


DOMAIN_ORDER = [
    "healthz",
    "readyz",
    "openapi.json",
    "dev",
    "kids",
    "orders",
    "inventory",
    "ean-pool",
    "uploads",
    "afterbuy",
    "kaufland",
    "marketplace",
    "telegram",
    "hood",
    "otto",
    "xl",
    "jv",
]

TAG_CONFIG = {
    "healthz": ("System", "System health and readiness endpoints."),
    "readyz": ("System", "System health and readiness endpoints."),
    "openapi.json": ("System", "System health and readiness endpoints."),
    "dev": ("Session", "Database service session bridge endpoints."),
    "kids": ("Kids", "Kid records, related summaries and lookup endpoints."),
    "orders": ("Orders", "Order records managed by the database service."),
    "inventory": ("Inventory", "Inventory projection and warehouse reporting endpoints."),
    "ean-pool": ("EAN Pool", "EAN pool import, reservation and usage management."),
    "uploads": ("Uploads", "Image upload endpoints for service-managed assets."),
    "afterbuy": ("Afterbuy", "Afterbuy lookup and order creation helpers."),
    "kaufland": ("Kaufland", "Kaufland marketplace product operations."),
    "marketplace": ("Marketplace Health", "Marketplace integration health checks."),
    "telegram": ("Telegram", "Telegram bot webhook and marketplace action callbacks."),
    "hood": ("Hood", "Hood marketplace read and update helpers."),
    "otto": ("Otto", "Otto marketplace read and write endpoints."),
    "xl": ("XL", "XLMOEBEL catalog and batch endpoints."),
    "jv": ("JV", "JVMOEBEL catalog and batch endpoints."),
}


def generate_openapi_document(request=None, public=True) -> dict:
    generator = SchemaGenerator(
        title="Database Service API",
        description="OpenAPI schema for all registered Database Service endpoints",
        version="v1",
    )
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"You have a duplicated operationId in your OpenAPI schema:.*",
            category=UserWarning,
        )
        schema = generator.get_schema(request=request, public=public)
    raw = json.loads(json.dumps(schema))
    return enrich_openapi_document(raw)


def enrich_openapi_document(document: dict) -> dict:
    enriched = deepcopy(document)
    paths = enriched.get("paths", {})
    components = enriched.setdefault("components", {})
    components["securitySchemes"] = {
        **components.get("securitySchemes", {}),
        "backendBearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "UUID token",
            "description": "Backend bearer token used to bootstrap a database-service session via `/api/v1/dev/session/sync/`.",
        },
        "sessionCookieAuth": {
            "type": "apiKey",
            "in": "cookie",
            "name": "sessionid",
            "description": "Django session cookie created after successful backend session sync.",
        },
        "serviceTokenAuth": {
            "type": "apiKey",
            "in": "header",
            "name": "x-warehub-service-token",
            "description": "Service-to-service token accepted from trusted orchestrator hosts.",
        },
        "telegramWebhookSecret": {
            "type": "apiKey",
            "in": "header",
            "name": "x-telegram-bot-api-secret-token",
            "description": "Telegram webhook secret token configured through `TELEGRAM_WEBHOOK_SECRET`.",
        },
    }
    schemas = components.setdefault("schemas", {})
    schemas.setdefault(
        "ErrorResponse",
        {
            "type": "object",
            "required": ["code", "message"],
            "properties": {
                "code": {"type": "string", "description": "Stable machine-readable error code."},
                "message": {"type": "string", "description": "Safe human-readable error message."},
                "request_id": {
                    "type": "string",
                    "nullable": True,
                    "description": "Optional request correlation id.",
                },
                "details": {"type": "object", "additionalProperties": True, "nullable": True},
            },
        },
    )
    schemas.setdefault(
        "TelegramUpdate",
        {
            "type": "object",
            "required": ["update_id"],
            "additionalProperties": True,
            "properties": {
                "update_id": {"type": "integer", "description": "Telegram update identifier."},
                "message": {"type": "object", "additionalProperties": True, "nullable": True},
                "callback_query": {"type": "object", "additionalProperties": True, "nullable": True},
            },
        },
    )
    schemas.setdefault(
        "TelegramWebhookResponse",
        {
            "type": "object",
            "required": ["ok"],
            "additionalProperties": True,
            "properties": {
                "ok": {"type": "boolean"},
                "status": {"type": "string", "nullable": True},
            },
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
            "name": "Database Service",
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

    if is_telegram_webhook_path(path):
        enrich_telegram_webhook_operation(operation)

    apply_security(path, operation)
    enrich_responses(path, method, operation)


def enrich_telegram_webhook_operation(operation: dict) -> None:
    operation["requestBody"] = {
        "required": True,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/TelegramUpdate"}
            }
        },
    }


def apply_security(path: str, operation: dict) -> None:
    if path in {
        "/api/v1/healthz",
        "/api/v1/healthz/",
        "/api/v1/readyz",
        "/api/v1/readyz/",
        "/api/v1/openapi.json",
    }:
        operation.pop("security", None)
        return
    if path == "/api/v1/dev/session/sync/":
        operation["security"] = [{"backendBearerAuth": []}]
        return
    if is_telegram_webhook_path(path):
        operation["security"] = [{"telegramWebhookSecret": []}]
        return
    operation["security"] = [{"sessionCookieAuth": []}, {"serviceTokenAuth": []}]


def enrich_responses(path: str, method: str, operation: dict) -> None:
    responses = operation.setdefault("responses", {})
    for status_code, response in list(responses.items()):
        if isinstance(response, dict) and not str(response.get("description") or "").strip():
            response["description"] = default_response_description(status_code)

    if path == "/api/v1/dev/session/sync/":
        ensure_error_response(responses, "401", "Backend bearer token is missing or invalid.")
        ensure_error_response(responses, "403", "Backend account is not approved or role is not allowed.")
        ensure_error_response(responses, "404", "Session bridge is disabled for the current host.")
        ensure_error_response(responses, "502", "Backend auth service could not be reached.")
        return

    if is_telegram_webhook_path(path):
        responses.pop("201", None)
        responses.setdefault(
            "200",
            {
                "description": "Telegram update accepted and processed.",
                "content": {
                    "application/json": {
                        "schema": {"$ref": "#/components/schemas/TelegramWebhookResponse"}
                    }
                },
            },
        )
        ensure_error_response(responses, "400", "Telegram update payload is not a JSON object.")
        ensure_error_response(responses, "403", "Telegram webhook secret token is invalid.")
        ensure_error_response(responses, "500", "Telegram update processing failed.")
        ensure_error_response(responses, "503", "Telegram webhook configuration is incomplete.")
        return

    if path in {"/api/v1/readyz", "/api/v1/readyz/"}:
        ensure_error_response(responses, "503", "Database dependency is unavailable.")
        return

    ensure_error_response(responses, "401", "Authentication is required.")
    ensure_error_response(responses, "403", "Authenticated caller does not have enough permissions.")

    if method in {"post", "put", "patch", "delete"}:
        ensure_error_response(responses, "400", "Request payload or parameters failed validation.")

    if has_path_parameter(path):
        ensure_error_response(responses, "404", "Requested resource was not found.")


def ensure_error_response(responses: dict, status_code: str, description: str) -> None:
    if status_code in responses:
        response = responses[status_code]
        if isinstance(response, dict) and not str(response.get("description") or "").strip():
            response["description"] = description
        return
    responses[status_code] = {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ErrorResponse"}
            }
        },
    }


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
    return f"services_{method}_{normalized_path}"


def get_domain(path: str) -> str:
    segments = [segment for segment in path.split("/") if segment]
    if len(segments) < 3:
        return "root"
    return segments[2]


def has_path_parameter(path: str) -> bool:
    return "{" in path and "}" in path


def is_telegram_webhook_path(path: str) -> bool:
    return path.rstrip("/") == "/api/v1/telegram/webhook"


def title_case(value: str) -> str:
    return value.replace("-", " ").replace("_", " ").title().strip()


def build_summary(path: str, method: str) -> str:
    segments = [segment for segment in path.split("/") if segment]
    tail = segments[2:]

    if tail[:1] == ["healthz"]:
        return "Service health check"
    if tail[:1] == ["readyz"]:
        return "Service readiness check"
    if tail[:1] == ["openapi.json"]:
        return "Get database service OpenAPI schema"
    if tail[:2] == ["dev", "session"]:
        return "Sync database-service session from backend token"
    if tail[:1] == ["kids"] and len(tail) == 1 and method == "get":
        return "List kids"
    if tail[:1] == ["kids"] and len(tail) == 1 and method == "post":
        return "Create kid"
    if tail[:2] == ["kids", "bulk-update"]:
        return "Bulk update kids"
    if tail[:1] == ["kids"] and "order-ids" in tail:
        return "List order ids by kid"
    if tail[:1] == ["kids"] and "ean-summary" in tail:
        return "Get kid EAN summary"
    if tail[:1] == ["kids"] and "marketplace-eans" in tail:
        return "List kid marketplace EANs"
    if tail[:1] == ["kids"] and method == "get":
        return "Get kid"
    if tail[:1] == ["kids"] and method in {"put", "patch"}:
        return "Update kid"
    if tail[:1] == ["orders"] and len(tail) == 1 and method == "get":
        return "List orders"
    if tail[:1] == ["orders"] and len(tail) == 1 and method == "post":
        return "Create order"
    if tail[:1] == ["orders"] and method == "get":
        return "Get order"
    if tail[:1] == ["orders"] and method in {"put", "patch"}:
        return "Update order"
    if tail[:2] == ["inventory", "rows"]:
        return "List inventory rows"
    if tail[:2] == ["ean-pool", "import"]:
        return "Import EAN pool rows"
    if tail[:2] == ["ean-pool", "stats"]:
        return "Get EAN pool statistics"
    if tail[:2] == ["ean-pool", "take-next-free"]:
        return "Take next free EAN"
    if tail[:2] == ["ean-pool", "reserve"]:
        return "Reserve EAN"
    if tail[:2] == ["ean-pool", "mark-used"]:
        return "Mark EAN as used"
    if tail[:1] == ["ean-pool"] and "usage" in tail:
        return "Get EAN usage history"
    if tail[:2] == ["uploads", "images"]:
        return "Upload images to public storage"
    if tail[:2] == ["afterbuy", "items"] and "search-web" in tail:
        return "Search Afterbuy items via web flow"
    if tail[:2] == ["afterbuy", "items"]:
        return "Search Afterbuy items"
    if tail[:2] == ["afterbuy", "orders"]:
        return "Create order from Afterbuy items"
    if tail[:1] == ["kaufland"] and "change" in tail:
        return "Change Kaufland product by EAN"
    if tail[:1] == ["kaufland"] and "delete" in tail:
        return "Delete Kaufland product by EAN"
    if tail[:1] == ["kaufland"] and "create" in tail:
        return "Create Kaufland product by EAN"
    if tail[:1] == ["kaufland"] and method == "get":
        return "Get Kaufland product by EAN"
    if tail[:2] == ["marketplace", "kaufland"]:
        return "Get Kaufland integration health"
    if tail[:2] == ["marketplace", "hood"]:
        return "Get Hood integration health"
    if tail[:2] == ["telegram", "webhook"] and method == "post":
        return "Handle Telegram webhook update"
    if tail[:1] == ["hood"]:
        return "Get Hood item by EAN"
    if tail[:1] == ["otto"] and "upsert" in tail:
        return "Upsert Otto product"
    if tail[:1] == ["otto"] and method == "get" and has_path_parameter(path):
        return "Get Otto product"
    if tail[:1] == ["otto"] and method == "get":
        return "List Otto products"
    if tail[:1] == ["xl"] or tail[:1] == ["jv"]:
        prefix = tail[0].upper()
        if "sites" in tail:
            return f"List {prefix} sites by EAN"
        if "rubrics" in tail:
            return f"Get {prefix} rubrics tree"
        if "delivery-options" in tail:
            return f"Get {prefix} delivery options"
        if "create-and-push" in tail:
            return f"Create and push {prefix} product"
        if "local-by-ean" in tail:
            return f"Get local {prefix} product by EAN"
        if "update-by-ean" in tail:
            return f"Update {prefix} product by EAN"
        if "sync-by-ean" in tail:
            return f"Sync {prefix} product by EAN"
        if "apply" in tail:
            return f"Apply {prefix} batch update plan"
        if "plan" in tail:
            return f"Plan {prefix} batch update"
        if "jobs" in tail:
            return f"Get {prefix} batch job status"
        return f"Get {prefix} product by EAN"
    return f"{method.upper()} {path}"


def build_description(path: str, method: str) -> str:
    segments = [segment for segment in path.split("/") if segment]
    tail = segments[2:]

    if path in {"/api/v1/healthz", "/api/v1/healthz/"}:
        return "Lightweight liveness probe for the database service process."
    if path in {"/api/v1/readyz", "/api/v1/readyz/"}:
        return "Readiness probe that verifies the primary database connection is available."
    if path == "/api/v1/openapi.json":
        return "Returns the normalized OpenAPI document for all database-service endpoints."
    if path == "/api/v1/dev/session/sync/":
        return "Validates a backend bearer token against `backend /auth/me` and creates a Django session for subsequent database-service calls."
    if tail[:1] == ["kids"] and len(tail) == 1 and method == "get":
        return "Returns kid records visible to the current authenticated session."
    if tail[:1] == ["kids"] and len(tail) == 1 and method == "post":
        return "Creates a new kid record in the database service domain."
    if tail[:2] == ["kids", "bulk-update"]:
        return "Applies bulk updates to multiple kid records in a single request."
    if "order-ids" in tail:
        return "Returns order identifiers associated with the selected kid."
    if "ean-summary" in tail:
        return "Builds an aggregated EAN summary for the selected kid."
    if "marketplace-eans" in tail:
        return "Returns marketplace-specific EAN values related to the selected kid."
    if tail[:1] == ["kids"] and has_path_parameter(path):
        return "Fetches or updates one kid record by its numeric identifier."
    if tail[:1] == ["orders"] and len(tail) == 1:
        return "Lists existing order records or creates a new order entry."
    if tail[:1] == ["orders"] and has_path_parameter(path):
        return "Fetches or updates one order record by its numeric identifier."
    if tail[:2] == ["inventory", "rows"]:
        return "Returns paginated inventory rows for dashboards and operational reporting."
    if tail[:1] == ["ean-pool"]:
        return "Manages pooled EAN numbers for assignment, reservation and audit workflows."
    if tail[:2] == ["uploads", "images"]:
        return "Uploads one or more image files to the configured public storage target and returns stored URLs."
    if tail[:1] == ["afterbuy"]:
        return "Provides Afterbuy search and order-creation helpers backed by the service integration layer."
    if tail[:1] == ["kaufland"]:
        return "Performs Kaufland marketplace product operations using service-managed adapters."
    if tail[:1] == ["marketplace"]:
        return "Exposes operational health information for marketplace integrations."
    if tail[:2] == ["telegram", "webhook"]:
        return "Receives Telegram bot updates, validates the Telegram secret header, and dispatches marketplace action callbacks."
    if tail[:1] == ["hood"]:
        return "Fetches and optionally updates Hood item data for the provided EAN."
    if tail[:1] == ["otto"]:
        return "Lists, reads or upserts Otto product data for the selected profile when provided."
    if tail[:1] == ["xl"] or tail[:1] == ["jv"]:
        family = "XLMOEBEL" if tail[0] == "xl" else "JVMOEBEL"
        return f"Service-managed {family} catalog, site, delivery and batch-processing endpoint."
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
        "500": "Internal server error.",
        "502": "Upstream dependency request failed.",
        "503": "Service dependency is unavailable.",
    }.get(status_code, "Request response.")

from __future__ import annotations

from fastapi.testclient import TestClient

from src.sofort_orchestrator.api.product_editor_routes import ProductEditorDeps
from src.sofort_orchestrator.api.routes import Deps
from src.sofort_orchestrator.domain.models import ChannelResult, FinalStatus, JobStatus, OrchestrateResponse
from src.sofort_orchestrator.application.orchestrator_service import OrchestratorService
from src.sofort_orchestrator.application.product_editor_service import ProductEditorService
from src.sofort_orchestrator.infra.idempotency import SqliteIdempotencyStore
from src.sofort_orchestrator.infra.job_store import SqliteJobStore
from src.sofort_orchestrator.infra.product_editor_store import SqliteProductEditorStore
from src.sofort_orchestrator.main import app


class NoopAdapters:
    def dispatch(self, *, ean: str, request_id: str, channel, payload: dict):
        return type("R", (), {"status_code": 200, "body": {"ok": True}})()


class FakeProductEditorGateway:
    def __init__(self):
        self.patch_calls: list[dict] = []
        self.jv_batch_calls: list[dict] = []
        self.jv_local_calls: list[str] = []
        self.xl_batch_calls: list[dict] = []
        self.kaufland_fetch_calls: list[str] = []
        self.kaufland_change_calls: list[dict] = []
        self.kaufland_create_calls: list[dict] = []
        self.jv_sites_calls = 0
        self.xl_sites_calls = 0
        self.fetch_by_account = {
            "jv": {
                "account": "jv",
                "ean": "4012345678901",
                "items": [
                    {
                        "ean": "4012345678901",
                        "title": "Desk JV",
                        "description": "<p>JV description</p>",
                        "images": ["https://img/1.jpg", "https://img/2.jpg"],
                    }
                ],
                "external_payload": {
                    "items": [
                        {
                            "title": "Desk JV",
                            "description": "<p>JV description</p>",
                            "price": "19.99",
                            "quantity": 3,
                            "categoryID": "100",
                            "condition": "new",
                            "itemMode": "buy_now",
                            "itemNumber": "JV-1",
                            "images": ["https://img/1.jpg", "https://img/2.jpg"],
                            "productProperties": [{"name": "Color", "value": "Oak"}],
                        }
                    ]
                },
            },
            "xl": {
                "code": "hood_external_error_status",
                "status_code": 404,
                "detail": "not found",
            },
        }
        self.patch_by_account = {
            "jv": {"status_code": 200, "body": {"external_success": True}},
            "xl": {"status_code": 404, "body": {"code": "hood_external_patch_failed"}},
        }
        self.jv_sites = {
            "site": "JV",
            "query_ean": "4012345678901",
            "found": [
                {"site_key": "JV_DE", "domain": "de.example", "product_id": 101, "ean": "4012345678901", "price": "29.99", "title": "Desk DE"},
                {"site_key": "JV_AT", "domain": "at.example", "product_id": 102, "ean": "4012345678901", "price": "29.99", "title": "Desk AT"},
                {"site_key": "JV_CO_UK", "domain": "uk.example", "product_id": 103, "ean": "4012345678901", "price": "29.99", "title": "Desk UK"},
            ],
            "missing": [{"site_key": "JV_CH", "domain": "ch.example", "reason": "not_found"}],
            "found_count": 3,
            "missing_count": 1,
        }
        self.jv_local = {
            "JV_DE": {"detail": "not found"},
            "JV_AT": {"ean": "4012345678901", "source_model": "JV-AT-BASE", "price": "31.99", "quantity": 4, "status": True, "image": "catalog/at.jpg", "image_public_url": "https://www.jvmoebel.at/catalog/at.jpg", "descriptions": [{"language_id": 1, "name": "AT Desk", "description": "<p>AT</p>", "tag": "", "meta_title": "", "meta_description": "", "meta_keyword": ""}], "categories": [{"category_id": 11, "main_category": True}], "images": [{"image": "catalog/at-1.jpg", "sort_order": 0}], "images_public_urls": [{"image": "catalog/at-1.jpg", "sort_order": 0, "public_url": "https://www.jvmoebel.at/catalog/at-1.jpg"}], "jv_fields": {"artikelnr": "JV-AT-BASE", "lieferzeitid": "7"}},
            "JV_CO_UK": {"ean": "4012345678901", "source_model": "JV-UK-BASE", "price": "32.99", "quantity": 2, "status": True, "image": "catalog/uk.jpg", "image_public_url": "https://www.jvfurniture.co.uk/catalog/uk.jpg", "descriptions": [{"language_id": 1, "name": "UK Desk", "description": "<p>UK</p>", "tag": "", "meta_title": "", "meta_description": "", "meta_keyword": ""}], "categories": [{"category_id": 21, "main_category": True}], "images": [{"image": "catalog/uk-1.jpg", "sort_order": 0}], "images_public_urls": [{"image": "catalog/uk-1.jpg", "sort_order": 0, "public_url": "https://www.jvfurniture.co.uk/catalog/uk-1.jpg"}], "jv_fields": {"artikelnr": "JV-UK-BASE", "lieferzeitid": "5"}},
            "JV_DE_synced": {"ean": "4012345678901", "source_model": "JV-DE-BASE", "price": "29.99", "quantity": 3, "status": True, "image": "catalog/de.jpg", "image_public_url": "https://www.jvmoebel.de/catalog/de.jpg", "descriptions": [{"language_id": 1, "name": "DE Desk", "description": "<p>DE</p>", "tag": "", "meta_title": "", "meta_description": "", "meta_keyword": ""}], "categories": [{"category_id": 10, "main_category": True}, {"category_id": 12, "main_category": False}], "images": [{"image": "catalog/de-1.jpg", "sort_order": 0}], "images_public_urls": [{"image": "catalog/de-1.jpg", "sort_order": 0, "public_url": "https://www.jvmoebel.de/catalog/de-1.jpg"}], "jv_fields": {"artikelnr": "JV-DE-BASE", "lieferzeitid": "11"}},
        }
        self.synced_site_keys: set[str] = set()
        self.jv_batch_result = {
            "summary": {"applied": 3, "failed": 0, "skipped": 0, "translation_used_sites": 1, "translation_error_sites": 0},
            "job": {
                "id": 501,
                "items": [
                    {"site": "JV", "site_key": "JV_DE", "domain": "de.example", "status": "applied"},
                    {"site": "JV", "site_key": "JV_AT", "domain": "at.example", "status": "applied"},
                    {"site": "JV", "site_key": "JV_CO_UK", "domain": "uk.example", "status": "applied"},
                ]
            },
        }
        self.xl_sites = {
            "site": "XL",
            "query_ean": "4012345678901",
            "found": [
                {"site_key": "XLMOEBEL_DE", "domain": "xlmoebel.de", "product_id": 201, "ean": "4012345678901", "price": "39.99", "currency_code": "EUR", "title": "Desk XL DE"},
            ],
            "missing": [{"site_key": "XLMOEBEL_CH", "domain": "xlmoebel.ch", "reason": "ean_not_found"}],
            "found_count": 1,
            "missing_count": 1,
        }
        self.xl_local = {
            "XLMOEBEL_DE": {"detail": "not found"},
            "XLMOEBEL_DE_synced": {
                "ean": "4012345678901",
                "source_model": "XL-DE-BASE",
                "source_sku": "XL-SKU-1",
                "source_ean_field": "4012345678901",
                "price": "39.99",
                "quantity": 5,
                "status": True,
                "image": "catalog/xl-de.jpg",
                "descriptions": [{"language_id": 1, "name": "XL DE Desk", "description": "<p>XL DE</p>", "tag": "", "meta_title": "", "meta_description": "", "meta_keyword": ""}],
                "categories": [{"category_id": 21, "main_category": True}],
                "stores": [{"store_id": 0}],
                "images": [{"image": "catalog/xl-de-1.jpg", "sort_order": 0}],
                "specials": [],
            },
        }
        self.xl_synced_site_keys: set[str] = set()
        self.xl_batch_result = {
            "summary": {"applied": 1, "failed": 0, "skipped": 0, "translation_used_sites": 0, "translation_error_sites": 0},
            "job": {
                "id": 601,
                "items": [
                    {"site": "XL", "site_key": "XLMOEBEL_DE", "domain": "xlmoebel.de", "status": "applied"},
                ],
            },
        }
        self.kaufland_by_controller = {
            "jv": {
                "response_data": {
                    "ean": ["4012345678901"], "title": ["Desk Kaufland JV"], "price": [19900],
                    "storefront": ["de"], "category": ["desks"], "picture": ["https://img/kaufland.jpg"],
                    "picture_urls": ["https://img/kaufland-secondary.jpg"], "size": ["large"],
                    "color": ["walnut"], "delivery": [7],
                }
            },
            "xl": {"detail": "not found"},
        }
        self.otto_by_profile = {
            "jv": {
                "product_variations": [{
                    "productReference": "4012345678901",
                    "sku": "4012345678901",
                    "ean": "4012345678901",
                    "productDescription": {"category": "Desk", "description": "Original"},
                    "pricing": {"standardPrice": {"amount": 19.99, "currency": "EUR"}},
                }],
            },
            "xl": {"detail": "not found"},
        }

    def fetch_hood_by_ean(self, *, ean: str, account: str, request_id: str):
        body = self.fetch_by_account[account]
        status_code = 200 if body.get("items") else body.get("status_code", 502)
        return type("R", (), {"status_code": status_code, "body": body})()

    def patch_hood_by_ean(self, *, ean: str, account: str, request_id: str, payload: dict):
        self.patch_calls.append({"ean": ean, "account": account, "payload": payload, "request_id": request_id})
        result = self.patch_by_account[account]
        return type("R", (), {"status_code": result["status_code"], "body": result["body"]})()

    def fetch_kaufland_by_ean(self, *, ean: str, controller: str, request_id: str):
        self.kaufland_fetch_calls.append(controller)
        body = self.kaufland_by_controller[controller]
        status_code = 200 if "ean" in body or "response_data" in body else 404
        return type("R", (), {"status_code": status_code, "body": body})()

    def change_kaufland_by_ean(self, *, ean: str, controller: str, request_id: str, payload: dict):
        self.kaufland_change_calls.append({"ean": ean, "controller": controller, "payload": payload})
        return type("R", (), {"status_code": 200, "body": {"updated": True}})()

    def create_kaufland_by_ean(self, *, ean: str, controller: str, request_id: str, payload: dict):
        self.kaufland_create_calls.append({"ean": ean, "controller": controller, "payload": payload})
        return type("R", (), {"status_code": 201, "body": {"created": True}})()

    def fetch_otto_by_sku(self, *, sku: str, profile: str, request_id: str):
        body = self.otto_by_profile[profile]
        return type("R", (), {"status_code": 200 if "product_variations" in body else 404, "body": body})()

    def fetch_jv_sites_by_ean(self, *, ean: str, request_id: str):
        self.jv_sites_calls += 1
        return type("R", (), {"status_code": 200, "body": self.jv_sites})()

    def fetch_jv_local_by_ean(self, *, ean: str, site_key: str, request_id: str):
        self.jv_local_calls.append(site_key)
        if site_key == "JV_DE" and site_key not in self.synced_site_keys:
            return type("R", (), {"status_code": 404, "body": self.jv_local["JV_DE"]})()
        key = f"{site_key}_synced" if site_key in self.synced_site_keys else site_key
        body = self.jv_local.get(key) or self.jv_local.get(site_key) or {"detail": "not found"}
        status_code = 200 if "ean" in body else 404
        return type("R", (), {"status_code": status_code, "body": body})()

    def sync_jv_by_ean(self, *, ean: str, site_key: str, request_id: str):
        self.synced_site_keys.add(site_key)
        body = self.jv_local[f"{site_key}_synced"] if f"{site_key}_synced" in self.jv_local else self.jv_local[site_key]
        return type("R", (), {"status_code": 200, "body": {"created": True, "updated": False, "item": body}})()

    def apply_jv_batch_by_ean(self, *, ean: str, request_id: str, payload: dict):
        self.jv_batch_calls.append({"ean": ean, "payload": payload, "request_id": request_id})
        return type("R", (), {"status_code": 202, "body": self.jv_batch_result})()

    def fetch_jv_batch_job_status(self, *, job_id: int, request_id: str):
        body = {
            "job": {
                "id": job_id,
                "status": "applied",
                "result_summary": {
                    "total": 3,
                    "applied": 3,
                    "failed": 0,
                    "skipped": 0,
                    "translation_used_sites": 1,
                    "translation_error_sites": 0,
                    "progress_phase": "completed",
                    "progress_message": "Batch apply completed.",
                },
                "items": self.jv_batch_result["job"]["items"],
            }
        }
        return type("R", (), {"status_code": 200, "body": body})()

    def fetch_xl_sites_by_ean(self, *, ean: str, request_id: str, site_key: str | None = None):
        self.xl_sites_calls += 1
        if site_key:
            body = {
                **self.xl_sites,
                "found": [row for row in self.xl_sites.get("found", []) if row.get("site_key") == site_key],
                "missing": [row for row in self.xl_sites.get("missing", []) if row.get("site_key") == site_key],
            }
            return type("R", (), {"status_code": 200, "body": body})()
        return type("R", (), {"status_code": 200, "body": self.xl_sites})()

    def fetch_xl_local_by_ean(self, *, ean: str, site_key: str, request_id: str):
        if site_key == "XLMOEBEL_DE" and site_key not in self.xl_synced_site_keys:
            return type("R", (), {"status_code": 404, "body": self.xl_local["XLMOEBEL_DE"]})()
        key = f"{site_key}_synced" if site_key in self.xl_synced_site_keys else site_key
        body = self.xl_local.get(key) or self.xl_local.get(site_key) or {"detail": "not found"}
        status_code = 200 if "ean" in body else 404
        return type("R", (), {"status_code": status_code, "body": body})()

    def sync_xl_by_ean(self, *, ean: str, site_key: str, request_id: str):
        self.xl_synced_site_keys.add(site_key)
        return type("R", (), {"status_code": 200, "body": {"created": True, "updated": False}})()

    def apply_xl_batch_by_ean(self, *, ean: str, request_id: str, payload: dict):
        self.xl_batch_calls.append({"ean": ean, "payload": payload, "request_id": request_id})
        return type("R", (), {"status_code": 202, "body": self.xl_batch_result})()


def _client(tmp_path) -> tuple[TestClient, FakeProductEditorGateway]:
    Deps.service = OrchestratorService(adapters=NoopAdapters())
    Deps.idempotency_store = SqliteIdempotencyStore(db_path=str(tmp_path / "idem.sqlite3"), ttl_seconds=60)
    Deps.job_store = SqliteJobStore(db_path=str(tmp_path / "jobs.sqlite3"))
    fake_gateway = FakeProductEditorGateway()
    ProductEditorDeps.service = ProductEditorService(
        gateway=fake_gateway,
        store=SqliteProductEditorStore(db_path=str(tmp_path / "product_editor.sqlite3")),
        orchestrator_job_store=Deps.job_store,
    )
    return TestClient(app), fake_gateway


def test_product_editor_discover_returns_hood_found_and_excludes_jv_main(tmp_path):
    client, _ = _client(tmp_path)
    response = client.post("/api/v1/orchestrator/product-editor/discover", json={"ean": "4012345678901"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_group_id"] == "HOOD"
    assert payload["selected_target_ids"] == ["HOOD_JV"]
    hood_group = next(group for group in payload["groups"] if group["id"] == "HOOD")
    jv_group = next(group for group in payload["groups"] if group["id"] == "JV")
    targets = {target["id"]: target for target in hood_group["targets"]}
    jv_targets = {target["id"]: target for target in jv_group["targets"]}
    assert targets["HOOD_JV"]["status"] == "found"
    assert targets["HOOD_XL"]["status"] == "missing"
    assert jv_targets["JV_DE"]["status"] == "found"
    assert jv_targets["JV_CH"]["status"] == "missing"
    all_target_ids = [target["id"] for group in payload["groups"] for target in group["targets"]]
    assert "JV_MAIN" not in all_target_ids


def test_product_editor_discover_respects_active_group_jv(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post("/api/v1/orchestrator/product-editor/discover", json={"ean": "4012345678901", "active_group": "JV"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_group_id"] == "JV"
    assert payload["selected_target_ids"] == ["JV_DE", "JV_AT", "JV_CO_UK"]
    hood_group = next(group for group in payload["groups"] if group["id"] == "HOOD")
    assert all(target["status"] == "unknown" for target in hood_group["targets"])
    assert gateway.jv_sites_calls == 1


def test_product_editor_load_returns_normalized_hood_draft(tmp_path):
    client, _ = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "HOOD", "baseline_target_id": "HOOD_JV"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["supported"] is True
    assert payload["baseline_target_id"] == "HOOD_JV"
    assert payload["draft"]["item_id"] == "129683015" or payload["draft"]["item_id"] == ""
    assert payload["draft"]["title"] == "Desk JV"
    assert payload["draft"]["price"] == "19.99"
    assert payload["draft"]["images"] == ["https://img/1.jpg", "https://img/2.jpg"]


def test_product_editor_discover_respects_active_group_xl(tmp_path):
    client, _ = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/discover",
        json={"ean": "4012345678901", "active_group": "XL"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_group_id"] == "XL"
    assert payload["selected_target_ids"] == ["XLMOEBEL_DE"]
    assert [group["id"] for group in payload["groups"]] == ["XL"]
    xl_group = next(group for group in payload["groups"] if group["id"] == "XL")
    assert [target["id"] for target in xl_group["targets"]] == ["XLMOEBEL_DE"]
    targets = {target["id"]: target for target in xl_group["targets"]}
    assert targets["XLMOEBEL_DE"]["status"] == "found"


def test_product_editor_discover_respects_active_group_kaufland(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/discover",
        json={"ean": "4012345678901", "active_group": "KAUFLAND"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["selected_group_id"] == "KAUFLAND"
    assert payload["selected_target_ids"] == ["KAUFLAND_JV"]
    assert [group["id"] for group in payload["groups"]] == ["KAUFLAND"]
    targets = {target["id"]: target for target in payload["groups"][0]["targets"]}
    assert targets["KAUFLAND_JV"]["status"] == "found"
    assert targets["KAUFLAND_XL"]["status"] == "missing"
    assert gateway.kaufland_fetch_calls == ["jv", "xl"]


def test_product_editor_otto_load_and_plan_creates_orchestrator_job(tmp_path):
    client, _ = _client(tmp_path)
    discover = client.post(
        "/api/v1/orchestrator/product-editor/discover",
        json={"ean": "4012345678901", "active_group": "OTTO"},
    )
    assert discover.status_code == 200
    assert discover.json()["selected_target_ids"] == ["OTTO_JV"]

    loaded = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "OTTO", "baseline_target_id": "OTTO_JV"},
    )
    assert loaded.status_code == 200
    draft = loaded.json()["draft"]
    assert draft["productReference"] == "4012345678901"

    planned = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "OTTO",
            "changed_fields": ["productDescription"],
            "draft": {**draft, "productDescription": {"category": "Desk", "description": "Updated"}},
            "selected_target_ids": ["OTTO_JV"],
        },
    )
    assert planned.status_code == 200
    applied = client.post("/api/v1/orchestrator/product-editor/apply", json={"plan_id": planned.json()["plan_id"], "confirmation": True})
    assert applied.status_code == 200
    assert applied.json()["status"] == "queued"


def test_product_editor_otto_apply_merges_price_change_with_current_target_payload(tmp_path):
    client, gateway = _client(tmp_path)
    gateway.otto_by_profile["jv"]["product_variations"][0].update(
        {
            "mediaAssets": [{"type": "IMAGE", "location": "https://img/original.jpg"}],
            "delivery": {"type": "PARCEL", "deliveryTime": 7},
            "order": {"maxOrderQuantity": 2},
        }
    )

    loaded = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "OTTO", "baseline_target_id": "OTTO_JV"},
    )
    draft = loaded.json()["draft"]
    draft["pricing"] = {"standardPrice": {"amount": 99.99, "currency": "EUR"}}
    planned = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "OTTO",
            "changed_fields": ["pricing"],
            "draft": draft,
            "selected_target_ids": ["OTTO_JV"],
        },
    )

    applied = client.post("/api/v1/orchestrator/product-editor/apply", json={"plan_id": planned.json()["plan_id"], "confirmation": True})
    command = Deps.job_store.get_job_command(job_id=applied.json()["job_id"])

    assert command is not None
    override = command.channels[0].overrides
    assert override["pricing"]["standardPrice"]["amount"] == 99.99
    assert override["productDescription"] == {"category": "Desk", "description": "Original"}
    assert override["mediaAssets"] == [{"type": "IMAGE", "location": "https://img/original.jpg"}]
    assert override["delivery"] == {"type": "PARCEL", "deliveryTime": 7}


def test_product_editor_otto_apply_normalizes_source_payload_for_upsert(tmp_path):
    client, gateway = _client(tmp_path)
    gateway.otto_by_profile["jv"]["product_variations"][0].update(
        {
            "imageUrl": "https://i.otto.de/i/otto/main-image.jpg",
            "mediaAssets": [
                {"type": "IMAGE", "filename": "main-image.jpg"},
                {"type": "IMAGE", "filename": "secondary-image.jpg"},
            ],
            "order": {"maxOrderQuantity": {}},
            "productDescription": {
                "category": "Desk",
                "productLine": "x" * 60,
                "description": "Original",
            },
        }
    )

    loaded = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "OTTO", "baseline_target_id": "OTTO_JV"},
    )
    draft = loaded.json()["draft"]
    draft["pricing"] = {"standardPrice": {"amount": 99.99, "currency": "EUR"}}
    planned = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "OTTO",
            "changed_fields": ["pricing"],
            "draft": draft,
            "selected_target_ids": ["OTTO_JV"],
        },
    )

    applied = client.post("/api/v1/orchestrator/product-editor/apply", json={"plan_id": planned.json()["plan_id"], "confirmation": True})
    command = Deps.job_store.get_job_command(job_id=applied.json()["job_id"])

    assert command is not None
    override = command.channels[0].overrides
    assert "maxOrderQuantity" not in override
    assert override["productDescription"]["productLine"] == "x" * 50
    assert override["mediaAssets"] == [{
        "type": "IMAGE",
        "location": "https://i.otto.de/i/otto/main-image.jpg",
        "filename": "main-image.jpg",
    }]


def test_product_editor_load_returns_normalized_xl_draft(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "XL", "baseline_target_id": "XLMOEBEL_DE"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["supported"] is True
    assert payload["baseline_target_id"] == "XLMOEBEL_DE"
    assert payload["draft"]["source_model"] == "XL-DE-BASE"
    assert payload["draft"]["price"] == "39.99"
    assert "XLMOEBEL_DE" in gateway.xl_synced_site_keys


def test_product_editor_kaufland_load_plan_and_apply_updates_found_and_creates_missing(tmp_path):
    client, gateway = _client(tmp_path)
    load_response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "KAUFLAND", "baseline_target_id": "KAUFLAND_JV"},
    )
    assert load_response.status_code == 200
    draft = load_response.json()["draft"]
    assert draft["title"] == "Desk Kaufland JV"
    assert draft["price"] == "19900"
    assert draft["picture_urls"] == ["https://img/kaufland-secondary.jpg"]
    assert draft["size"] == "large"
    assert draft["color"] == "walnut"
    assert draft["delivery"] == "7"

    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901", "active_group": "KAUFLAND", "changed_fields": ["title"],
            "draft": {**draft, "title": "Updated desk"},
            "selected_target_ids": ["KAUFLAND_JV", "KAUFLAND_XL"],
        },
    )
    assert plan_response.status_code == 200
    assert plan_response.json()["summary"]["operations"] == {"KAUFLAND_JV": "update", "KAUFLAND_XL": "create"}

    apply_response = client.post("/api/v1/orchestrator/product-editor/apply", json={"plan_id": plan_response.json()["plan_id"], "confirmation": True})
    assert apply_response.status_code == 200
    assert apply_response.json()["status"] == "completed"
    assert gateway.kaufland_change_calls[0]["controller"] == "jv"
    assert gateway.kaufland_change_calls[0]["payload"]["changed_fields"] == ["title"]
    assert gateway.kaufland_create_calls[0]["controller"] == "xl"


def test_product_editor_kaufland_update_omits_blank_unit_id(tmp_path):
    client, gateway = _client(tmp_path)
    load_response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "KAUFLAND", "baseline_target_id": "KAUFLAND_JV"},
    )
    draft = load_response.json()["draft"]
    assert draft["unit_id"] == ""

    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "KAUFLAND",
            "changed_fields": ["title"],
            "draft": {**draft, "title": "Updated desk"},
            "selected_target_ids": ["KAUFLAND_JV"],
        },
    )
    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_response.json()["plan_id"], "confirmation": True},
    )

    assert apply_response.status_code == 200
    assert "unit_id" not in gateway.kaufland_change_calls[0]["payload"]


def test_product_editor_kaufland_update_converts_unit_id_to_integer(tmp_path):
    client, gateway = _client(tmp_path)
    load_response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "KAUFLAND", "baseline_target_id": "KAUFLAND_JV"},
    )
    draft = load_response.json()["draft"]

    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "KAUFLAND",
            "changed_fields": ["unit_id"],
            "draft": {**draft, "unit_id": "17"},
            "selected_target_ids": ["KAUFLAND_JV"],
        },
    )
    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_response.json()["plan_id"], "confirmation": True},
    )

    assert apply_response.status_code == 200
    assert gateway.kaufland_change_calls[0]["payload"]["unit_id"] == 17


def test_product_editor_kaufland_update_converts_delivery_to_integer(tmp_path):
    client, gateway = _client(tmp_path)
    load_response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "KAUFLAND", "baseline_target_id": "KAUFLAND_JV"},
    )
    draft = load_response.json()["draft"]

    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "KAUFLAND",
            "changed_fields": ["delivery"],
            "draft": {**draft, "delivery": "14"},
            "selected_target_ids": ["KAUFLAND_JV"],
        },
    )
    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_response.json()["plan_id"], "confirmation": True},
    )

    assert apply_response.status_code == 200
    assert gateway.kaufland_change_calls[0]["payload"]["delivery"] == 14


def test_product_editor_load_returns_normalized_jv_draft_and_syncs_missing_local(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/load",
        json={"ean": "4012345678901", "active_group": "JV", "baseline_target_id": "JV_DE"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["supported"] is True
    assert payload["baseline_target_id"] == "JV_DE"
    assert payload["draft"]["source_model"] == "JV-DE-BASE"
    assert payload["draft"]["price"] == "29.99"
    assert payload["draft"]["image_public_url"] == "https://www.jvmoebel.de/catalog/de.jpg"
    assert payload["draft"]["images"][0]["public_url"] == "https://www.jvmoebel.de/catalog/de-1.jpg"
    assert payload["draft"]["categories_by_site_key"] == {
        "JV_DE": [{"category_id": 10, "main_category": True}, {"category_id": 12, "main_category": False}],
        "JV_AT": [{"category_id": 11, "main_category": True}],
        "JV_CO_UK": [{"category_id": 21, "main_category": True}],
    }
    assert payload["draft"]["jv_fields_by_site_key"]["JV_DE"]["lieferzeitid"] == "11"
    assert payload["draft"]["jv_fields_by_site_key"]["JV_AT"]["lieferzeitid"] == "7"
    assert payload["draft"]["jv_fields_by_site_key"]["JV_CO_UK"]["lieferzeitid"] == "5"
    assert "JV_DE" in gateway.synced_site_keys
    assert gateway.jv_sites_calls == 1
    assert gateway.jv_local_calls == []


def test_product_editor_plan_returns_found_hood_target_and_warnings(tmp_path):
    client, _ = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "HOOD",
            "changed_fields": ["price", "images"],
            "draft": {"price": "10.00", "images": ["https://img/1.jpg"]},
            "selected_target_ids": ["HOOD_JV", "HOOD_XL"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["targets"][0]["id"] == "HOOD_JV"
    assert payload["summary"]["supported"] is True
    warning_codes = [warning["code"] for warning in payload["warnings"]]
    assert "product_editor_live_marketplace_patch" in warning_codes
    assert "product_editor_images_removed_keep_ftp" in warning_codes


def test_product_editor_plan_returns_all_found_jv_targets_and_translation_warning(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["price", "descriptions"],
            "draft": {
                "target_id": "JV_DE",
                "price": "10.00",
                "descriptions": [{"language_id": 1, "name": "Desk", "description": "<p>Desk</p>"}],
            },
            "selected_target_ids": ["JV_DE", "JV_AT", "JV_CO_UK"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert [target["id"] for target in payload["targets"]] == ["JV_DE", "JV_AT", "JV_CO_UK"]
    warning_codes = [warning["code"] for warning in payload["warnings"]]
    assert "product_editor_live_source_batch_apply" in warning_codes
    assert "product_editor_translation_required" in warning_codes
    assert payload["summary"]["baseline_site_key"] == "JV_DE"
    assert gateway.jv_sites_calls == 0


def test_product_editor_plan_returns_xl_de_target(tmp_path):
    client, gateway = _client(tmp_path)
    response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "XL",
            "changed_fields": ["price", "descriptions"],
            "draft": {
                "target_id": "XLMOEBEL_DE",
                "price": "10.00",
                "descriptions": [{"language_id": 1, "name": "Desk", "description": "<p>Desk</p>"}],
            },
            "selected_target_ids": ["XLMOEBEL_DE", "XLMOEBEL_CH"],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert [target["id"] for target in payload["targets"]] == ["XLMOEBEL_DE"]
    warning_codes = [warning["code"] for warning in payload["warnings"]]
    assert "product_editor_live_source_batch_apply" in warning_codes
    assert "product_editor_xl_de_only" in warning_codes
    assert payload["summary"]["baseline_site_key"] == "XLMOEBEL_DE"
    assert gateway.xl_sites_calls == 0


def test_product_editor_apply_requires_existing_plan(tmp_path):
    client, _ = _client(tmp_path)
    response = client.post("/api/v1/orchestrator/product-editor/apply", json={"plan_id": "missing", "confirmation": True})
    assert response.status_code == 404
    payload = response.json()
    assert payload["code"] == "product_editor_plan_not_found"


def test_product_editor_apply_executes_hood_patch_and_keeps_ftp_untouched(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "HOOD",
            "changed_fields": ["images"],
            "draft": {"images": ["https://img/1.jpg"]},
            "selected_target_ids": ["HOOD_JV"],
        },
    )
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    assert apply_payload["status"] == "completed"
    assert gateway.patch_calls[0]["account"] == "jv"
    assert gateway.patch_calls[0]["payload"] == {
        "title": "Desk JV",
        "description": "<p>JV description</p>",
        "price": "19.99",
        "quantity": 3,
        "categoryID": "100",
        "condition": "new",
        "itemMode": "buy_now",
        "itemNumber": "JV-1",
        "images": ["https://img/1.jpg"],
        "productProperties": [{"name": "Color", "value": "Oak"}],
    }

    job_response = client.get(f"/api/v1/orchestrator/product-editor/jobs/{apply_payload['job_id']}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["summary"]["success"] == 1
    assert job_payload["targets"][0]["status"] == "success"


def test_product_editor_apply_executes_jv_batch_apply_via_orchestrator(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["price", "descriptions"],
            "draft": {
                "target_id": "JV_DE",
                "price": "10.00",
                "descriptions": [{
                    "language_id": 1,
                    "name": "Desk",
                    "description": "<p>Desk</p>",
                    "meta_title": "Desk buy",
                    "meta_description": "Desk desc",
                    "meta_keyword": "desk, office",
                    "tag": "4012345678901",
                }],
                "jv_fields": {
                    "content_by_language": [
                        {
                            "language_code": "de",
                            "name": "Ecksofa PH-028",
                            "description": "Полное описание товара...",
                            "meta_title": "Ecksofa PH-028 kaufen",
                            "meta_description": "Качественный угловой диван",
                            "meta_keyword": "ecksofa, wohnlandschaft",
                            "kurzbeschreibung": "Kurzbeschreibung...",
                        }
                    ]
                },
            },
            "selected_target_ids": ["JV_DE", "JV_AT", "JV_CO_UK"],
        },
    )
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    assert apply_payload["status"] == "queued"
    command = Deps.job_store.get_job_command(job_id=apply_payload["job_id"])
    assert command is not None
    overrides = command.channels[0].overrides
    assert overrides["site_keys"] == ["JV_DE", "JV_AT", "JV_CO_UK"]
    assert overrides["template_site_key"] == "JV_DE"
    assert overrides["translate_texts"] is True
    assert overrides["translation_source_language"] == "de"
    assert overrides["translation_source"] == {
        "name": "Ecksofa PH-028",
        "description": "Полное описание товара...",
        "meta_title": "Ecksofa PH-028 kaufen",
        "meta_description": "Качественный угловой диван",
        "meta_keyword": "ecksofa, wohnlandschaft",
        "tag": "4012345678901",
        "BESCHREIBUNG": "Полное описание товара...",
        "KURZBESCHREIBUNG": "Kurzbeschreibung...",
    }

    job_response = client.get(f"/api/v1/orchestrator/product-editor/jobs/{apply_payload['job_id']}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["status"] == "queued"


def test_product_editor_apply_executes_xl_batch_apply_via_orchestrator(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "XL",
            "changed_fields": ["price"],
            "draft": {
                "target_id": "XLMOEBEL_DE",
                "price": "10.00",
            },
            "selected_target_ids": ["XLMOEBEL_DE"],
        },
    )
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    assert apply_payload["status"] == "queued"
    command = Deps.job_store.get_job_command(job_id=apply_payload["job_id"])
    assert command is not None
    overrides = command.channels[0].overrides
    assert overrides["site_keys"] == ["XLMOEBEL_DE"]
    assert overrides["template_site_key"] == "XLMOEBEL_DE"
    assert command.channels[0].site == "XL"

    assert Deps.job_store.mark_running(job_id=apply_payload["job_id"]) is True
    Deps.job_store.mark_completed(
        job_id=apply_payload["job_id"],
        result=OrchestrateResponse(
            request_id="req-xl-completed",
            status=FinalStatus.SUCCESS,
            results=[
                ChannelResult(
                    marketplace=command.channels[0].marketplace,
                    target="xljv,site=XL,site_key=XLMOEBEL_DE",
                    status="success",
                    status_code=202,
                    data=gateway.xl_batch_result,
                )
            ],
        ),
    )

    job_response = client.get(f"/api/v1/orchestrator/product-editor/jobs/{apply_payload['job_id']}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["status"] == JobStatus.COMPLETED.value
    assert job_payload["summary"]["applied"] == 1
    assert job_payload["targets"][0]["target_id"] == "XLMOEBEL_DE"


def test_product_editor_job_prefers_terminal_orchestrator_status_over_stale_live_batch(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["price", "descriptions"],
            "draft": {
                "target_id": "JV_DE",
                "price": "10.00",
                "descriptions": [{"language_id": 1, "name": "Desk", "description": "<p>Desk</p>"}],
            },
            "selected_target_ids": ["JV_DE", "JV_AT", "JV_CO_UK"],
        },
    )
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    job_id = apply_response.json()["job_id"]

    command = Deps.job_store.get_job_command(job_id=job_id)
    assert command is not None
    assert Deps.job_store.mark_running(job_id=job_id) is True
    Deps.job_store.mark_completed(
        job_id=job_id,
        result=OrchestrateResponse(
            request_id="req-completed",
            status=FinalStatus.SUCCESS,
            results=[
                ChannelResult(
                    marketplace=command.channels[0].marketplace,
                    target="xljv,site=JV,site_key=JV_DE",
                    status="success",
                    status_code=202,
                    data=gateway.jv_batch_result,
                )
            ],
        ),
    )

    def stale_pending_batch(*, job_id: int, request_id: str):
        body = {
            "job": {
                "id": job_id,
                "status": "pending",
                "result_summary": {
                    "total": 4,
                    "applied": 0,
                    "failed": 0,
                    "skipped": 0,
                    "translation_used_sites": 0,
                    "translation_error_sites": 0,
                    "progress_phase": "queued",
                    "progress_message": "Batch job queued.",
                },
                "items": [],
            }
        }
        return type("R", (), {"status_code": 200, "body": body})()

    gateway.fetch_jv_batch_job_status = stale_pending_batch

    job_response = client.get(f"/api/v1/orchestrator/product-editor/jobs/{job_id}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["status"] == JobStatus.COMPLETED.value
    assert job_payload["summary"]["applied"] == 3


def test_product_editor_job_refreshes_completed_jv_job_when_stored_batch_snapshot_is_pending(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["price"],
            "draft": {
                "target_id": "JV_DE",
                "price": "10.00",
            },
            "selected_target_ids": ["JV_DE", "JV_CH", "JV_AT", "JV_CO_UK"],
        },
    )
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    job_id = apply_response.json()["job_id"]

    command = Deps.job_store.get_job_command(job_id=job_id)
    assert command is not None
    assert Deps.job_store.mark_running(job_id=job_id) is True
    Deps.job_store.mark_completed(
        job_id=job_id,
        result=OrchestrateResponse(
            request_id="req-accepted",
            status=FinalStatus.SUCCESS,
            results=[
                ChannelResult(
                    marketplace=command.channels[0].marketplace,
                    target="xljv,site=JV,site_key=JV_DE",
                    status="success",
                    status_code=202,
                    data={
                        "status": "accepted",
                        "job": {
                            "id": 777,
                            "status": "pending",
                            "items": [
                                {"site": "JV", "site_key": "JV_DE", "domain": "de.example", "status": "pending"},
                                {"site": "JV", "site_key": "JV_CH", "domain": "ch.example", "status": "failed"},
                                {"site": "JV", "site_key": "JV_AT", "domain": "at.example", "status": "pending"},
                                {"site": "JV", "site_key": "JV_CO_UK", "domain": "uk.example", "status": "pending"},
                            ],
                        },
                    },
                )
            ],
        ),
    )

    def final_live_batch(*, job_id: int, request_id: str):
        body = {
            "job": {
                "id": job_id,
                "status": "failed",
                "result_summary": {
                    "total": 4,
                    "applied": 0,
                    "failed": 1,
                    "skipped": 3,
                    "translation_used_sites": 0,
                    "translation_error_sites": 0,
                    "progress_phase": "completed",
                    "progress_message": "Batch apply completed with partial failures.",
                },
                "items": [
                    {"site": "JV", "site_key": "JV_DE", "domain": "de.example", "status": "skipped"},
                    {"site": "JV", "site_key": "JV_CH", "domain": "ch.example", "status": "failed", "error_code": "jv_batch_plan_item_failed", "error_text": "currency conversion failed"},
                    {"site": "JV", "site_key": "JV_AT", "domain": "at.example", "status": "skipped"},
                    {"site": "JV", "site_key": "JV_CO_UK", "domain": "uk.example", "status": "skipped"},
                ],
            }
        }
        return type("R", (), {"status_code": 200, "body": body})()

    gateway.fetch_jv_batch_job_status = final_live_batch

    job_response = client.get(f"/api/v1/orchestrator/product-editor/jobs/{job_id}")
    assert job_response.status_code == 200
    job_payload = job_response.json()
    assert job_payload["status"] == JobStatus.FAILED.value
    assert job_payload["summary"]["failed"] == 1
    assert job_payload["summary"]["skipped"] == 3
    assert [target["target_id"] for target in job_payload["targets"]] == ["JV_DE", "JV_CH", "JV_AT", "JV_CO_UK"]
    assert job_payload["targets"][1]["status"] == "failed"
    assert job_payload["targets"][1]["error"]["code"] == "jv_batch_plan_item_failed"


def test_product_editor_apply_sends_updated_jv_main_category(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["categories"],
            "draft": {
                "target_id": "JV_DE",
                "categories": [
                    {"category_id": 10, "main_category": False},
                    {"category_id": 11, "main_category": True},
                    {"category_id": 12, "main_category": False},
                ],
            },
            "selected_target_ids": ["JV_DE", "JV_AT"],
        },
    )
    assert plan_response.status_code == 200
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    command = Deps.job_store.get_job_command(job_id=apply_payload["job_id"])
    assert command is not None
    payload = command.channels[0].overrides
    assert payload["template_main_category_id"] == 11
    assert payload["categories"] == [
        {"category_id": 10, "main_category": False},
        {"category_id": 11, "main_category": True},
        {"category_id": 12, "main_category": False},
    ]


def test_product_editor_apply_sends_site_specific_jv_batch_overrides(tmp_path):
    client, gateway = _client(tmp_path)
    plan_response = client.post(
        "/api/v1/orchestrator/product-editor/plan",
        json={
            "ean": "4012345678901",
            "active_group": "JV",
            "changed_fields": ["categories", "jv_fields"],
            "draft": {
                "target_id": "JV_DE",
                "categories": [
                    {"category_id": 10, "main_category": True},
                ],
                "categories_by_site_key": {
                    "JV_DE": [{"category_id": 10, "main_category": True}],
                    "JV_AT": [{"category_id": 20, "main_category": True}],
                },
                "jv_fields": {
                    "lieferzeitid": "11",
                    "content_by_language": [{"language_code": "de", "name": "Desk"}],
                },
                "jv_fields_by_site_key": {
                    "JV_DE": {"lieferzeitid": "11"},
                    "JV_AT": {"lieferzeitid": "7"},
                },
            },
            "selected_target_ids": ["JV_DE", "JV_AT"],
        },
    )
    assert plan_response.status_code == 200
    plan_id = plan_response.json()["plan_id"]

    apply_response = client.post(
        "/api/v1/orchestrator/product-editor/apply",
        json={"plan_id": plan_id, "confirmation": True},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    command = Deps.job_store.get_job_command(job_id=apply_payload["job_id"])
    assert command is not None
    payload = command.channels[0].overrides
    assert payload["categories_by_site_key"] == {
        "JV_DE": [{"category_id": 10, "main_category": True}],
        "JV_AT": [{"category_id": 20, "main_category": True}],
    }
    assert payload["jv_fields_by_site_key"]["JV_DE"]["lieferzeitid"] == "11"
    assert payload["jv_fields_by_site_key"]["JV_AT"]["lieferzeitid"] == "7"
    assert payload["jv_fields_by_site_key"]["JV_AT"]["content_by_language"] == [{"language_code": "de", "name": "Desk"}]


def test_product_editor_job_status_endpoint_returns_not_found(tmp_path):
    client, _ = _client(tmp_path)
    response = client.get("/api/v1/orchestrator/product-editor/jobs/job-123")
    assert response.status_code == 404
    payload = response.json()
    assert payload["code"] == "product_editor_job_not_found"

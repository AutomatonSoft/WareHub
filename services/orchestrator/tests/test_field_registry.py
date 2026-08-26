from src.sofort_orchestrator.domain.field_registry import filtered_payload, validate_changed_fields
from src.sofort_orchestrator.domain.models import Marketplace


def test_otto_shipping_profile_id_and_quantity_are_allowed_and_retained():
    payload = {
        "productReference": "4021234231234",
        "quantity": 1,
        "shippingProfileId": "786c6468-3baf-52e0-88b5-13757eb7f873",
        "unknown": "discarded",
    }

    assert validate_changed_fields(Marketplace.OTTO, ["shippingProfileId", "quantity"]) == []
    assert filtered_payload(Marketplace.OTTO, payload) == {
        "productReference": "4021234231234",
        "quantity": 1,
        "shippingProfileId": "786c6468-3baf-52e0-88b5-13757eb7f873",
    }

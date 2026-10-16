from typing import Any


FIXED_VAT_PERCENTAGE = 19.0


def with_fixed_vat(offer: dict[str, Any]) -> dict[str, Any]:
    tax = offer.get("tax")
    return {
        **offer,
        "tax": {
            **(tax if isinstance(tax, dict) else {}),
            "vatPercentage": FIXED_VAT_PERCENTAGE,
        },
    }

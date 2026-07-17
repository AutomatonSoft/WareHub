from decimal import Decimal, InvalidOperation


def parse_order_amount(value: object) -> Decimal | None:
    """Convert Afterbuy monetary strings to a decimal amount."""
    raw = str(value or "").strip().upper().replace("EUR", "")
    if not raw:
        return None

    raw = raw.replace("\xa0", " ").replace(" ", "")
    raw = "".join(char for char in raw if char.isdigit() or char in {".", ",", "-"})
    if not raw:
        return None

    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")

    try:
        return Decimal(raw)
    except InvalidOperation:
        return None

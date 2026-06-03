from decimal import Decimal, InvalidOperation

from .service import parse_afterbuy_datetime


def to_decimal_amount(value: str) -> Decimal | None:
    raw = (value or "").strip().upper().replace("EUR", "")
    if not raw:
        return None
    raw = raw.replace("\xa0", " ").replace(" ", "")
    raw = "".join(ch for ch in raw if ch.isdigit() or ch in {".", ",", "-"})
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


def status_by_amounts(zahlungssumme: str, rechnungssumme: str) -> str:
    zahlung = to_decimal_amount(zahlungssumme)
    rechnung = to_decimal_amount(rechnungssumme)
    if zahlung is not None and rechnung is not None and zahlung == rechnung:
        return "paid"
    return "no_paid"


def parse_order_date(raw_date: str):
    return parse_afterbuy_datetime(raw_date)


def normalize_kid_account(value: str) -> str | None:
    account = (value or "").strip().upper()
    if account in {"JV", "XL", "CH"}:
        return account
    return None

import requests
import json
from decimal import Decimal

BASE_URL = "https://kl.automatonsoft.de"


def _json_safe(value):
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_json_safe(v) for v in value]
    if isinstance(value, tuple):
        return [_json_safe(v) for v in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def get_by_ean(ean: str, site: str) -> dict:
    url = f"{BASE_URL}/api/products/product/ean/"
    response = requests.get(
        url,
        params={"ean": ean, "controller": site},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()
    # result = json.dumps(data, indent=4, ensure_ascii=True)
    # return result

def product_inside(ean: str, site: str) -> dict:
    raw = get_by_ean(ean, site)

    if isinstance(raw, dict):
        return raw

    if isinstance(raw, list) and raw:
        first = raw[0]
        if isinstance(first, dict):
            return first

    return {"ean": ean, "site": site, "raw": raw}


def change_product_by_ean(payload: dict) -> dict:
    url = f"{BASE_URL}/api/products/ean/change/"
    response = requests.patch(
        url,
        json=payload,
        timeout=45,
    )
    if response.status_code == 405:
        # Compatibility fallback for environments where PATCH is blocked.
        response = requests.put(
            url,
            json=payload,
            timeout=45,
        )
    response.raise_for_status()
    return response.json()


def delete_product_by_ean(*, ean: str, controller: str) -> dict:
    url = f"{BASE_URL}/api/products/delete/{ean}"
    response = requests.delete(
        url,
        json={"controller": controller},
        timeout=45,
    )
    if response.status_code == 405:
        # Compatibility fallback when DELETE is blocked by upstream.
        response = requests.post(
            url,
            json={"controller": controller},
            timeout=45,
        )
    response.raise_for_status()
    try:
        return response.json()
    except Exception:
        return {"status": "ok", "detail": response.text}
    
def create_product_by_ean(payload: dict) -> dict:
    url = f"{BASE_URL}/api/products/upload/"
    payload = _json_safe(payload)
    # Validate JSON-serializability before sending upstream.
    json.dumps(payload, ensure_ascii=False)
    response = requests.put(
        url,
        json=payload,
        timeout=45
    )
    if response.status_code == 405:
        response = requests.put(
            url,
            json=payload,
            timeout=45
        )
    response.raise_for_status()
    return response.json()
# from PIL import Image

# def resize(file):
#     img = Image.open(file)

#     img.save(
#         file,
#         format='JPEG',
#         quality=90,
#         optimize=True,
#         progressive=True)

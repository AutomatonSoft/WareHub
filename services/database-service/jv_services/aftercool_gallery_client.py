import json
import time
from concurrent.futures import ThreadPoolExecutor
from collections import deque

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .gallery_mapping import GalleryProduct


class AftercoolReadError(ValueError):
    pass


class AftercoolGalleryClient:
    base_url = "https://aftercool.de"

    def __init__(self, username: str, password: str, dataset: str = "lister"):
        self.dataset = dataset
        self.session = self._new_session()
        try:
            response = self.session.post(f"{self.base_url}/auth/login",
                                         json={"username": username, "password": password},
                                         timeout=(5, 30), allow_redirects=False)
            if response.status_code != 200:
                raise AftercoolReadError(f"Aftercool login failed: HTTP {response.status_code}.")
        except requests.RequestException as exc:
            self.close()
            raise AftercoolReadError(f"Aftercool login network failure ({type(exc).__name__}).") from None
        except Exception:
            self.close()
            raise

    def close(self):
        self.session.close()

    @staticmethod
    def _new_session():
        session = requests.Session()
        session.mount("https://", HTTPAdapter(max_retries=Retry(
            total=2, backoff_factor=1, allowed_methods={"GET"},
            status_forcelist=[429, 502, 503, 504], respect_retry_after_header=False,
        )))
        return session

    def _fork_reader(self):
        reader = object.__new__(type(self))
        reader.dataset = self.dataset
        reader.session = self._new_session()
        reader.session.cookies.update(self.session.cookies)
        return reader

    def _page(self, path: str, account: str, offset: int, **params):
        try:
            response = self.session.get(f"{self.base_url}{path}", params={
                "account": account, "dataset": self.dataset, "offset": offset,
                "limit": 1, "include_row": 1, **params,
            }, timeout=(5, 30), allow_redirects=False)
        except requests.RequestException as exc:
            raise AftercoolReadError(f"Aftercool read network failure ({type(exc).__name__}).") from None
        if response.status_code != 200:
            raise AftercoolReadError(f"Aftercool read failed: HTTP {response.status_code}.")
        try:
            payload = response.json()
        except ValueError:
            raise AftercoolReadError("Aftercool returned invalid JSON.") from None
        if (not isinstance(payload, dict) or not isinstance(payload.get("items"), list)
                or type(payload.get("has_more")) is not bool
                or type(payload.get("total")) is not int or payload["total"] < 0
                or payload.get("offset") != offset):
            raise AftercoolReadError("Unexpected Aftercool page schema.")
        if not payload["items"] and (payload["has_more"] or offset < payload["total"]):
            raise AftercoolReadError("Aftercool returned an incomplete page.")
        products = []
        for item in payload["items"]:
            if (not isinstance(item, dict) or item.get("account") != account.upper()
                    or item.get("dataset") != self.dataset or not isinstance(item.get("row"), dict)
                    or not item.get("product_id")):
                raise AftercoolReadError("Unexpected Aftercool product schema.")
            identity = json.dumps([item.get("factory_id"), item["product_id"], item.get("source_file"), item.get("row_no")])
            products.append(GalleryProduct(identity, account, item.get("ean"), item["row"].get("GalleryURL")))
        return products, payload["has_more"]

    def get_product(self, offset: int):
        products, _ = self._page("/api/products", "jv", offset)
        if len(products) > 1:
            raise AftercoolReadError("Aftercool ignored the single-product page limit.")
        return products[0] if products else None

    def get_products(self, account: str, offset: int, limit: int = 500):
        if account not in {"jv", "xl"} or not 1 <= limit <= 500 or offset < 0:
            raise ValueError("Invalid product page parameters.")
        products, more = self._page("/api/products", account, offset, limit=limit)
        if len(products) > limit:
            raise AftercoolReadError("Aftercool ignored the page limit.")
        return products, more

    def iter_product_pages(self, account: str, offset: int, limit: int = 500, maximum: int = 0, workers: int = 1):
        if maximum < 0 or not 1 <= workers <= 3 or not 1 <= limit <= 500 or offset < 0:
            raise ValueError("Invalid page iterator parameters.")
        readers = [self] if workers == 1 else [self._fork_reader() for _ in range(workers)]
        end = offset + maximum if maximum else None
        pending = deque()
        next_offset = offset
        try:
            with ThreadPoolExecutor(max_workers=workers) as executor:
                def submit(reader):
                    nonlocal next_offset
                    if end is not None and next_offset >= end:
                        return
                    size = min(limit, end - next_offset) if end is not None else limit
                    pending.append((next_offset, size, reader, executor.submit(reader.get_products, account, next_offset, size)))
                    next_offset += size
                for reader in readers:
                    submit(reader)
                while pending:
                    page_offset, size, reader, request = pending.popleft()
                    products, more = request.result()
                    if more and len(products) != size:
                        raise AftercoolReadError("Aftercool returned a short non-final page.")
                    if more:
                        submit(reader)
                    yield page_offset, products, more
                    if not more:
                        return
        finally:
            for _, _, _, request in pending:
                request.cancel()
            if workers > 1:
                for reader in readers:
                    reader.close()

    def find_candidates(self, gallery_url: str):
        offset = 0
        deadline = time.monotonic() + 120
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError("Aftercool candidate lookup exceeded its time budget.")
            products, has_more = self._page("/api/products/by-gallery-url", "xl", offset,
                                            GalleryURL=gallery_url)
            yield from products
            if not has_more:
                return
            offset += len(products)

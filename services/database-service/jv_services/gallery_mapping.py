from dataclasses import dataclass
from typing import Callable, Iterable


@dataclass(frozen=True)
class GalleryProduct:
    source_id: str
    account: str
    ean: str | None
    gallery_url: str | None

    def __post_init__(self):
        if not isinstance(self.source_id, str) or not self.source_id.strip():
            raise ValueError("A stable Aftercool product ID is required.")
        if self.account not in {"jv", "xl"}:
            raise ValueError("Unexpected Aftercool account.")
        for value in (self.ean, self.gallery_url):
            if value is not None and not isinstance(value, str):
                raise ValueError("EAN and GalleryURL must be strings or null.")


@dataclass(frozen=True)
class GalleryMapping:
    product: GalleryProduct
    xl_ean: str | None
    reason: str


def match_gallery(product: GalleryProduct, candidates: Iterable[GalleryProduct]) -> GalleryMapping:
    if product.account != "jv":
        raise ValueError("The source product must belong to JV.")
    if not product.gallery_url or not product.gallery_url.strip():
        return GalleryMapping(product, None, "missing_gallery_url")
    matched = None
    for candidate in candidates:
        if candidate.account != "xl":
            raise ValueError("The candidate product must belong to XL.")
        if candidate.gallery_url != product.gallery_url:
            continue
        if matched is not None:
            return GalleryMapping(product, None, "multiple_matches")
        matched = candidate
    if matched is None:
        return GalleryMapping(product, None, "not_found")
    if not product.ean or not product.ean.strip():
        return GalleryMapping(product, None, "missing_jv_ean")
    if not matched.ean or not matched.ean.strip():
        return GalleryMapping(product, None, "missing_xl_ean")
    return GalleryMapping(product, matched.ean, "matched")


def map_gallery_page(
    offset: int,
    *,
    get_product: Callable[[int], GalleryProduct | None],
    find_candidates: Callable[[str], Iterable[GalleryProduct]],
    save: Callable[[GalleryMapping], None],
    checkpoint: Callable[[int], None],
) -> bool:
    if offset < 0:
        raise ValueError("Offset cannot be negative.")
    product = get_product(offset)
    if product is None:
        return False
    if product.account != "jv":
        raise ValueError("The source product must belong to JV.")
    save(GalleryMapping(product, None, "lookup_pending"))
    candidates = find_candidates(product.gallery_url) if product.gallery_url and product.gallery_url.strip() else ()
    save(match_gallery(product, candidates))
    checkpoint(offset + 1)
    return True

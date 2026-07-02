from __future__ import annotations

import re
import time
from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from requests.adapters import HTTPAdapter

from .ftp_upload import upload_kid_photo_file
from .kid_number_utils import primary_kid_number
from .models import Kid

GOOGLE_SHEETS_IMAGE_HOST_PREFIX = "https://docs.google.com/sheets-images-rt/"
DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/13mn62dm4WoqDTTkbstNbQ5BlXuV_wWGTfHsqgEahTSs/edit?gid=0"
DEFAULT_TIMEOUT_SEC = 8
KID_RE = re.compile(r"\d{6,12}")


@dataclass(slots=True)
class SheetImageRow:
    kid_number: str
    image_url: str
    row_number: int | None = None


@dataclass(slots=True)
class KidSheetImageImportStats:
    parsed_rows: int = 0
    duplicate_sheet_kids: int = 0
    matched_kids: int = 0
    uploaded: int = 0
    skipped_with_existing_photo: int = 0
    missing_kids: int = 0
    errors: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "parsed_rows": self.parsed_rows,
            "duplicate_sheet_kids": self.duplicate_sheet_kids,
            "matched_kids": self.matched_kids,
            "uploaded": self.uploaded,
            "skipped_with_existing_photo": self.skipped_with_existing_photo,
            "missing_kids": self.missing_kids,
            "errors": self.errors,
        }


class _SheetTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._rows: list[list[dict[str, object]]] = []
        self._in_tr = False
        self._in_cell = False
        self._current_row: list[dict[str, object]] = []
        self._current_cell_text: list[str] = []
        self._current_cell_images: list[str] = []

    @property
    def rows(self) -> list[list[dict[str, object]]]:
        return self._rows

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag == "tr":
            self._in_tr = True
            self._current_row = []
            return
        if not self._in_tr:
            return
        if tag in {"td", "th"}:
            self._in_cell = True
            self._current_cell_text = []
            self._current_cell_images = []
            return
        if self._in_cell and tag == "img":
            src = (attrs_dict.get("src") or "").strip()
            if src:
                self._current_cell_images.append(src)

    def handle_data(self, data: str) -> None:
        if self._in_cell and data:
            self._current_cell_text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._in_cell:
            self._current_row.append(
                {
                    "text": _normalize_cell_text("".join(self._current_cell_text)),
                    "images": list(self._current_cell_images),
                }
            )
            self._in_cell = False
            self._current_cell_text = []
            self._current_cell_images = []
            return
        if tag == "tr" and self._in_tr:
            if self._current_row:
                self._rows.append(list(self._current_row))
            self._in_tr = False
            self._current_row = []


def _normalize_cell_text(value: str) -> str:
    value = unescape(value or "")
    return re.sub(r"\s+", " ", value).strip()


def _normalize_sheet_url(sheet_url: str) -> str:
    parsed = urlparse(sheet_url or DEFAULT_SHEET_URL)
    query = parse_qs(parsed.query)
    gid = query.get("gid", ["0"])[0]
    clean_query = urlencode({"gid": gid})
    return urlunparse((parsed.scheme or "https", parsed.netloc, parsed.path, "", clean_query, ""))


def _extract_kid_number(raw_value: str) -> str | None:
    match = KID_RE.search((raw_value or "").strip())
    return match.group(0) if match else None


def fetch_sheet_image_rows(sheet_url: str = DEFAULT_SHEET_URL, *, timeout_sec: int = DEFAULT_TIMEOUT_SEC) -> list[SheetImageRow]:
    response = _requests_session().get(
        _normalize_sheet_url(sheet_url),
        timeout=timeout_sec,
        headers={"User-Agent": "WareHubImageImporter/1.0"},
    )
    response.raise_for_status()

    parser = _SheetTableParser()
    parser.feed(response.text)

    header_index = None
    kid_column_index = None
    for row_index, row in enumerate(parser.rows):
        for cell_index, cell in enumerate(row):
            text = str(cell.get("text") or "").strip().upper()
            if text == "KID":
                header_index = row_index
                kid_column_index = cell_index
                break
        if header_index is not None:
            break

    if header_index is None or kid_column_index is None:
        raise RuntimeError("Could not find KID column in Google Sheet HTML.")

    result: list[SheetImageRow] = []
    for row in parser.rows[header_index + 1 :]:
        if kid_column_index >= len(row):
            continue
        kid_number = _extract_kid_number(str(row[kid_column_index].get("text") or ""))
        if not kid_number:
            continue

        image_url = ""
        for cell in row:
            for candidate in cell.get("images") or []:
                candidate = str(candidate).strip()
                if candidate.startswith(GOOGLE_SHEETS_IMAGE_HOST_PREFIX):
                    image_url = candidate
                    break
            if image_url:
                break
        if not image_url:
            continue

        row_number = None
        if row:
            row_number = _extract_row_number(str(row[0].get("text") or ""))
        result.append(SheetImageRow(kid_number=kid_number, image_url=image_url, row_number=row_number))
    return result


def _extract_row_number(raw_value: str) -> int | None:
    match = re.search(r"\d+", raw_value or "")
    return int(match.group(0)) if match else None


def _normalize_photo_list(photo_value: object) -> list[str]:
    if isinstance(photo_value, list):
        return [str(item).strip() for item in photo_value if str(item).strip()]
    if isinstance(photo_value, str) and photo_value.strip():
        return [photo_value.strip()]
    return []


def _build_uploaded_file(kid_number: str, image_bytes: bytes, image_url: str) -> SimpleUploadedFile:
    parsed = urlparse(image_url)
    ext = Path(parsed.path).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        ext = _detect_image_ext(image_bytes)
    filename = f"{kid_number}{ext}"
    return SimpleUploadedFile(filename, image_bytes, content_type="application/octet-stream")


def import_sheet_images(
    *,
    sheet_url: str = DEFAULT_SHEET_URL,
    skip_existing_photos: bool = True,
    limit: int | None = None,
    dry_run: bool = False,
    timeout_sec: int = DEFAULT_TIMEOUT_SEC,
    retry_rounds: int = 3,
    retry_sleep_sec: float = 1.0,
    retry_until_done: bool = False,
    max_stalled_rounds: int = 3,
) -> tuple[KidSheetImageImportStats, list[str]]:
    rows = fetch_sheet_image_rows(sheet_url, timeout_sec=timeout_sec)
    stats = KidSheetImageImportStats(parsed_rows=len(rows))
    messages: list[str] = []

    seen_kids: set[str] = set()
    unique_rows: list[SheetImageRow] = []
    for row in rows:
        if row.kid_number in seen_kids:
            stats.duplicate_sheet_kids += 1
            messages.append(f"Duplicate sheet KID skipped: {row.kid_number}")
            continue
        seen_kids.add(row.kid_number)
        unique_rows.append(row)

    processed_rows = unique_rows[:limit] if limit is not None else unique_rows
    pending_rows = list(processed_rows)
    stalled_rounds = 0
    round_index = 0

    while True:
        if not pending_rows:
            break
        is_retry_round = round_index > 0
        if is_retry_round:
            if retry_until_done:
                messages.append(f"Retry round {round_index + 1} for {len(pending_rows)} pending KID(s).")
            else:
                messages.append(
                    f"Retry round {round_index + 1}/{max(1, retry_rounds)} for {len(pending_rows)} pending KID(s)."
                )
            if retry_sleep_sec > 0:
                time.sleep(retry_sleep_sec)

        next_pending_rows: list[SheetImageRow] = []
        uploaded_this_round = 0

        for row in pending_rows:
            kid = _find_kid_by_number(row.kid_number)
            if kid is None:
                if not is_retry_round:
                    stats.missing_kids += 1
                    messages.append(f"Missing local kid: {row.kid_number}")
                continue

            if not is_retry_round:
                stats.matched_kids += 1
            current_photos = _normalize_photo_list(kid.photo)
            if skip_existing_photos and current_photos:
                if not is_retry_round:
                    stats.skipped_with_existing_photo += 1
                    messages.append(f"Skipped {row.kid_number}: local photos already exist.")
                continue

            if dry_run:
                if not is_retry_round:
                    messages.append(f"Would import image for KID {row.kid_number} from sheet row {row.row_number or '-'}")
                continue

            try:
                image_response = _requests_session().get(
                    row.image_url,
                    timeout=timeout_sec,
                    headers={"User-Agent": "WareHubImageImporter/1.0"},
                )
                image_response.raise_for_status()
                uploaded_file = _build_uploaded_file(row.kid_number, image_response.content, row.image_url)
                uploaded_url = upload_kid_photo_file(uploaded_file, kid_number=row.kid_number)
                kid.photo = list(dict.fromkeys(current_photos + [uploaded_url]))
                kid.save(update_fields=["photo"])
                stats.uploaded += 1
                uploaded_this_round += 1
                messages.append(f"Imported image for KID {row.kid_number} -> {uploaded_url}")
            except Exception as exc:  # noqa: BLE001
                next_pending_rows.append(row)
                is_final_attempt = (
                    dry_run
                    or (not retry_until_done and round_index == max(1, retry_rounds) - 1)
                    or (retry_until_done and stalled_rounds + 1 >= max(1, max_stalled_rounds))
                )
                if is_final_attempt:
                    stats.errors += 1
                    messages.append(f"Failed {row.kid_number}: {exc}")

        pending_rows = next_pending_rows
        if not pending_rows:
            break
        if dry_run:
            break
        if uploaded_this_round > 0:
            stalled_rounds = 0
        else:
            stalled_rounds += 1
        if retry_until_done:
            if stalled_rounds >= max(1, max_stalled_rounds):
                break
        else:
            if round_index + 1 >= max(1, retry_rounds):
                break
        round_index += 1

    return stats, messages


def _find_kid_by_number(kid_number: str) -> Kid | None:
    normalized = primary_kid_number([kid_number] if kid_number else [])
    if not normalized:
        return None
    for kid in Kid.objects.all().iterator():
        if primary_kid_number(kid.kid_number) == normalized:
            return kid
    return None


def _requests_session() -> requests.Session:
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=0)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def _detect_image_ext(image_bytes: bytes) -> str:
    header = image_bytes[:16]
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if header.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if header[:6] in {b"GIF87a", b"GIF89a"}:
        return ".gif"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return ".webp"
    return ".jpg"

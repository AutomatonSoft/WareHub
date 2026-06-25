from __future__ import annotations

import json
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

# Source Excel (you can change this path if needed)
EXCEL_PATH = Path(
    Path(__file__).with_name("PPPra.xlsx")
)

# Output txt with only green KID values
OUTPUT_PATH = Path(__file__).with_name("kid_green.txt")
JSON_OUTPUT_PATH = Path(__file__).with_name("kid_green.json")
IMAGES_OUTPUT_DIR = Path(__file__).with_name("kid_green_images")

# Known status colors in column P
GREEN_COLORS = {
    "FF6AA84F",
    "FF34A853",
    "FF00FF00",
}
RED_COLORS = {
    "FFFF0000",
    "FFCC0000",
}
DROP_WORDS = (
    "Выставить!!!",
    "Продано!!!",
    "Продан!!!",
)


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
REL_ID_ATTR = (
    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
)
BLIP_EMBED_ATTR = (
    "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
)


def _normalize_rgb(value: object) -> str:
    text = str(value or "").strip().upper()
    if len(text) == 6:
        return f"FF{text}"
    return text


def _normalize_numeric_text(text: str) -> str:
    raw = text.strip()
    if not raw:
        return ""

    if re.fullmatch(r"[+-]?\d+\.0+", raw):
        try:
            return str(int(Decimal(raw)))
        except (InvalidOperation, ValueError):
            return raw

    if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+", raw):
        try:
            decimal_value = Decimal(raw)
        except InvalidOperation:
            return raw

        if decimal_value == decimal_value.to_integral_value():
            return str(int(decimal_value))

        normalized = format(decimal_value.normalize(), "f")
        return normalized.rstrip("0").rstrip(".")

    return raw


def _normalize_kid(raw_value: object) -> str | None:
    if raw_value is None:
        return None

    if isinstance(raw_value, (datetime, date)):
        return None

    if isinstance(raw_value, float):
        # KID in your file usually looks like 9-digit integer stored as float.
        if not raw_value.is_integer():
            return None
        raw_value = int(raw_value)

    text = _normalize_numeric_text(str(raw_value))
    if not text or text == "___":
        return None

    # Drop date-like values in KID column.
    if any(sep in text for sep in ("/", "-", ":")):
        return None

    # Some values are mixed: "558163081 prodan" or "555939380 28.01.26".
    # We take the first numeric sequence that can be a KID.
    match = re.search(r"\d{6,}", text)
    if not match:
        return None

    return match.group(0)


def _cell_to_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = _normalize_numeric_text(str(value))
    for word in DROP_WORDS:
        text = text.replace(word, "")
    return text.strip()


def _normalize_place(value: object) -> str:
    text = _cell_to_text(value)
    text = re.sub(r"store", "", text, flags=re.IGNORECASE)
    text = text.replace("№", "")
    text = re.sub(r"\s+", "", text)
    return text


def _contains_store(value: object) -> bool:
    return "store" in _cell_to_text(value).casefold()


def _contains_b_ware(values: Iterable[object]) -> bool:
    for value in values:
        if "b-ware" in _cell_to_text(value).casefold():
            return True
    return False


def _resolve_target(source_part: str, target: str) -> str:
    return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    shared_strings: list[str] = []
    for string_item in root.findall("main:si", NS):
        text_parts = [node.text or "" for node in string_item.findall(".//main:t", NS)]
        shared_strings.append("".join(text_parts))
    return shared_strings


def _active_sheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find("main:sheets/main:sheet", NS)
    if first_sheet is None:
        raise RuntimeError("No worksheets found in workbook.")

    sheet_rid = first_sheet.attrib.get(REL_ID_ATTR)
    if not sheet_rid:
        raise RuntimeError("Active worksheet relation id is missing.")

    workbook_rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for rel in workbook_rels.findall("rel:Relationship", NS):
        if rel.attrib.get("Id") == sheet_rid:
            target = rel.attrib.get("Target", "")
            if not target:
                break
            return target if target.startswith("xl/") else f"xl/{target}"

    raise RuntimeError("Active worksheet target path not found.")


def _style_color_map(archive: zipfile.ZipFile) -> dict[str, set[str]]:
    if "xl/styles.xml" not in archive.namelist():
        return {}

    styles_root = ET.fromstring(archive.read("xl/styles.xml"))
    fills = styles_root.find("main:fills", NS)
    fonts = styles_root.find("main:fonts", NS)
    cell_xfs = styles_root.find("main:cellXfs", NS)
    if fills is None or fonts is None or cell_xfs is None:
        return {}

    style_colors: dict[str, set[str]] = {}
    for style_index, xf in enumerate(cell_xfs.findall("main:xf", NS)):
        colors: set[str] = set()

        fill_id = xf.attrib.get("fillId")
        if fill_id is not None and fill_id.isdigit():
            fill_nodes = fills.findall("main:fill", NS)
            fill_index = int(fill_id)
            if 0 <= fill_index < len(fill_nodes):
                pattern_fill = fill_nodes[fill_index].find("main:patternFill", NS)
                if pattern_fill is not None:
                    fg_color = pattern_fill.find("main:fgColor", NS)
                    if fg_color is not None:
                        rgb = _normalize_rgb(fg_color.attrib.get("rgb", ""))
                        if rgb:
                            colors.add(rgb)

        font_id = xf.attrib.get("fontId")
        if font_id is not None and font_id.isdigit():
            font_nodes = fonts.findall("main:font", NS)
            font_index = int(font_id)
            if 0 <= font_index < len(font_nodes):
                font_color = font_nodes[font_index].find("main:color", NS)
                if font_color is not None:
                    rgb = _normalize_rgb(font_color.attrib.get("rgb", ""))
                    if rgb:
                        colors.add(rgb)

        style_colors[str(style_index)] = colors

    return style_colors


def _cell_value_from_xml(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t", "")
    value_node = cell.find("main:v", NS)
    inline_string = cell.find("main:is", NS)

    if cell_type == "s" and value_node is not None and value_node.text is not None:
        shared_index_text = value_node.text.strip()
        if shared_index_text.isdigit():
            shared_index = int(shared_index_text)
            if 0 <= shared_index < len(shared_strings):
                return shared_strings[shared_index]
        return value_node.text

    if cell_type == "inlineStr" and inline_string is not None:
        text_parts = [node.text or "" for node in inline_string.findall(".//main:t", NS)]
        return "".join(text_parts)

    if value_node is not None and value_node.text is not None:
        return value_node.text

    return ""


def _column_index_from_ref(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref)
    if not match:
        return 0

    column_name = match.group(1)
    index = 0
    for char in column_name:
        index = index * 26 + (ord(char) - ord("A") + 1)
    return index


def _iter_active_sheet_rows(
    excel_path: Path, max_col: int
) -> Iterable[tuple[int, list[dict[str, str]]]]:
    with zipfile.ZipFile(excel_path, "r") as archive:
        shared_strings = _read_shared_strings(archive)
        sheet_path = _active_sheet_path(archive)
        sheet_root = ET.fromstring(archive.read(sheet_path))

        for row in sheet_root.findall("main:sheetData/main:row", NS):
            row_number_text = row.attrib.get("r", "")
            if not row_number_text.isdigit():
                continue

            row_number = int(row_number_text)
            cells: list[dict[str, str]] = [{"value": "", "style_id": ""} for _ in range(max_col)]
            for cell in row.findall("main:c", NS):
                cell_ref = cell.attrib.get("r", "")
                column_index = _column_index_from_ref(cell_ref)
                if not 1 <= column_index <= max_col:
                    continue

                cells[column_index - 1] = {
                    "value": _cell_value_from_xml(cell, shared_strings),
                    "style_id": cell.attrib.get("s", ""),
                }

            yield row_number, cells


def _build_photo_map_for_sheet(excel_path: Path, sheet_name: str) -> dict[int, str]:
    photo_map: dict[int, str] = {}

    with zipfile.ZipFile(excel_path, "r") as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        workbook_rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        wb_rel_targets = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in workbook_rels.findall("rel:Relationship", NS)
        }

        sheet_rid = None
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            if sheet.attrib.get("name") == sheet_name:
                sheet_rid = sheet.attrib.get(REL_ID_ATTR)
                break
        if not sheet_rid:
            return photo_map

        sheet_target = wb_rel_targets.get(sheet_rid)
        if not sheet_target:
            return photo_map
        sheet_path = (
            sheet_target if sheet_target.startswith("xl/") else f"xl/{sheet_target}"
        )

        sheet_rels_path = (
            f"{posixpath.dirname(sheet_path)}/_rels/{posixpath.basename(sheet_path)}.rels"
        )
        if sheet_rels_path not in archive.namelist():
            return photo_map

        sheet_rels = ET.fromstring(archive.read(sheet_rels_path))
        drawing_paths: list[str] = []
        for rel in sheet_rels.findall("rel:Relationship", NS):
            if rel.attrib.get("Type", "").endswith("/drawing"):
                drawing_paths.append(_resolve_target(sheet_path, rel.attrib["Target"]))

        for drawing_path in drawing_paths:
            if drawing_path not in archive.namelist():
                continue

            drawing_rels_path = (
                f"{posixpath.dirname(drawing_path)}/_rels/"
                f"{posixpath.basename(drawing_path)}.rels"
            )
            if drawing_rels_path not in archive.namelist():
                continue

            drawing_rels = ET.fromstring(archive.read(drawing_rels_path))
            drawing_rel_targets = {
                rel.attrib["Id"]: _resolve_target(drawing_path, rel.attrib["Target"])
                for rel in drawing_rels.findall("rel:Relationship", NS)
                if rel.attrib.get("Type", "").endswith("/image")
            }

            drawing_xml = ET.fromstring(archive.read(drawing_path))
            anchors = drawing_xml.findall(".//xdr:oneCellAnchor", NS) + drawing_xml.findall(
                ".//xdr:twoCellAnchor", NS
            )
            for anchor in anchors:
                anchor_from = anchor.find("xdr:from", NS)
                if anchor_from is None:
                    continue

                row_text = anchor_from.findtext("xdr:row", default="", namespaces=NS)
                col_text = anchor_from.findtext("xdr:col", default="", namespaces=NS)
                if not row_text.isdigit() or not col_text.isdigit():
                    continue

                # Drawing coordinates are zero-based; convert to Excel's 1-based.
                row_number = int(row_text) + 1
                column_number = int(col_text) + 1
                if column_number != 2:  # B column (Фото товара)
                    continue

                blip = anchor.find(".//a:blip", NS)
                image_rel_id = blip.attrib.get(BLIP_EMBED_ATTR) if blip is not None else None
                if not image_rel_id:
                    continue

                image_path = drawing_rel_targets.get(image_rel_id)
                if not image_path:
                    continue

                photo_map.setdefault(row_number, image_path)

    return photo_map


def _clear_output_dir(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for child in output_dir.iterdir():
        if child.is_file():
            child.unlink()


def _extract_used_images_for_entries(
    excel_path: Path, entries: list[dict[str, str]], output_dir: Path
) -> int:
    _clear_output_dir(output_dir)
    created_files = 0
    kid_file_counters: dict[str, int] = defaultdict(int)
    pair_to_relative_path: dict[tuple[str, str], str] = {}

    with zipfile.ZipFile(excel_path, "r") as archive:
        names = set(archive.namelist())
        for entry in entries:
            kid = entry.get("kid", "").strip()
            image_path = entry.get("photo", "")
            if not kid or not image_path:
                entry["photo"] = ""
                continue
            if image_path not in names:
                entry["photo"] = ""
                continue

            pair_key = (kid, image_path)
            if pair_key in pair_to_relative_path:
                entry["photo"] = pair_to_relative_path[pair_key]
                continue

            extension = Path(image_path).suffix.lower() or ".png"
            kid_file_counters[kid] += 1
            index = kid_file_counters[kid]
            suffix = "" if index == 1 else f"_{index}"
            filename = f"{kid}{suffix}{extension}"
            output_file = output_dir / filename

            while output_file.exists():
                kid_file_counters[kid] += 1
                index = kid_file_counters[kid]
                suffix = f"_{index}"
                filename = f"{kid}{suffix}{extension}"
                output_file = output_dir / filename

            output_file.write_bytes(archive.read(image_path))
            relative_path = str(output_file.relative_to(output_dir.parent))
            pair_to_relative_path[pair_key] = relative_path
            entry["photo"] = relative_path
            created_files += 1

    return created_files


def _listing_status_from_colors(colors: set[str]) -> str:
    if not colors:
        return ""

    has_green = any(color in GREEN_COLORS for color in colors)
    has_red = any(color in RED_COLORS for color in colors)

    if has_green and not has_red:
        return "listed"
    if has_red and not has_green:
        return "unlisted"
    return ""


def collect_kid_entries(excel_path: Path) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    style_colors = {}
    with zipfile.ZipFile(excel_path, "r") as archive:
        style_colors = _style_color_map(archive)

    # A=place, C=company, D=Kid.room, E=kid, F=Ean.ebay_xl, H=Ean.jv,
    # J=Ean.otto_jv, L=Ean.otto_xl, N=ProductAttributes.quantity,
    # R=commentary, S=comment2, T=listing_status
    for row_number, row in _iter_active_sheet_rows(excel_path, max_col=20):
        if row_number < 2:
            continue

        place_cell = row[0]
        company_cell = row[2]
        room_cell = row[3]
        kid_cell = row[4]
        ean_ebay_xl_cell = row[5]
        ean_jv_cell = row[7]
        ean_otto_jv_cell = row[9]
        ean_otto_xl_cell = row[11]
        quantity_cell = row[13]
        commentary_cell = row[17]
        comment2_cell = row[18]
        status_cell = row[19]

        kid = _normalize_kid(kid_cell["value"]) or _cell_to_text(kid_cell["value"])
        kid_store = _contains_store(place_cell["value"])
        kid_b_ware = _contains_b_ware(
            cell["value"] for cell in row
        )

        status_colors = style_colors.get(status_cell["style_id"], set())

        result.append(
            {
                "place": _normalize_place(place_cell["value"]),
                "company": _cell_to_text(company_cell["value"]),
                "Kid.room": _cell_to_text(room_cell["value"]),
                "kid": kid,
                "Kid.store": kid_store,
                "Kid.b_ware": kid_b_ware,
                "Ean.ebay_xl": _cell_to_text(ean_ebay_xl_cell["value"]),
                "Ean.jv": _cell_to_text(ean_jv_cell["value"]),
                "Ean.otto_jv": _cell_to_text(ean_otto_jv_cell["value"]),
                "Ean.otto_xl": _cell_to_text(ean_otto_xl_cell["value"]),
                "ProductAttributes.quantity": _cell_to_text(quantity_cell["value"]),
                "commentary": _cell_to_text(commentary_cell["value"]),
                "comment2": _cell_to_text(comment2_cell["value"]),
                "listing_status": _listing_status_from_colors(status_colors),
            }
        )

    return result

def collect_unique_kids(entries: list[dict[str, str]]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        kid = entry["kid"]
        if kid not in seen:
            seen.add(kid)
            unique.append(kid)

    return unique


def write_kids_txt(kids: Iterable[str], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(kids) + "\n", encoding="utf-8")


def write_entries_json(entries: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    entries = collect_kid_entries(EXCEL_PATH)
    kids = collect_unique_kids(entries)
    write_kids_txt(kids, OUTPUT_PATH)
    write_entries_json(entries, JSON_OUTPUT_PATH)
    print(f"Saved {len(kids)} unique KID values to: {OUTPUT_PATH}")
    print(f"Saved {len(entries)} rows to: {JSON_OUTPUT_PATH}")


if __name__ == "__main__":
    main()

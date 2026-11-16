"""Convert the training-program workbook into a Liftbook import file.

Usage:
  python tools/import_workbook.py --sheet-url URL [--out tools/out]
  python tools/import_workbook.py --xlsx PATH     [--out tools/out]
  (or set LIFTBOOK_SHEET_URL)

Writes <out>/liftbook-import.json in the app's backup format (pictures embedded). Import it
on the phone with Settings -> Import file. The output is private: never commit it.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import posixpath
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

import openpyxl
from PIL import Image

DEFAULT_CACHE = Path(__file__).parent / ".cache" / "book.xlsx"
MAX_SIDE = 800
JPEG_QUALITY = 80

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


def export_url(sheet_url: str) -> str:
    """Accept a normal sheet link or an export link; return the xlsx export link."""
    m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", sheet_url)
    if not m:
        raise ValueError(f"not a Google Sheets link: {sheet_url}")
    return f"https://docs.google.com/spreadsheets/d/{m.group(1)}/export?format=xlsx"


def download(sheet_url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(export_url(sheet_url), timeout=60) as r:
        dest.write_bytes(r.read())
    return dest


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(v) if float(v).is_integer() else float(v)
    return None


def _parse(path: Path):
    """Return (program, name_cells) where name_cells maps (sheet, row) -> [(col, target_dict)]."""
    wb = openpyxl.load_workbook(path)
    days, name_cells = [], {}
    for n, ws in enumerate(wb.worksheets, start=1):
        title = ws["A1"].value or f"Day {n}"
        day_id = slug(str(title))
        day = {"id": day_id, "name": str(title), "rest": False, "exercises": []}
        if str(ws["A2"].value or "").strip().upper() == "REST DAY":
            day["rest"] = True
            days.append(day)
            continue
        group, seen = "", set()
        for row in ws.iter_rows(min_row=2):
            cells = [c for c in row if c.value is not None]
            if cells and cells[0].column == 1:
                group = str(cells[0].value).strip()
            cells = [c for c in cells if c.column >= 2]
            if not cells or cells[0].column != 2 or not isinstance(cells[0].value, str):
                continue
            name = cells[0].value.strip()
            ex_id = f"{day_id}-{slug(name)}"
            while ex_id in seen:
                ex_id += "-x"
            seen.add(ex_id)
            ex = {
                "id": ex_id, "group": group, "name": name, "type": "strength",
                "weight": None, "duration": None, "sets": 3, "repsMin": 8, "repsMax": 12,
                "image": None, "alternatives": [],
            }
            targets = [(2, ex)]
            rest = cells[1:]
            if rest and rest[0].column < 6:  # working-weight column (E)
                v = rest.pop(0).value
                if _num(v) is not None:
                    ex["weight"] = _num(v)
                else:
                    ex["type"], ex["duration"] = "cardio", str(v).strip()
            last_alt = None
            for c in rest:
                v = c.value
                if isinstance(v, str) and v.strip().lower() == "alternative":
                    continue
                if isinstance(v, str):
                    last_alt = {
                        "id": f"{ex_id}-alt-{len(ex['alternatives']) + 1}",
                        "name": v.strip(), "weight": None, "image": None,
                    }
                    ex["alternatives"].append(last_alt)
                    targets.append((c.column, last_alt))
                elif _num(v) is not None and last_alt is not None and last_alt["weight"] is None:
                    last_alt["weight"] = _num(v)
            name_cells[(ws.title, row[0].row)] = targets
            day["exercises"].append(ex)
        days.append(day)
    return {"version": 1, "days": days}, name_cells


def parse_workbook(path: Path) -> dict:
    return _parse(path)[0]


def _rels(z: zipfile.ZipFile, part: str) -> dict:
    d, f = posixpath.split(part)
    rels_path = posixpath.join(d, "_rels", f + ".rels")
    if rels_path not in z.namelist():
        return {}
    root = ET.fromstring(z.read(rels_path))
    out = {}
    for r in root.findall("rel:Relationship", NS):
        target = r.get("Target")
        # targets are relative to the part's folder, or absolute from the package root
        path = target.lstrip("/") if target.startswith("/") else posixpath.join(d, target)
        out[r.get("Id")] = posixpath.normpath(path)
    return out


def extract_images(path: Path) -> dict:
    """(sheet_title, row 1-based, col 1-based) -> original image bytes."""
    out = {}
    with zipfile.ZipFile(path) as z:
        wb_rels = _rels(z, "xl/workbook.xml")
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        for sh in wb.findall("main:sheets/main:sheet", NS):
            sheet_part = wb_rels[sh.get(f"{{{NS['r']}}}id")]
            for drawing_part in _rels(z, sheet_part).values():
                if "/drawings/" not in drawing_part:
                    continue
                d_rels = _rels(z, drawing_part)
                root = ET.fromstring(z.read(drawing_part))
                for anchor in root:
                    frm = anchor.find("xdr:from", NS)
                    blip = anchor.find(".//a:blip", NS)
                    if frm is None or blip is None:
                        continue
                    col = int(frm.find("xdr:col", NS).text) + 1
                    row = int(frm.find("xdr:row", NS).text) + 1
                    target = d_rels[blip.get(f"{{{NS['r']}}}embed")]
                    out[(sh.get("name"), row, col)] = z.read(target)
    return out


def to_jpeg(data: bytes) -> bytes:
    im = Image.open(io.BytesIO(data))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()


def build(path: Path):
    """Return (program, images {image id: jpeg bytes}, warnings). Refs are "idb:<id>"."""
    program, name_cells = _parse(path)
    images, warnings = {}, []
    for (sheet, row, col), data in sorted(extract_images(path).items()):  # sorted: leftmost first
        targets = [t for c, t in name_cells.get((sheet, row), []) if c <= col]
        if not targets:
            warnings.append(f"unassigned image: sheet={sheet} row={row} col={col}")
            continue
        target = targets[-1]
        if target["image"]:  # some exercises have 2 pictures side by side: keep the leftmost
            continue
        image_id = hashlib.sha1(data).hexdigest()[:12]
        if image_id not in images:
            images[image_id] = to_jpeg(data)
        target["image"] = f"idb:{image_id}"
    return program, images, warnings


def import_file(program: dict, images: dict, now_ms: int) -> dict:
    """Backup-format document (see app/js/backup.js)."""
    return {
        "app": "liftbook",
        "format": 1,
        "exportedAt": "",
        "program": {**program, "updatedAt": now_ms},
        "settings": {"restSec": 90},
        "logs": [],
        "images": [
            {"id": k, "type": "image/jpeg", "data": base64.b64encode(v).decode("ascii")}
            for k, v in images.items()
        ],
    }


def main(argv=None) -> int:
    import time

    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sheet-url", default=os.environ.get("LIFTBOOK_SHEET_URL"))
    ap.add_argument("--xlsx", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "out")
    args = ap.parse_args(argv)
    if not args.xlsx and not args.sheet_url:
        ap.error("give --xlsx PATH or --sheet-url URL (or set LIFTBOOK_SHEET_URL)")
    xlsx = args.xlsx or download(args.sheet_url, DEFAULT_CACHE)
    program, images, warnings = build(xlsx)
    for w in warnings:
        print("WARNING:", w, file=sys.stderr)
    args.out.mkdir(parents=True, exist_ok=True)
    out = args.out / "liftbook-import.json"
    doc = import_file(program, images, int(time.time() * 1000))
    out.write_text(json.dumps(doc, ensure_ascii=False))
    n_ex = sum(len(d["exercises"]) for d in program["days"])
    print(f"wrote {out}: days={len(program['days'])} exercises={n_ex} images={len(images)} warnings={len(warnings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

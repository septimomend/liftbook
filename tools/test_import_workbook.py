"""Importer tests against a synthetic workbook with the same layout as the owner's sheet.

The owner's real program must never appear in this repo. To also sanity-check a real export
locally, set LIFTBOOK_REAL_XLSX=/path/to/book.xlsx (that check asserts structure only).
"""
import io
import os
import re
from pathlib import Path

import openpyxl
import pytest
from openpyxl.drawing.image import Image as XlImage
from PIL import Image

import import_workbook as iw


def _png(color):
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), color).save(buf, "PNG")
    buf.seek(0)
    return buf


def _pic(ws, cell, color):
    ws.add_image(XlImage(_png(color)), cell)


@pytest.fixture(scope="module")
def book(tmp_path_factory):
    """Layout: A group (first row only) | B name | C-D pictures | E weight | F "Alternative" |
    G alt name | H alt picture | J alt weight or 2nd alt name."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Day_1"
    ws["A1"], ws["E1"] = "Day 1", "Working weight"
    ws["A2"], ws["B2"], ws["E2"], ws["F2"] = "Push", "Press A", 50, "Alternative"
    ws["B3"], ws["E3"], ws["F3"], ws["G3"], ws["J3"] = "Press B", 40, "Alternative", "Alt B1", 12
    ws["A5"], ws["B5"], ws["E5"], ws["F5"], ws["G5"], ws["J5"] = "Pull", "Row A", 30.5, "Alternative", "Alt C1", "Alt C2"
    ws["A7"], ws["B7"], ws["E7"] = "Cardio", "Walk", "15-20 min"
    _pic(ws, "C2", (255, 0, 0))
    _pic(ws, "C3", (0, 255, 0))
    _pic(ws, "D3", (0, 0, 255))      # second picture of the same exercise -> ignored
    _pic(ws, "H3", (255, 255, 0))    # alternative's picture
    _pic(ws, "C5", (255, 0, 0))      # same picture as Press A -> deduplicated
    rest = wb.create_sheet("Day_2")
    rest["A1"], rest["A2"] = "Day 2", "REST DAY"
    path = tmp_path_factory.mktemp("wb") / "book.xlsx"
    wb.save(path)
    return path


@pytest.fixture(scope="module")
def program(book):
    return iw.parse_workbook(book)


def by_name(day, name):
    return next(e for e in day["exercises"] if e["name"] == name)


def test_days_and_rest(program):
    assert [d["name"] for d in program["days"]] == ["Day 1", "Day 2"]
    assert [d["rest"] for d in program["days"]] == [False, True]
    assert program["days"][1]["exercises"] == []


def test_exercise_fields_and_defaults(program):
    first = program["days"][0]["exercises"][0]
    assert (first["name"], first["weight"], first["group"], first["type"]) == ("Press A", 50, "Push", "strength")
    assert (first["sets"], first["repsMin"], first["repsMax"]) == (3, 8, 12)
    assert by_name(program["days"][0], "Row A")["weight"] == 30.5


def test_group_carried_forward(program):
    assert by_name(program["days"][0], "Press B")["group"] == "Push"


def test_alternative_with_weight(program):
    ex = by_name(program["days"][0], "Press B")
    assert [(a["name"], a["weight"]) for a in ex["alternatives"]] == [("Alt B1", 12)]


def test_two_alternatives_without_weight(program):
    ex = by_name(program["days"][0], "Row A")
    assert [(a["name"], a["weight"]) for a in ex["alternatives"]] == [("Alt C1", None), ("Alt C2", None)]


def test_cardio(program):
    walk = by_name(program["days"][0], "Walk")
    assert (walk["type"], walk["duration"], walk["weight"]) == ("cardio", "15-20 min", None)


def test_ids_unique(program):
    ids = [d["id"] for d in program["days"]]
    for d in program["days"]:
        for e in d["exercises"]:
            ids += [e["id"]] + [a["id"] for a in e["alternatives"]]
    assert len(ids) == len(set(ids))


def test_images_assigned_leftmost_and_deduplicated(book):
    program, images, warnings = iw.build(book)
    d1 = program["days"][0]
    assert warnings == []
    a, b, row, walk = (by_name(d1, n) for n in ("Press A", "Press B", "Row A", "Walk"))
    assert a["image"] and a["image"] == row["image"]          # same picture, one file
    assert b["image"] and b["image"] != a["image"]
    assert b["alternatives"][0]["image"] not in (None, b["image"])
    assert walk["image"] is None
    anchors = iw.extract_images(book)
    leftmost = anchors[("Day_1", 3, 3)]                        # C3, not D3
    assert b["image"] == "idb:" + iw.hashlib.sha1(leftmost).hexdigest()[:12]
    assert len(images) == 3
    for ref in (a["image"], b["image"]):
        assert ref.startswith("idb:") and ref[4:] in images


def test_import_file_is_valid_backup(book):
    program, images, _ = iw.build(book)
    doc = iw.import_file(program, images, now_ms=1_700_000_000_000)
    assert doc["app"] == "liftbook" and doc["format"] == 1
    assert doc["program"]["updatedAt"] == 1_700_000_000_000
    assert doc["logs"] == [] and doc["settings"] == {"restSec": 90}
    assert {i["id"] for i in doc["images"]} == set(images)
    assert all(i["type"] == "image/jpeg" for i in doc["images"])
    assert iw.base64.b64decode(doc["images"][0]["data"])[:2] == b"\xff\xd8"  # JPEG magic


def test_export_url():
    assert iw.export_url("https://docs.google.com/spreadsheets/d/AbC_123-x/edit?usp=sharing") == \
        "https://docs.google.com/spreadsheets/d/AbC_123-x/export?format=xlsx"
    with pytest.raises(ValueError):
        iw.export_url("https://example.com/")


def test_no_sheet_id_in_tracked_sources():
    root = Path(__file__).parent.parent
    pattern = re.compile(r"spreadsheets/d/[A-Za-z0-9_-]{20,}")
    files = [*root.glob("tools/*.py"), *root.glob("docs/**/*.md"), *root.glob("app/**/*.js"), root / "README.md"]
    for p in files:
        assert not pattern.search(p.read_text()), p


@pytest.mark.skipif(not os.environ.get("LIFTBOOK_REAL_XLSX"), reason="set LIFTBOOK_REAL_XLSX to check a real export")
def test_real_workbook_structure():
    program, images, warnings = iw.build(Path(os.environ["LIFTBOOK_REAL_XLSX"]))
    assert warnings == []
    assert program["days"] and images
    for d in program["days"]:
        assert d["rest"] or d["exercises"]

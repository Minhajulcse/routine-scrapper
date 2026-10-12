"""Orchestrates: render -> grid -> OCR cells -> parse -> validate -> dict."""
from __future__ import annotations
import hashlib, json, re
from datetime import datetime, timezone
from pathlib import Path
import cv2

from .grid import crop, detect_grid, ocr, render_pages
from .parse import parse_cell, parse_vacant

DATA = Path(__file__).resolve().parent.parent / "data"
DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]
SLOTS = [("09:00", "10:30"), ("10:30", "12:00"), ("12:00", "13:30"), ("14:00", "15:30"), ("15:30", "17:00")]
COL_TO_SLOT = {1: 0, 2: 1, 3: 2, 5: 3, 6: 4}      # column 0 = day label, column 4 = lunch break
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]


def _load(name: str) -> dict:
    p = DATA / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _overlap(a0, a1, b0, b1) -> float:
    return max(0, min(a1, b1) - max(a0, b0)) / (b1 - b0)


def parse_header(text: str) -> dict:
    out = {}
    if m := re.search(r"Routine\s+(Fall|Spring|Summer)\s+(\d{4})", text, re.I):
        out["semester"] = f"{m.group(1).title()} {m.group(2)}"
    if m := re.search(r"(\d{1,2})\D{0,6}?\s*(%s)\w*\s+(\d{4})" % "|".join(MONTHS), text, re.I):
        out["effective_from"] = f"{m.group(3)}-{MONTHS.index(m.group(2).lower()) + 1:02d}-{int(m.group(1)):02d}"
    return out


def parse_headcounts(text: str) -> dict:
    out = {}
    for y, s, sec, n in re.findall(r"([1-4])\s*-\s*([Il1!|]+)\s*(?:\(\s*([AB])\s*\))?\s*[=:]\s*(\d+)", text):
        out[f"{y}-{'I' * min(len(s), 2)}" + (f" {sec}" if sec else "")] = int(n)
    return out


def run(pdf: str, dpi: int = 300, debug_dir: str | None = None) -> dict:
    faculty = _load("faculty.seed.json")
    course_names = _load("course_names.json")
    known = set(faculty)
    pages = render_pages(pdf, dpi)
    gray = pages[0]
    grid = detect_grid(gray)
    xs, ys = grid.xs, grid.ys
    if len(xs) != 8 or len(ys) != 8:
        raise RuntimeError(f"Unexpected grid: {len(xs)-1} cols x {len(ys)-1} rows (expected 7 x 7). "
                           "Check scan quality / --dpi; use --debug-dir to inspect.")

    review: list[str] = []
    classes: list[dict] = []
    vacant: list[dict] = []
    banner_done: set[tuple] = set()

    for r in range(1, 7):
        y0, y1 = ys[r], ys[r + 1]
        for c, slot in COL_TO_SLOT.items():
            x0, x1 = xs[c], xs[c + 1]
            top = y0
            for b in grid.banners:                      # merged cell hanging over this column
                if y0 <= b[1] < y1 and _overlap(x0, x1, b[0], b[2]) > 0.5:
                    top = max(top, b[3])
            if r <= 5:
                for b in grid.banners:
                    if y0 <= b[1] < y1 and b not in banner_done:
                        banner_done.add(b)
                        for e in parse_cell(ocr(crop(gray, b[0], b[1], b[2], b[3])), known):
                            e.update(day=r - 1, slot=None)
                            classes.append(e)
                for e in parse_cell(ocr(crop(gray, x0, top, x1, y1)), known):
                    e.update(day=r - 1, slot=slot)
                    classes.append(e)
            else:
                for d, rooms in parse_vacant(ocr(crop(gray, x0, y0, x1, y1))).items():
                    vacant.append({"day": d, "slot": slot, "rooms": sorted(rooms)})

    seen = set()
    for e in classes:
        if e["slot"] is not None:
            e["start"], e["end"] = SLOTS[e["slot"]]
        e["day_name"] = DAYS[e["day"]]
        e["course_name"] = course_names.get(e["course_code"])
        key = (e["day"], e["start"], e["course_code"], e["section"], e["room"])
        e["id"] = hashlib.sha1("|".join(map(str, key)).encode()).hexdigest()[:10]
        e["duplicate"] = key in seen
        seen.add(key)
    classes = [e for e in classes if not e["duplicate"]]
    classes.sort(key=lambda e: (e["day"], e["start"], e["course_code"], e["section"] or ""))

    for e in classes:                                    # per-entry OCR warnings
        review += [f"{e['day_name']} {e['start']} {e['course_code']}: {w}  [raw: {e['raw']}]"
                   for w in e["warnings"] if "used code-derived" not in w]
    for kind in ("room", "teacher"):                     # clash detection
        bucket: dict[tuple, list] = {}
        for e in classes:
            if e[kind] and e["slot"] is not None and not (kind == "teacher" and e["teacher"] == "TBD"):
                bucket.setdefault((e["day"], e["slot"], e[kind]), []).append(e)
        for (d, s, v), es in bucket.items():
            if len({(x["course_code"], x["section"]) for x in es}) > 1 and kind == "room":
                review.append(f"Room clash: {v} on {DAYS[d]} {SLOTS[s][0]}: " + ", ".join(x["course_code"] for x in es))
            if kind == "teacher" and len({(x["course_code"], x["section"], x["room"]) for x in es}) > 1:
                review.append(f"Teacher double-booked: {v} on {DAYS[d]} {SLOTS[s][0]}: " + ", ".join(x["course_code"] for x in es))

    meta = {"university": "BAIUST", "department": "Law", "semester": None, "effective_from": None}
    meta.update(parse_header(ocr(gray[: ys[0], :], psm=6)))
    foot = ocr(gray[ys[-1]:, :], psm=6)
    seed_hc = _load("headcounts.seed.json")
    hc = parse_headcounts(foot)
    if set(hc) != set(seed_hc):      # footer font is tiny; OCR often confuses I / II. Never publish a wrong number.
        review.append(f"Head-counts: OCR gave {hc or 'nothing'} - used data/headcounts.seed.json, please verify against the PDF footer")
        hc = seed_hc
    meta.update(headcounts=hc, days=DAYS,
                slots=[{"id": i, "start": a, "end": b} for i, (a, b) in enumerate(SLOTS)],
                source_file=Path(pdf).name, generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))

    if len(pages) > 1:                                   # faculty legend: seed is authoritative, OCR flags new initials
        text = ocr(pages[1], psm=6)
        for tok in sorted(set(re.findall(r"\(\s*([A-Z]{2,4})\s*\)", text)) - set(faculty)):
            review.append(f"Faculty page lists initial '{tok}' not in faculty.seed.json - add it")
    used = {e["teacher"] for e in classes if e["teacher"]}
    for t in sorted(used - known):
        faculty[t] = {"name": t, "title": "", "group": "Unknown"}

    if debug_dir:
        Path(debug_dir).mkdir(parents=True, exist_ok=True)
        dbg = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        for x in xs: cv2.line(dbg, (x, ys[0]), (x, ys[-1]), (0, 0, 255), 4)
        for y in ys: cv2.line(dbg, (xs[0], y), (xs[-1], y), (0, 0, 255), 4)
        for b in grid.banners: cv2.rectangle(dbg, (b[0], b[1]), (b[2], b[3]), (255, 0, 0), 5)
        cv2.imwrite(str(Path(debug_dir) / "grid.png"), cv2.resize(dbg, None, fx=0.4, fy=0.4))

    for e in classes:
        e.pop("duplicate", None)
    return {"meta": meta, "teachers": faculty, "classes": classes, "vacant_rooms": vacant, "review": review}

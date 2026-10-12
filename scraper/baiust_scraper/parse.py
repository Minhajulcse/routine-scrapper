"""Turn OCR text of one timetable cell into structured class entries.

Entry shape on the sheet (all parts optional except the code):
    04211102 (Sec A) #309 (DKR) 1-I        *02322106 (Sec B) #405 (SHA) 2-I
    LAW 3208 #301 (TT) 3-II                04212205# 302 (SBF) 2-II
    *LAW 4207 #409 (SH) 4-II (2 Class from 1:00-5:00)
"""
from __future__ import annotations
import re

ROMAN = {1: "I", 2: "II"}
ENTRY_START = re.compile(r"(?<!\*)(?=\*?\s*(?:\d{8}|(?:LAW|GED)\s?\d{4})(?!\d))")
CODE_RE = re.compile(r"(\*?)\s*(\d{8}|(?:LAW|GED)\s?\d{4})(?!\d)")
SEC_RE = re.compile(r"\(?\s*Sec\.?\s*([AB])\s*\)?", re.I)
ROOM_RE = re.compile(r"#\s*(\d{3})")
TEACHER_RE = re.compile(r"\(\s*(?!Sec)([A-Z]{2,4})\s*\)")
BATCH_RE = re.compile(r"([1-4])\s*-\s*([Il1!|]+)")      # OCR confuses I / l / 1 / ! / |
RANGE_RE = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})")


def code_to_batch(code: str) -> tuple[int, str] | None:
    """Last four digits of a course code are <year><semester><nn>: 04212101 -> 2-I, LAW 3209 -> 3-II."""
    digits = re.sub(r"\D", "", code)[-4:]
    y, s = int(digits[0]), int(digits[1])
    return (y, ROMAN[s]) if 1 <= y <= 4 and s in ROMAN else None


def _hhmm(h: str, m: str) -> str:
    h = int(h)
    h = h + 12 if h < 8 else h          # 1:00 -> 13:00
    return f"{h:02d}:{m}"


def split_entries(text: str) -> list[str]:
    flat = re.sub(r"\s+", " ", text.replace("\n", " ")).strip()
    return [p.strip() for p in ENTRY_START.split(flat) if CODE_RE.search(p)]


def parse_entry(raw: str, known_teachers: set[str] | None = None) -> dict | None:
    m = CODE_RE.search(raw)
    if not m:
        return None
    star, code = m.group(1), re.sub(r"\s", "", m.group(2))
    rest = raw[m.end():]
    warnings: list[str] = []

    sec = SEC_RE.search(rest)
    room = ROOM_RE.search(rest)
    teacher = TEACHER_RE.search(rest)
    tail = rest[teacher.end():] if teacher else rest
    batch_m = BATCH_RE.search(tail) or BATCH_RE.search(rest)

    ocr_batch = None
    if batch_m:
        ocr_batch = (int(batch_m.group(1)), ROMAN[min(len(batch_m.group(2)), 2)])
    derived = code_to_batch(code)
    batch = derived or ocr_batch
    if derived and ocr_batch and derived != ocr_batch:
        warnings.append(f"batch OCR '{ocr_batch[0]}-{ocr_batch[1]}' != code-derived '{derived[0]}-{derived[1]}' (used code-derived)")
    if not batch:
        warnings.append("batch not found")
    if not room:
        warnings.append("room not found")
    t = teacher.group(1) if teacher else None
    if not t:
        warnings.append("teacher not found")
    elif known_teachers and t not in known_teachers:
        warnings.append(f"unknown teacher '{t}'")

    note, rng = None, RANGE_RE.search(rest)
    start = end = None
    if rng:
        start, end = _hhmm(rng.group(1), rng.group(2)), _hhmm(rng.group(3), rng.group(4))
        note = f"Double class {start}-{end}"

    return {
        "course_code": code,
        "section": sec.group(1).upper() if sec else None,
        "room": room.group(1) if room else None,
        "teacher": t,
        "batch": f"{batch[0]}-{batch[1]}" if batch else None,
        "year": batch[0] if batch else None,
        "semester": batch[1] if batch else None,
        "starred": bool(star) and not code.startswith("LAW"),   # "*" on the sheet (the banner's * is just emphasis)
        "start": start, "end": end, "note": note,
        "warnings": warnings, "raw": raw,
    }


def parse_cell(text: str, known_teachers: set[str] | None = None) -> list[dict]:
    return [e for e in (parse_entry(p, known_teachers) for p in split_entries(text)) if e]


VR_RE = re.compile(r"((?:\d{3}\s*[,;]?\s*)+)\(\s*([^)]*)\)")
DAY_ABBR = {"S": 0, "M": 1, "TU": 2, "W": 3, "TH": 4}


def parse_vacant(text: str) -> dict[int, list[str]]:
    """'303, 405, 409 (S), 302 (S, W)' -> {0: [...], 3: [...]} (day index -> free rooms)."""
    flat = re.sub(r"\s+", " ", text.replace("\n", " "))
    out: dict[int, list[str]] = {}
    for rooms, days in VR_RE.findall(flat):
        room_list = re.findall(r"\d{3}", rooms)
        for d in re.split(r"[,; ]+", days.strip()):
            idx = DAY_ABBR.get(d.strip().upper())
            if idx is not None:
                out.setdefault(idx, [])
                out[idx] += [r for r in room_list if r not in out[idx]]
    return out

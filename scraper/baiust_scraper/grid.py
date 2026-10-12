"""Render PDF pages, detect the timetable grid with OpenCV and OCR each cell."""
from __future__ import annotations
from dataclasses import dataclass, field
import cv2
import numpy as np
import pytesseract


def render_pages(pdf_path: str, dpi: int = 300) -> list[np.ndarray]:
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        return [np.array(p.to_image(resolution=dpi).original.convert("L")) for p in pdf.pages]


def _group(idx: np.ndarray, gap: int = 8) -> list[int]:
    if len(idx) == 0:
        return []
    out, start, prev = [], idx[0], idx[0]
    for v in idx[1:]:
        if v - prev > gap:
            out.append(int((start + prev) // 2)); start = v
        prev = v
    out.append(int((start + prev) // 2))
    return out


@dataclass
class Grid:
    xs: list[int]                       # column boundaries
    ys: list[int]                       # full-width row boundaries
    banners: list[tuple[int, int, int, int]] = field(default_factory=list)  # x0,y0,x1,y1 merged boxes


def detect_grid(gray: np.ndarray) -> Grid:
    h, w = gray.shape
    bw = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 25, 15)
    hmask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (w // 20, 1)))
    vmask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, h // 25)))
    xs = _group(np.where(vmask.sum(0) > h * 255 * 0.12)[0])
    cand = _group(np.where(hmask.sum(1) > w * 255 * 0.15)[0])
    width = xs[-1] - xs[0]
    full, partial = [], []
    for y in cand:
        cols = np.where(hmask[max(0, y - 3):y + 4].any(0))[0]
        a, b = int(cols.min()), int(cols.max())
        (full if (b - a) >= 0.9 * width else partial).append((y, a, b))
    ys = [y for y, _, _ in full]
    banners = []
    for y, a, b in partial:   # a partial line closes a merged box that starts at the row top
        above = [r for r in ys if r < y]
        if above:
            banners.append((a, above[-1], b, y))
    return Grid(xs, ys, banners)


def ocr(img: np.ndarray, psm: int = 6) -> str:
    if img.size == 0:
        return ""
    img = cv2.resize(img, None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
    return pytesseract.image_to_string(img, config=f"--oem 1 --psm {psm}")


def crop(gray: np.ndarray, x0: int, y0: int, x1: int, y1: int, pad: int = 7) -> np.ndarray:
    return gray[y0 + pad:y1 - pad, x0 + pad:x1 - pad]

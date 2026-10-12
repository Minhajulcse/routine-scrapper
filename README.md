# BAIUST Routine

Scanned class-routine PDF → structured JSON/SQLite → mobile-only PWA.
Built for the *Dept. of Law, Fall 2026* layout (`Day | 9:00–10:30 | 10:30–12:00 | 12:00–1:30 | Break | 2:00–3:30 | 3:30–5:00`).

```
baiust-routine/
├── scraper/                      Python (OCR pipeline)
│   ├── baiust_scraper/
│   │   ├── grid.py               render PDF → detect table lines (OpenCV) → OCR cells (Tesseract)
│   │   ├── parse.py              cell text → entries; vacant-room parser; OCR-noise repair
│   │   ├── pipeline.py           orchestration, validation, clash detection, review list
│   │   ├── export.py             JSON + SQLite writers
│   │   └── cli.py
│   ├── data/
│   │   ├── faculty.seed.json     initial → name/title/group (authoritative; page 2 of the PDF)
│   │   ├── headcounts.seed.json  fallback if footer OCR is inconsistent
│   │   ├── course_names.json     optional {"04211102": "Course title"} – shown on cards when present
│   │   └── sample-fall-2026.pdf
│   └── tests/test_parse.py
└── web/                          static PWA, no build step, phone layout only
    ├── index.html  styles.css  app.js  export.js  sw.js  manifest.webmanifest
    └── data/routine.json         ← scraper output
```

## Run

```bash
# 1. scraper  (needs the tesseract binary: apt install tesseract-ocr | brew install tesseract)
cd scraper
pip install -r requirements.txt
python -m baiust_scraper.cli data/sample-fall-2026.pdf --out ../web/data/routine.json --db routine.db --debug-dir debug
PYTHONPATH=. python tests/test_parse.py          # or: pytest

# 2. app
cd ../web && python -m http.server 8000          # open on your phone: http://<your-ip>:8000
```
Deploy `web/` to any static host (Netlify, Vercel, GitHub Pages). It works offline after the first load.

## Downloading the routine (PDF / image)
Pick a class / teacher / room, then tap the gold **PDF** button (top right). A preview opens; choose **Download PDF**, **Save as image**, or **Share**.
The page is A4 portrait: BAIUST logo header, a `Day | Course | Time Slot | Room | Teacher` table with merged day cells, and a **FACULTY** list underneath.
It is generated in the browser by `web/export.js` (no libraries, works offline). The table header colour is the `ACCENT` constant at the top of that file.

## Mobile only
On screens ≥700px wide with a mouse, the app is replaced by a "Made for phones" notice (see `#gate` in `styles.css`). The PWA manifest is locked to portrait.

## Field mapping

| On the sheet | Field | Notes |
|---|---|---|
| `04211102`, `LAW 3208`, `GED 3209` | `course_code` | |
| `(Sec A)` / `Sec A` | `section` | `null` when the class is for the whole batch |
| `#309`, `04212205# 302` | `room` | |
| `(DKR)` | `teacher` | looked up in `faculty.seed.json` |
| `1-I`, `2-II` | `batch`, `year`, `semester` | |
| leading `*` | `starred` | all starred rows are taught by inter-department faculty or TBD |
| `(2 Class from 1:00-5:00)` | `start`/`end`, `note` | merged banner cell spanning the break column |
| `VR` row | `vacant_rooms[]` | `{day, slot, rooms}`; powers the Rooms tab |

## How the scraper stays accurate

The PDF is a **scan** (no text layer), so the old `pdftotext` approach can't work.

* **Grid, not coordinates.** Table lines are found with morphological filtering; partial horizontal lines are treated as merged cells (the Monday "double class" banner).
* **Self-correcting year/semester.** OCR confuses `I`/`II`/`1`/`!`. But a course code's last four digits are `<year><semester><nn>` (`04212101` → 2-I, `LAW 3209` → 3-II), so the code wins and OCR disagreements are resolved automatically.
* **Review list.** The CLI prints anything it can't trust: missing room/teacher, unknown initials, room clashes, teacher double-bookings. Fix the source/seed files and re-run; don't edit the JSON by hand.
* Verified on the sample: all 25 day×slot cells match the PDF (123 classes), A/B sections have equal counts.

## New semester checklist
1. Run the CLI on the new PDF; read the review list.
2. Add any new teachers to `faculty.seed.json` (the run warns when page 2 lists an unknown initial).
3. Check `headcounts.seed.json` if the footer changed.
4. Replace `web/data/routine.json` and bump `V` in `web/sw.js`.

## Limitations
Layout is assumed to be 5 days × 5 slots + break + VR row (it aborts with a clear error if the detected grid differs). Course titles aren't in the PDF — fill `course_names.json` if you want them on the cards.

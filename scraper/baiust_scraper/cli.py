from __future__ import annotations
import argparse
from pathlib import Path
from .export import to_json, to_sqlite
from .pipeline import run


def main() -> None:
    ap = argparse.ArgumentParser(description="Scrape a scanned BAIUST routine PDF into JSON/SQLite")
    ap.add_argument("pdf")
    ap.add_argument("--out", default="../web/data/routine.json", help="JSON output (consumed by the web app)")
    ap.add_argument("--db", default="routine.db", help="SQLite output ('' to skip)")
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--debug-dir", help="write grid overlay image here for visual checking")
    a = ap.parse_args()
    data = run(a.pdf, a.dpi, a.debug_dir)
    to_json(data, Path(a.out))
    if a.db:
        to_sqlite(data, Path(a.db))
    print(f"{len(data['classes'])} classes, {sum(len(v['rooms']) for v in data['vacant_rooms'])} vacant-room slots -> {a.out}")
    if data["review"]:
        print(f"\n{len(data['review'])} items need a human look:")
        for r in data["review"]:
            print(" -", r)


if __name__ == "__main__":
    main()

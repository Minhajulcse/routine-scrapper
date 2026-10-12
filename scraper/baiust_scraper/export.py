from __future__ import annotations
import json, sqlite3
from pathlib import Path


def to_json(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def to_sqlite(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    db = sqlite3.connect(path)
    db.executescript("""
    CREATE TABLE teachers(initial TEXT PRIMARY KEY, name TEXT, title TEXT, grp TEXT);
    CREATE TABLE classes(id TEXT PRIMARY KEY, day INT, day_name TEXT, slot INT, start TEXT, end TEXT,
      course_code TEXT, course_name TEXT, section TEXT, room TEXT, teacher TEXT REFERENCES teachers(initial),
      batch TEXT, year INT, semester TEXT, starred INT, note TEXT);
    CREATE TABLE vacant_rooms(day INT, slot INT, room TEXT);
    CREATE INDEX ix_c_batch ON classes(batch, section); CREATE INDEX ix_c_room ON classes(room);
    CREATE INDEX ix_c_teacher ON classes(teacher);
    """)
    db.executemany("INSERT INTO teachers VALUES(?,?,?,?)",
                   [(k, v["name"], v["title"], v["group"]) for k, v in data["teachers"].items()])
    cols = ["id", "day", "day_name", "slot", "start", "end", "course_code", "course_name", "section", "room",
            "teacher", "batch", "year", "semester", "starred", "note"]
    db.executemany(f"INSERT INTO classes VALUES({','.join('?' * len(cols))})",
                   [tuple(c[k] for k in cols) for c in data["classes"]])
    db.executemany("INSERT INTO vacant_rooms VALUES(?,?,?)",
                   [(v["day"], v["slot"], r) for v in data["vacant_rooms"] for r in v["rooms"]])
    db.commit(); db.close()

from baiust_scraper.parse import parse_cell, parse_vacant, split_entries

def one(t):
    r = parse_cell(t); assert len(r) == 1, r; return r[0]

def test_basic():
    e = one("04211102 (Sec A) #309 (DKR) 1-I")
    assert (e["course_code"], e["section"], e["room"], e["teacher"], e["batch"]) == ("04211102", "A", "309", "DKR", "1-I")

def test_ocr_roman_noise_uses_code():
    assert one("04211203 (Sec B) #303 (SBA) 1-11")["batch"] == "1-II"
    assert one("04213101 #301 (NIN) 3-!")["batch"] == "3-I"
    assert one("LAW 4210 #309 (TT) 4-I1")["batch"] == "4-II"

def test_hash_after_code_and_no_section():
    e = one("04212205# 302 (SBF) 2-II")
    assert e["room"] == "302" and e["section"] is None and e["teacher"] == "SBF"

def test_sec_without_parens_and_star():
    e = one("*02322106 (Sec B) #405 (SHA) 2-I")
    assert e["starred"] and e["section"] == "B"
    assert not one("04211102 (Sec A) #309 (DKR) 1-I")["starred"]
    assert one("04212101 Sec A # 406 (SR) 2-I")["room"] == "406"

def test_wrapped_line_and_multi():
    assert len(split_entries("04212103 (Sec B) #405 (SBF) 2-\nI\n04212207 #301 (MSA) 2-II")) == 2

def test_double_class_banner():
    e = one("*LAW 4207 #409 (SH) 4-II (2 Class from 1:00-5:00)")
    assert (e["start"], e["end"], e["teacher"]) == ("13:00", "17:00", "SH") and not e["starred"]

def test_vacant():
    v = parse_vacant("301,309,406 (S, M, Tu, W, Th), 303 (S, M, W), 302 (S, W)")
    assert v[0] == ["301", "309", "406", "303", "302"] and v[2] == ["301", "309", "406"]


if __name__ == "__main__":      # run without pytest: python -m tests.test_parse
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)

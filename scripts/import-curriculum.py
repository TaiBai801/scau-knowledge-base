#!/usr/bin/env python3
"""把培养方案课程数据固化为 data/curriculum.json。

数据来源：
  1. 课程任务分配表.xlsx（项目根目录）—— 346 条课程记录，仅覆盖 4 个专业
  2. majors/<slug>/<year>/index.md —— 11 个年级的学分/学时/课程数汇总

只用 Python 标准库，可重复运行（输出稳定、幂等）。
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
XLSX_PATH = ROOT / "课程任务分配表.xlsx"
SHEET_PATH = "xl/worksheets/sheet1.xml"
OUT_PATH = ROOT / "data" / "curriculum.json"

# 固定值，避免每次运行都改写 importedAt 导致输出不稳定
IMPORTED_AT = "2026-10-17"

EXPECTED_TOTAL = 346
EXPECTED_BY_MAJOR = {
    "电子科学与技术": 93,
    "电气工程及其自动化": 85,
    "农业机械化及其自动化": 82,
    "农业工程": 86,
}

SLUG_TO_MAJOR = {
    "dianzikexue": "电子科学与技术",
    "dianqigongcheng": "电气工程及其自动化",
    "nongyejixiehua": "农业机械化及其自动化",
    "nongyegongcheng": "农业工程",
    "jiqirengongcheng": "机器人工程",
}

# 表头列序：序号 | 专业 | 学期 | 课程名称 | 学分 | 性质 | 负责人 | 状态 | 备注
COLUMNS = {
    "A": "seq",
    "B": "major",
    "C": "semester",
    "D": "name",
    "E": "credits",
    "F": "category",
    "G": "owner",
    "H": "status",
    "I": "note",
}

SEMESTER_COUNT = 8

ROW_RE = re.compile(r"<row[^>]*>(.*?)</row>", re.S)
# 自闭合空单元格 <c r="G2" ... /> 必须一起匹配，否则列会错位
CELL_RE = re.compile(r"<c\b([^>]*?)(?:/>|>(.*?)</c>)", re.S)
CELL_REF_RE = re.compile(r'r="([A-Z]+)\d+"')
CELL_TYPE_RE = re.compile(r't="([^"]+)"')
VALUE_RE = re.compile(r"<v>(.*?)</v>", re.S)
TEXT_RE = re.compile(r"<t[^>]*>(.*?)</t>", re.S)

CARD_RE = re.compile(r'class="course-card"')
INDEX_SUMMARY_RE = re.compile(
    r"总学分\s*\*\*([\d.]+)\*\*\s*·\s*总学时\s*\*\*(\d+)\*\*\s*·\s*共\s*\*\*(\d+)\*\*\s*门课"
)

ENTITIES = (
    ("&lt;", "<"),
    ("&gt;", ">"),
    ("&quot;", '"'),
    ("&apos;", "'"),
    ("&amp;", "&"),
)


def unescape(text: str) -> str:
    for entity, char in ENTITIES:
        text = text.replace(entity, char)
    return text


def cell_text(inner: str, cell_type: str) -> str:
    """取单元格文本：inlineStr 走 <t>，数值走 <v>，其余按序退化。"""
    if not inner:
        return ""
    if cell_type != "inlineStr":
        match = VALUE_RE.search(inner)
        if match:
            return unescape(match.group(1)).strip()
    parts = TEXT_RE.findall(inner)
    return unescape("".join(parts)).strip()


def read_sheet() -> list[dict[str, str]]:
    with zipfile.ZipFile(XLSX_PATH) as archive:
        xml = archive.read(SHEET_PATH).decode("utf-8")

    table: list[dict[str, str]] = []
    for row in ROW_RE.findall(xml):
        record: dict[str, str] = {}
        for attrs, inner in CELL_RE.findall(row):
            ref = CELL_REF_RE.search(attrs)
            if not ref:
                continue
            key = COLUMNS.get(ref.group(1))
            if key is None:
                continue
            cell_type = CELL_TYPE_RE.search(attrs)
            record[key] = cell_text(inner or "", cell_type.group(1) if cell_type else "")
        table.append(record)
    return table


def build_entries(table: list[dict[str, str]]) -> list[dict]:
    if not table or table[0].get("seq") != "序号":
        raise SystemExit(f"[FATAL] 表头异常，第一行：{table[0] if table else '空'}")

    entries = []
    for raw in table[1:]:
        if not any(raw.values()):
            continue
        credits_raw = raw.get("credits", "")
        entries.append(
            {
                "seq": int(raw["seq"]),
                "major": raw.get("major", ""),
                "semester": raw.get("semester", ""),
                "name": raw.get("name", ""),
                "credits": float(credits_raw) if credits_raw else None,
                "category": raw.get("category", ""),
                "owner": raw.get("owner", ""),
                "status": raw.get("status", ""),
                "note": raw.get("note", ""),
            }
        )
    return entries


def validate_entries(entries: list[dict]) -> dict[str, int]:
    if len(entries) != EXPECTED_TOTAL:
        raise SystemExit(
            f"[FATAL] entries 数量不符：期望 {EXPECTED_TOTAL}，实际 {len(entries)}"
        )

    by_major = dict(Counter(entry["major"] for entry in entries))
    if by_major != EXPECTED_BY_MAJOR:
        raise SystemExit(
            "[FATAL] 专业分布不符\n"
            f"  期望：{EXPECTED_BY_MAJOR}\n"
            f"  实际：{by_major}"
        )

    seqs = [entry["seq"] for entry in entries]
    if seqs != list(range(1, EXPECTED_TOTAL + 1)):
        raise SystemExit(f"[FATAL] 序号不连续：首 {seqs[0]} 末 {seqs[-1]}，共 {len(seqs)} 个")

    return by_major


def read_year_plans() -> list[dict]:
    plans = []
    for index_path in sorted((ROOT / "majors").glob("*/*/index.md")):
        slug = index_path.parent.parent.name
        year_dir = index_path.parent.name
        major = SLUG_TO_MAJOR.get(slug)
        if major is None:
            print(f"[WARN] 未知专业目录，已跳过：{index_path}", file=sys.stderr)
            continue

        text = index_path.read_text(encoding="utf-8")
        match = INDEX_SUMMARY_RE.search(text)
        if match is None:
            raise SystemExit(f"[FATAL] 无法解析汇总行：{index_path}")

        semester_counts = []
        for number in range(1, SEMESTER_COUNT + 1):
            semester_path = index_path.parent / f"semester{number}.md"
            if semester_path.exists():
                semester_counts.append(
                    len(CARD_RE.findall(semester_path.read_text(encoding="utf-8")))
                )
            else:
                semester_counts.append(0)

        course_count = int(match.group(3))
        if sum(semester_counts) != course_count:
            print(
                f"[WARN] {slug}/{year_dir}：index 写 {course_count} 门，"
                f"学期卡片合计 {sum(semester_counts)} 门",
                file=sys.stderr,
            )

        plans.append(
            {
                "slug": slug,
                "major": major,
                "year": int(year_dir),
                "courseCount": course_count,
                "credits": float(match.group(1)),
                "hours": int(match.group(2)),
                "semesterCourseCounts": semester_counts,
            }
        )
    return plans


def main() -> int:
    entries = build_entries(read_sheet())
    by_major = validate_entries(entries)
    year_plans = read_year_plans()

    payload = {
        "version": 1,
        "source": "课程任务分配表.xlsx + majors/*/<year>/index.md",
        "importedAt": IMPORTED_AT,
        "note": "346 条仅覆盖 4 个专业；机器人工程尚未纳入课程任务分配表，故对外展示为 346+",
        "entries": entries,
        "byMajor": by_major,
        "yearPlans": year_plans,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"OK  {OUT_PATH.relative_to(ROOT)}")
    print(f"    entries: {len(entries)}")
    print("    byMajor:")
    for major, count in by_major.items():
        print(f"      {major}: {count}")
    print(f"    yearPlans: {len(year_plans)}")
    print("      slug/year   courseCount  sum(semesters)  match")
    for plan in year_plans:
        total = sum(plan["semesterCourseCounts"])
        flag = "OK" if total == plan["courseCount"] else "MISMATCH"
        print(
            f"      {plan['slug']}/{plan['year']}  {plan['courseCount']:>8}  {total:>14}  {flag}"
        )
    print(f"    size: {OUT_PATH.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

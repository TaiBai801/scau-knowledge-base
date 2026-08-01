import pandas as pd, os, re

base = r'C:\Users\ASUS1\Downloads'
out = r'D:\培养方案拓展\majors'

files_spec = {
    ('dianzikexue', 2024): os.path.join(base, '电子科学与技术2024.xls'),
    ('dianzikexue', 2025): os.path.join(base, '电子科学与技术2025.xls'),
    ('dianzikexue', 2026): os.path.join(base, '电子科学与技术2026.xls'),
    ('dianqigongcheng', 2024): os.path.join(base, '电气工程及其自动化2024.xls'),
    ('dianqigongcheng', 2025): os.path.join(base, '电气工程及其自动化2025.xls'),
    ('dianqigongcheng', 2026): os.path.join(base, '电气工程及其自动化2026.xls'),
    ('nongyejixiehua', 2024): os.path.join(base, '农业机械化及其自动化2024.xls'),
    ('nongyejixiehua', 2025): os.path.join(base, '农业机械化及其自动化2025.xls'),
    ('nongyegongcheng', 2024): os.path.join(base, '农业工程2024.xls'),
    ('nongyegongcheng', 2025): os.path.join(base, '农业工程2025.xls'),
    ('jiqirengongcheng', 2026): os.path.join(base, '机器人工程2026.xls'),
}

major_names = {
    'dianzikexue': '电子科学与技术',
    'dianqigongcheng': '电气工程及其自动化',
    'nongyejixiehua': '农业机械化及其自动化',
    'nongyegongcheng': '农业工程',
    'jiqirengongcheng': '机器人工程',
}

sem_cols = ['一','二','三','四','五','六','七','八','九','十']

# ── Load all courses ──
rows = []
for (major, year), path in files_spec.items():
    df = pd.read_excel(path, header=0)
    for _, r in df.iterrows():
        semester = int(r['执行学期']) if pd.notna(r['执行学期']) else None
        sems = {}
        for i, sc in enumerate(sem_cols):
            if pd.notna(r[sc]):
                sems[i+1] = int(r[sc])
        rows.append({
            'major': major, 'year': year,
            'code': str(int(r['课程编号'])),
            'name': str(r['课程名称']).strip(),
            'name_en': str(r['英文名称']).strip() if pd.notna(r['英文名称']) else '',
            'type': str(r['课程性质']).strip(),
            'system': str(r['课程体系']).strip(),
            'credits': float(r['学分']) if pd.notna(r['学分']) else 0,
            'total_hours': int(r['总学时']) if pd.notna(r['总学时']) else 0,
            'lecture': int(r['讲课']) if pd.notna(r['讲课']) else 0,
            'lab': int(r['实验']) if pd.notna(r['实验']) else 0,
            'practice': float(r['实践']) if pd.notna(r['实践']) else 0,
            'self_study': int(r['自修']) if pd.notna(r['自修']) else 0,
            'semester': semester, 'sem_hours': dict(sems),
        })

courses = pd.DataFrame(rows)

# ── Classify courses ──
SPECIAL_KEYWORDS = ['毕业', '军训', '实习', '教学实习', '课程设计', '综合实践', '劳动教育']

def is_special(name):
    nm = str(name)
    for kw in SPECIAL_KEYWORDS:
        if kw in nm:
            return True
    return False

def is_shared_course(code):
    mcnt = code_info[code_info['code'] == code].iloc[0]['mcount']
    sys_str = code_info[code_info['code'] == code].iloc[0]['all_systems']
    return mcnt >= 2 and any(s in sys_str for s in ['通识必修','通识实践','专业基础课'])

# Build code registry
code_info = courses.groupby('code').agg(
    name=('name','first'),
    mcount=('major','nunique'),
    all_systems=('system', lambda x: '|'.join(set(x))),
    all_types=('type', lambda x: '|'.join(set(x))),
).reset_index()

shared_codes = set()
special_codes = set()
for _, r in code_info.iterrows():
    if is_special(r['name']):
        special_codes.add(r['code'])
    elif is_shared_course(r['code']):
        shared_codes.add(r['code'])

# everything else goes to shared too but as "专业课程"
other_codes = set(code_info['code']) - shared_codes - special_codes

print(f'Shared (通识/基础, >=2 majors): {len(shared_codes)}')
print(f'Special (毕业/实习/军训): {len(special_codes)}')
print(f'Other (专业课程): {len(other_codes)}')

# Ensure dirs
for d in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng','shared']:
    os.makedirs(os.path.join(out, d), exist_ok=True)

# ── 1. Shared course pages (通识/基础/其他) ──
sc = 0
for code in shared_codes | other_codes:
    group = courses[courses['code'] == code]
    first = group.iloc[0]
    filepath = os.path.join(out, 'shared', f'{code}.md')

    offering_rows = []
    for _, row in group.iterrows():
        offering_rows.append(f'| {row["year"]} | {major_names[row["major"]]} | {row["semester"]} | {row["credits"]} | {int(row["total_hours"])} |')

    is_shared_marker = '🔗 共同必修课' if code in shared_codes else ''

    md = f'''---
course_code: {code}
course_name: {first["name"]}
---

# {first["name"]} {is_shared_marker}

> **课程编号**: {code} · **英文名称**: {first["name_en"]}

## 基本信息

| 项目 | 值 |
|------|-----|
| 课程性质 | {first["type"]} |
| 课程体系 | {first["system"]} |
| 学分 | {first["credits"]} |
| 总学时 | {int(first["total_hours"])}h |
| 讲课 | {first["lecture"]}h · 实验 | {first["lab"]}h · 实践 | {first["practice"]}h · 自修 | {first["self_study"]}h |

## 开课信息

| 年级 | 专业 | 学期 | 学分 | 学时 |
|------|------|:--:|:--:|:--:|
{chr(10).join(offering_rows)}

## 课程资料

> 📂 资料建设中，欢迎[投稿](/contribute)。

'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md)
    sc += 1

print(f'Shared pages: {sc}')

# ── 2. Special course pages (per major/year, no download area) ──
sp = 0
for code in special_codes:
    group = courses[courses['code'] == code]
    first = group.iloc[0]
    for _, row in group.iterrows():
        mdir = os.path.join(out, row['major'], str(row['year']))
        os.makedirs(mdir, exist_ok=True)
        safe_name = first['name'].replace('/', '-').replace('(', '').replace(')', '')
        fp = os.path.join(mdir, f'{code}.md')

        md = f'''---
title: {first["name"]}
---

# {first["name"]}

> **课程编号**: {code} · {row["year"]} 级 · {major_names[row["major"]]}

## 基本信息

| 项目 | 值 |
|------|-----|
| 课程性质 | {row["type"]} |
| 课程体系 | {row["system"]} |
| 学分 | {row["credits"]} |
| 开课学期 | 第 {row["semester"]} 学期 |

> 📌 本课程为实践环节，无需教材和试卷资料。
'''
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(md)
        sp += 1

print(f'Special pages: {sp}')

# ── 3. Semester pages ──
sem_count = 0
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    os.makedirs(mdir, exist_ok=True)
    total_credits = group['credits'].sum()
    total_hours = int(group['total_hours'].sum())

    for sem in range(1, 9):
        sem_courses = group[group['semester'] == sem]
        if len(sem_courses) == 0:
            continue

        sem_hours = int(sem_courses['total_hours'].sum())
        cards = []
        for _, c in sem_courses.iterrows():
            if c['code'] in special_codes:
                link = f'/majors/{major}/{year}/{c["code"]}'
            else:
                link = f'/majors/shared/{c["code"]}'

            type_class = 'required' if '必修' in str(c['type']) else 'elective' if '选修' in str(c['type']) else 'practice'
            cards.append(f'''  <a href="{link}" class="course-card">
    <div class="course-code">{c['code']}</div>
    <div class="course-title">{c['name']}</div>
    <div class="course-meta">
      <span class="badge-{type_class}">{c['type']}</span>
      <span class="course-info">{c['credits']}学分 · {int(c['total_hours'])}h · {c['system']}</span>
    </div>
  </a>''')

        md = f'''---
title: {major_names[major]} {year}级 第{sem}学期
---

# {major_names[major]} · {year} 级 · 第 {sem} 学期

> 📋 本学期 **{sem_hours}** 学时 · **{len(sem_courses)}** 门课

<div class="course-grid">

{chr(10).join(cards)}

</div>
'''
        fp = os.path.join(mdir, f'semester{sem}.md')
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(md)
        sem_count += 1

print(f'Semester pages: {sem_count}')

# ── 4. Year index ──
idx = 0
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    total_credits = group['credits'].sum()
    total_hours = int(group['total_hours'].sum())
    is_new = (year == 2026)
    note = ' *(2026 修订版)*' if is_new else ''

    rows_md = []
    for sem in range(1, 9):
        sg = group[group['semester'] == sem]
        if len(sg) == 0:
            continue
        types = set(sg['type'].values)
        rows_md.append(f'| [第 {sem} 学期](/majors/{major}/{year}/semester{sem}) | {len(sg)} | {sg["credits"].sum():.1f} | {int(sg["total_hours"].sum())} |')

    md = f'''---
title: {major_names[major]} {year}级
---

<div class="ardot-page-hero">
  <div class="ardot-page-inner">
    <span class="ardot-tag">{year} 级{note}</span>
    <h1>{major_names[major]}</h1>
    <p>总学分 **{total_credits:.1f}** · 总学时 **{total_hours}** · 共 **{len(group)}** 门课</p>
  </div>
</div>

<div class="ardot-page-content">
  <div class="ardot-page-inner">

## 学期课程

| 学期 | 课程数 | 学分 | 学时 |
|:--:|:--:|:--:|:--:|
{chr(10).join(rows_md)}

  </div>
</div>
'''
    fp = os.path.join(mdir, 'index.md')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(md)
    idx += 1

print(f'Year index pages: {idx}')

# ── 5. Major index (year selector) ──
for major, mgroup in courses.groupby('major'):
    years = sorted(mgroup['year'].unique())
    cards = []
    for y in years:
        yg = mgroup[mgroup['year'] == y]
        cred = yg['credits'].sum()
        hr = int(yg['total_hours'].sum())
        is_new = (y == 2026)
        note = ' *(修订版)*' if is_new else ''
        cards.append(f'''      <a href="/majors/{major}/{y}/" class="major-overview-card">
        <span class="moc-year">{y} 级{note}</span>
        <span class="moc-stats">{len(yg)} 门课 · {cred:.1f} 学分 · {hr} 学时</span>
      </a>''')

    md = f'''---
title: {major_names[major]}
---

<div class="ardot-page-hero">
  <div class="ardot-page-inner">
    <span class="ardot-tag">专业课程</span>
    <h1>{major_names[major]}</h1>
    <p>选择年级查看培养方案</p>
  </div>
</div>

<div class="ardot-page-content">
  <div class="ardot-page-inner">

<div class="major-year-grid">

{chr(10).join(cards)}

</div>

  </div>
</div>
'''
    fp = os.path.join(out, major, 'index.md')
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(md)

# ── 6. Shared index (only shared courses) ──
shared_list = sorted(shared_codes)
shared_links = []
for code in shared_list[:80]:
    info = courses[courses['code'] == code].iloc[0]
    shared_links.append(f'- [{info["name"]}](/majors/shared/{code}) · {info["credits"]}学分')

md = f'''---
title: 共享课程
---

<div class="ardot-page-hero">
  <div class="ardot-page-inner">
    <span class="ardot-tag">共同必修课</span>
    <h1>共享课程</h1>
    <p>通识必修 · 通识实践 · 专业基础课 — 共 **{len(shared_list)}** 门</p>
  </div>
</div>

<div class="ardot-page-content">
  <div class="ardot-page-inner">

{chr(10).join(shared_links)}

... 共 {len(shared_list)} 门

  </div>
</div>
'''
with open(os.path.join(out, 'shared', 'index.md'), 'w', encoding='utf-8') as f:
    f.write(md)

print(f'\\nDone! Shared={len(shared_list)}, Special={sp}, Sem={sem_count}, YearIdx={idx}')

import pandas as pd, os, json, urllib.parse

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

# ── Keep existing dirs (already cleaned) ──
os.makedirs(os.path.join(out, 'shared'), exist_ok=True)

for d in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng']:
    os.makedirs(os.path.join(out, d), exist_ok=True)

# ── 1. Generate shared course pages ──
code_groups = courses.groupby('code')
shared_count = 0
for code, group in code_groups:
    first = group.iloc[0]
    name_safe = first['name'].replace('/', '-').replace('\\', '-')
    filepath = os.path.join(out, 'shared', f'{code}.md')

    # Build offering table
    offering_rows = []
    for _, row in group.iterrows():
        offering_rows.append(f'| {row["year"]} | {major_names[row["major"]]} | {row["semester"]} | {row["credits"]} | {int(row["total_hours"])} |')

    md = f'''---
course_code: {code}
course_name: {first["name"]}
---

# {first["name"]}

> **课程编号**: {code} · **英文名称**: {first["name_en"]}

## 基本信息

| 项目 | 值 |
|------|-----|
| 课程性质| {first["type"]} |
| 课程体系 | {first["system"]} |
| 学分 | {first["credits"]} |
| 总学时 | {int(first["total_hours"])} |
| 讲课 | {first["lecture"]}h |
| 实验 | {first["lab"]}h |
| 实践 | {first["practice"]}h |
| 自修 | {first["self_study"]}h |

## 开课信息

| 年级 | 专业 | 学期 | 学分 | 学时 |
|------|------|:--:|:--:|:--:|
{chr(10).join(offering_rows)}

## 课程资料

> 📂 资料建设中，欢迎[投稿](/contribute)。

'''
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md)
    shared_count += 1

print(f'Shared pages: {shared_count}')

# ── 2. Generate semester pages ──
sem_count = 0
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    os.makedirs(mdir, exist_ok=True)

    total_credits = group['credits'].sum()
    total_hours = int(group['total_hours'].sum())
    is_new = (year == 2026)

    # Per semester
    for sem in range(1, 9):
        sem_courses = group[group['semester'] == sem]
        if len(sem_courses) == 0:
            continue

        sem_hours = int(sem_courses['total_hours'].sum())
        cards = []
        for _, c in sem_courses.iterrows():
            type_class = '必修' if '必修' in str(c['type']) else '选修' if '选修' in str(c['type']) else '其他'
            cards.append(f'''<a href="/majors/shared/{c['code']}" class="course-card">
  <div class="course-code">{c['code']}</div>
  <div class="course-title">{c['name']}</div>
  <div class="course-meta">
    <span class="badge-{type_class}">{c['type']}</span>
    <span>{c['credits']}学分 · {int(c['total_hours'])}学时</span>
  </div>
</a>''')

        md = f'''---
title: {major_names[major]} {year}级 · 第{sem}学期
---

> 📋 **{year} 级** · {major_names[major]} · 第 {sem} 学期
> 总学分 {total_credits:.1f} · 本学期 {sem_hours} 学时 · 共 {len(sem_courses)} 门课

<div class="course-grid">

{chr(10).join(cards)}

</div>
'''
        filepath = os.path.join(mdir, f'semester{sem}.md')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(md)
        sem_count += 1

print(f'Semester pages: {sem_count}')

# ── 3. Generate year index (semester list) ──
idx_count = 0
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    total_credits = group['credits'].sum()
    total_hours = int(group['total_hours'].sum())
    is_new = (year == 2026)

    sem_cards = []
    for sem in range(1, 9):
        sem_courses = group[group['semester'] == sem]
        if len(sem_courses) == 0:
            continue
        sem_credits = sem_courses['credits'].sum()
        sem_hours = int(sem_courses['total_hours'].sum())
        labels = sem_courses['type'].unique()
        label_str = ' · '.join(labels[:3])
        sem_cards.append(f'| [{sem}](/majors/{major}/{year}/semester{sem}) | {len(sem_courses)} | {sem_credits:.1f} | {sem_hours} | {label_str} |')

    system_note = '**2026 修订版（新体系）**' if is_new else ''

    md = f'''---
title: {major_names[major]} {year}级
---

# {major_names[major]} · {year} 级

{system_note}

> 🎓 总学分 **{total_credits:.1f}** · 总学时 **{total_hours}** · 共 **{len(group)}** 门课

## 学期课程

| 学期 | 课程数 | 学分 | 学时 | 主要类型 |
|:--:|:--:|:--:|:--:|------|
{chr(10).join(sem_cards)}

'''
    filepath = os.path.join(mdir, 'index.md')
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md)
    idx_count += 1

print(f'Year index pages: {idx_count}')

# ── 4. Generate major index (year selector) ──
for major, mgroup in courses.groupby('major'):
    years = sorted(mgroup['year'].unique())
    cards = []
    for y in years:
        yg = mgroup[mgroup['year'] == y]
        cred = yg['credits'].sum()
        hr = int(yg['total_hours'].sum())
        is_new = (y == 2026)
        label = '**新体系**' if is_new else ''
        cards.append(f'''<a href="/majors/{major}/{y}/" class="major-overview-card">
  <div class="moc-year">{y} 级 {label}</div>
  <div class="moc-stats">{len(yg)} 门课 · {cred:.1f} 学分 · {hr} 学时</div>
</a>''')

    md = f'''---
title: {major_names[major]}
---

# {major_names[major]}

<div class="major-year-grid">

{chr(10).join(cards)}

</div>
'''
    filepath = os.path.join(out, major, 'index.md')
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(md)

# ── 5. Shared index ──
shared_codes = sorted(courses['code'].unique())
links = []
for c in shared_codes[:50]:  # sample
    info = courses[courses['code'] == c].iloc[0]
    links.append(f'- [{info["name"]}](/majors/shared/{c}) · {info["type"]} · {info["credits"]}学分')

md = f'''---
title: 共享课程
---

# 共享课程

> 📚 按课程编号聚合，跨年级跨专业共用链接。共 **{len(shared_codes)}** 门课程。

## 课程列表

{chr(10).join(links)}

... 共 {len(shared_codes)} 门

'''
with open(os.path.join(out, 'shared', 'index.md'), 'w', encoding='utf-8') as f:
    f.write(md)

print('\\nDone!')

import pandas as pd, os

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

SPECIAL_KEYWORDS = ['毕业', '军训', '实习', '教学实习', '课程设计', '综合实践', '劳动教育', '思政课社会实践', '创新创业实践', '实践Ⅰ', '实践Ⅱ', '实践Ⅲ', '实践Ⅳ']

# Old course materials (recovered from git history)
COS = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com/files'

MATERIALS = {
    'C语言程序设计': [
        ('机考复习题（2018-12）',f'{COS}/c-lang/C-exam-review-2018-12.pdf'),
        ('机考复习题',f'{COS}/c-lang/C-exam-1.doc'),
        ('机考复习题（2012-12）',f'{COS}/c-lang/C-exam-2012-12.doc'),
        ('机考复习题详解',f'{COS}/c-lang/C-exam-detailed.docx'),
        ('机考答案（2016-11）',f'{COS}/c-lang/C-exam-answers-2016-11.doc'),
    ],
    '高等数学AⅠ': [
        ('高等数学AI 测试题',f'{COS}/math/math-AI-exam-2.doc'),
        ('高等数学B1 模拟题',f'{COS}/math/math-B1-mock-1.doc'),
        ('清华大学数学测试题',f'{COS}/math/tsinghua-math-test.pdf'),
        ('高等数学A 复习资料',f'{COS}/math/math-A-review.pdf'),
    ],
    '大学英语AⅠ': [
        ('大学英语期末复习资料',f'{COS}/english/english-final-review.doc'),
    ],
    '中国近现代史纲要': [
        ('近代史知识点整理',f'{COS}/jindaishi/history-points.doc'),
        ('近代史全面复习',f'{COS}/jindaishi/jindaishi-full-review.doc'),
        ('近代史重点归纳',f'{COS}/jindaishi/jindaishi-key-points.doc'),
        ('近代史提纲',f'{COS}/jindaishi/jindaishi-outline.doc'),
        ('近代史历年真题',f'{COS}/jindaishi/jindaishi-past-exams.doc'),
        ('近代史题库',f'{COS}/jindaishi/jindaishi-question-bank.doc'),
        ('近代史复习资料1',f'{COS}/jindaishi/jindaishi-review-1.doc'),
        ('近代史复习资料2',f'{COS}/jindaishi/jindaishi-review.docx'),
    ],
    '思想道德与法治': [
        ('思修复习题答案',f'{COS}/sixiu/sixiu-exam-answers.zip'),
        ('思修期末考试复习',f'{COS}/sixiu/sixiu-final-review.docx'),
        ('思修选择题库',f'{COS}/sixiu/sixiu-mcq.doc'),
        ('思修模拟卷',f'{COS}/sixiu/sixiu-mock-18p.docx'),
        ('思修笔记',f'{COS}/sixiu/sixiu-notes.docx'),
        ('思修提纲',f'{COS}/sixiu/sixiu-outline.docx'),
    ],
    '马克思主义基本原理概论': [
        ('基本原理复习1',f'{COS}/basic/basic-review-2018-1.docx'),
        ('基本原理复习2',f'{COS}/basic/basic-review-2018.docx'),
    ],
    '电路分析': [
        ('电路分析期末复习',f'{COS}/大二上/电路分析/电路分析复习.pptx'),
    ],
    '自动控制原理': [
        ('试卷全大题答案（17页）',f'{COS}/大二下/自动控制原理/自动控制原理_试卷_全大题_完整答案（17页）.doc'),
        ('复习试题库20套',f'{COS}/大二下/自动控制原理/自动控制原理复习试题库20套.doc'),
        ('期末考试题（6页）',f'{COS}/大二下/自动控制原理/自动控制原理期末考试题（6页）.doc'),
        ('考试复习题（22页）',f'{COS}/大二下/自动控制原理/自动控制原理考试复习题（22页）.doc'),
        ('试卷及答案（31页）',f'{COS}/大二下/自动控制原理/自动控制原理试卷及答案（31页）.doc'),
        ('选择题（有答案）',f'{COS}/大二下/自动控制原理/自动控制原理选择题(48学时)有答案.doc'),
        ('习题集（含答案）',f'{COS}/大二下/自动控制原理/自动控制理论_习题集(含答案).doc'),
        ('复习题及答案',f'{COS}/大二下/自动控制原理/自控理论_复习题及答案.doc'),
    ],
    '数字电子技术': [
        ('模拟考题2025',f'{COS}/大二下/数字电子技术/数电模拟考题2025.pdf'),
        ('门电路及组合逻辑实验',f'{COS}/大二下/数字电子技术/还原Word_第2章门电路及组合逻辑电路实验.docx'),
    ],
    '信号与系统': [
        ('平时作业（选择判断题）',f'{COS}/大二下/信号与系统/信号与系统平时作业（选择判断题）.docx'),
        ('简答题2',f'{COS}/大二下/信号与系统/信号与系统简答题(2).pdf'),
        ('简答题参考',f'{COS}/大二下/信号与系统/信号简答题（不唯一，以老师课堂上讲的为主）.docx'),
        ('辅导课件1',f'{COS}/大二下/信号与系统/辅导课件(1).pptx'),
        ('辅导课件2',f'{COS}/大二下/信号与系统/辅导课件.pptx'),
    ],
    '大学物理B': [
        ('电磁学题',f'{COS}/大二上/电磁学/电磁学题.docx'),
        ('考点整理',f'{COS}/大二上/电磁学/考点.docx'),
    ],
}

def is_special(name):
    nm = str(name)
    return any(kw in nm for kw in SPECIAL_KEYWORDS)

code_info = courses.groupby('code').agg(
    name=('name','first'),
    mcount=('major','nunique'),
    all_systems=('system', lambda x: '|'.join(set(x))),
).reset_index()

def is_shared_course(code):
    r = code_info[code_info['code'] == code].iloc[0]
    return r['mcount'] >= 2 and any(s in r['all_systems'] for s in ['通识必修','通识实践','专业基础课'])

shared_codes = set()
special_codes = set()
for _, r in code_info.iterrows():
    if is_special(r['name']):
        special_codes.add(r['code'])
    elif is_shared_course(r['code']):
        shared_codes.add(r['code'])

# Clear dirs
for d in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng','shared']:
    p = os.path.join(out, d)
    if os.path.exists(p):
        import shutil
        shutil.rmtree(p, ignore_errors=True)
    os.makedirs(p, exist_ok=True)

# ── Shared course pages ──
sc = 0
for code in shared_codes | (set(code_info['code']) - special_codes - shared_codes):
    group = courses[courses['code'] == code]
    first = group.iloc[0]
    offering_rows = [f'| {r["year"]} | {major_names[r["major"]]} | {r["semester"]} | {r["credits"]} | {int(r["total_hours"])} |' for _, r in group.iterrows()]
    marker = ' 🔗 共同必修课' if code in shared_codes else ''
    # Build materials section if available
    mat_section = ''
    if first["name"] in MATERIALS:
        mat_rows = []
        for mname, murl in MATERIALS[first["name"]]:
            ext = murl.rsplit('.',1)[-1].upper()
            mat_rows.append(f'| {mname} | {ext} | [下载]({murl}) |')
        mat_section = f'''
## 📂 课程资料

| 文件名 | 格式 | 下载 |
|--------|------|------|
{chr(10).join(mat_rows)}
'''
    md = f'''---
course_code: {code}
course_name: {first["name"]}
---

# {first["name"]}{marker}

> **课程编号**: {code} · **英文名称**: {first["name_en"]} · **{first['credits']} 学分** · **{first['type']}** · **第 {first['semester']} 学期**

<a href="javascript:history.back()" class="back-link">← 返回</a>

## ① 课程介绍

| 项目 | 内容 |
|------|------|
| 课程名称 | {first["name"]} |
| 英文名称 | {first["name_en"]} |
| 课程编号 | {code} |
| 课程性质 | {first["type"]} |
| 课程体系 | {first["system"]} |
| 学分 | {first["credits"]} |
| 总学时 | {int(first["total_hours"])}h（讲课 {first["lecture"]}h · 实验 {first["lab"]}h · 实践 {first["practice"]}h） |

## ② 课程资料

{('| 文件名 | 格式 | 下载 |\n|--------|------|------|\n' + chr(10).join(f'| {mname} | {murl.rsplit(".",1)[-1].upper()} | [下载]({murl}) |' for mname, murl in MATERIALS[first["name"]])) if first["name"] in MATERIALS else '> 📂 资料建设中，欢迎[投稿](/contribute)。'}

## ③ 练习题

> ✏️ 整理中，欢迎[投稿](/contribute)。

## ④ 推荐资源

> 🚧 待老师推荐，[投稿入口](/contribute)。

## ⑤ 优秀学长「ta 说」

> 💬 招募中！如果你是学过本课程且成绩不错的同学，欢迎[投稿](/contribute)。

---

> 📩 [联系管理员](mailto:2286318767@qq.com)参与共建 · 🔄 内容同步自 [腾讯文档](https://docs.qq.com/space/DZXBYSkhnRXRwSWpv)
'''
    with open(os.path.join(out, 'shared', f'{code}.md'), 'w', encoding='utf-8') as f:
        f.write(md)
    sc += 1

# ── Special course pages (per major/year, no download) ──
sp = 0
for code in special_codes:
    group = courses[courses['code'] == code]
    first = group.iloc[0]
    for _, row in group.iterrows():
        mdir = os.path.join(out, row['major'], str(row['year']))
        os.makedirs(mdir, exist_ok=True)
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

# ── Semester pages ──
sem_count = 0
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    os.makedirs(mdir, exist_ok=True)
    for sem in range(1, 9):
        sem_courses = group[group['semester'] == sem]
        if len(sem_courses) == 0:
            continue
        sem_hours = int(sem_courses['total_hours'].sum())
        rows_md = []
        for _, c in sem_courses.iterrows():
            link = f'/majors/{major}/{year}/{c["code"]}' if c['code'] in special_codes else f'/majors/shared/{c["code"]}'
            type_class = 'required' if '必修' in str(c['type']) else 'elective' if '选修' in str(c['type']) else 'practice'
            rows_md.append(f'<a href="{link}" class="course-card"><div class="course-code">{c["code"]}</div><div class="course-title">{c["name"]}</div><div class="course-meta"><span class="badge-{type_class}">{c["type"]}</span><span class="course-info">{c["credits"]}学分 · {int(c["total_hours"])}h · {c["system"]}</span></div></a>')

        md = f'''---
title: {major_names[major]} {year}级 第{sem}学期
---

<div class="ardot-page-hero">
  <div class="ardot-page-inner">
    <span class="ardot-tag">第 {sem} 学期</span>
    <h1>{major_names[major]} · {year} 级</h1>
    <p>本学期 **{sem_hours}** 学时 · **{len(sem_courses)}** 门课</p>
  </div>
</div>

<div class="ardot-page-content">
  <div class="ardot-page-inner">

<div class="course-grid">
{chr(10).join(rows_md)}
</div>

  </div>
</div>
'''
        with open(os.path.join(mdir, f'semester{sem}.md'), 'w', encoding='utf-8') as f:
            f.write(md)
        sem_count += 1

# ── Year index pages (PURE MARKDOWN - works in VitePress) ──
for (major, year), group in courses.groupby(['major','year']):
    mdir = os.path.join(out, major, str(year))
    total_credits = group['credits'].sum()
    total_hours = int(group['total_hours'].sum())
    is_new = (year == 2026)
    note = ''

    rows_md = []
    for sem in range(1, 9):
        sg = group[group['semester'] == sem]
        if len(sg) == 0:
            continue
        rows_md.append(f'| [第 {sem} 学期](/majors/{major}/{year}/semester{sem}) | {len(sg)} | {sg["credits"].sum():.1f} | {int(sg["total_hours"].sum())} |')

    md = f'''---
title: {major_names[major]} {year}级
---

# {major_names[major]} · {year} 级{note}

> 📋 总学分 **{total_credits:.1f}** · 总学时 **{total_hours}** · 共 **{len(group)}** 门课

## 学期课程

| 学期 | 课程数 | 学分 | 学时 |
|:--:|:--:|:--:|:--:|
{chr(10).join(rows_md)}
'''
    with open(os.path.join(mdir, 'index.md'), 'w', encoding='utf-8') as f:
        f.write(md)

# ── Major index (PURE MARKDOWN - works in VitePress) ──
for major, mgroup in courses.groupby('major'):
    years = sorted(mgroup['year'].unique())
    rows_md = []
    for y in years:
        yg = mgroup[mgroup['year'] == y]
        cred = yg['credits'].sum()
        hr = int(yg['total_hours'].sum())
        is_new = (y == 2026)
        note = ''
        rows_md.append(f'| [{y} 级{note}](/majors/{major}/{y}/) | {len(yg)} | {cred:.1f} | {hr} |')

    md = f'''---
title: {major_names[major]}
---

# {major_names[major]}

> 🎓 选择年级查看培养方案

## 年级一览

| 年级 | 课程数 | 学分 | 学时 |
|:--:|:--:|:--:|:--:|
{chr(10).join(rows_md)}
'''
    with open(os.path.join(out, major, 'index.md'), 'w', encoding='utf-8') as f:
        f.write(md)

# ── Shared index (pure markdown) ──
shared_list = sorted(shared_codes)
shared_md = []
for code in shared_list[:80]:
    info = courses[courses['code'] == code].iloc[0]
    shared_md.append(f'- [{info["name"]}](/majors/shared/{code}) · {info["credits"]}学分 · {info["system"]}')

md = f'''---
title: 共享课程
---

# 共享课程

> 📚 通识必修 · 通识实践 · 专业基础课 — 共 **{len(shared_list)}** 门

{chr(10).join(shared_md)}

... 共 {len(shared_list)} 门
'''
with open(os.path.join(out, 'shared', 'index.md'), 'w', encoding='utf-8') as f:
    f.write(md)

print(f'Shared={sc}, Special={sp}, Semester={sem_count}')
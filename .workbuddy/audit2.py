import os, re, json, subprocess
from pathlib import Path

OUT = Path('D:/培养方案拓展')
DIST = OUT / '.vitepress' / 'dist'
issues = []

def add(severity, category, message, location=''):
    issues.append({'sev': severity, 'cat': category, 'msg': message, 'loc': location})

# ── 1. 验证学期页 hero 学时与卡片学时一致 ──
mismatch_count = 0
for major_dir in (OUT / 'majors').iterdir():
    if not major_dir.is_dir():
        continue
    for year_dir in sorted(major_dir.iterdir()):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        for sem_file in sorted(year_dir.glob('semester*.md')):
            txt = sem_file.read_text(encoding='utf-8')
            # Hero stats
            hero_m = re.search(r'本学期 \*\*(\d+)\*\* 学时 · \*\*(\d+)\*\* 门课', txt)
            cards = re.findall(r'class="course-card"', txt)
            if hero_m:
                hero_hours, hero_count = int(hero_m.group(1)), int(hero_m.group(2))
                if hero_count != len(cards):
                    add('HIGH', '一致性', f'{sem_file.relative_to(OUT)}: hero 写{hero_count}门但cards={len(cards)}')
                    mismatch_count += 1

# ── 2. 验证学期页所有链接都能解析 ──
broken_count = 0
for major_dir in (OUT / 'majors').iterdir():
    if not major_dir.is_dir():
        continue
    for year_dir in sorted(major_dir.iterdir()):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        for sem_file in sorted(year_dir.glob('semester*.md')):
            txt = sem_file.read_text(encoding='utf-8')
            # Find links
            for href in re.findall(r'href="(/majors/[^"]+)"', txt):
                # Check if target file exists
                target = (OUT / 'majors' / href.replace('/majors/','').rstrip('/')).with_suffix('.md')
                if not target.exists():
                    add('HIGH', '链接', f'{sem_file.relative_to(OUT)}: 链接 {href} → {target.name} 不存在')
                    broken_count += 1

# ── 3. 检查 missing 自定义 CSS class ──
# Check if .course-card, .badge-required etc. are defined
css = (OUT / '.vitepress' / 'theme' / 'style.css').read_text(encoding='utf-8')
for cls in ['course-card', 'course-grid', 'course-code', 'course-title', 'course-meta', 'badge-required', 'badge-elective', 'badge-practice', 'course-info']:
    if cls not in css:
        add('HIGH', 'CSS', f'.{cls} 未定义')

# ── 4. 检查 about.md 中的统计数字 ──
about = OUT / 'about.md'
if about.exists():
    txt = about.read_text(encoding='utf-8')
    # 验证实际 shared 课程数
    shared_count = len([f for f in (OUT / 'majors' / 'shared').glob('*.md') if f.name != 'index.md'])
    m = re.search(r'\*\*(\d+) 门课程\*\*', txt)
    if m and int(m.group(1)) != shared_count:
        add('MEDIUM', '数据', f'about.md 写 {m.group(1)} 门课但实际有 {shared_count} 门')

# ── 5. 验证 footer / nav.md 链接 ──
for page_name in ['nav.md','map.md']:
    f = OUT / page_name
    if not f.exists():
        add('HIGH', '缺失', f'{page_name} 不存在')
        continue
    txt = f.read_text(encoding='utf-8')
    # Check major links
    for major_dir in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng']:
        if f'/majors/{major_dir}' in txt:
            if not (OUT / 'majors' / major_dir / 'index.md').exists():
                add('HIGH', '链接', f'{page_name} 引用 /{major_dir}/ 但页面不存在')

# ── 输出 ──
print('=== 深度自检报告 ===\n')
high = [i for i in issues if i['sev']=='HIGH']
med = [i for i in issues if i['sev']=='MEDIUM']
print(f'总计: {len(issues)} 项 | 严重:{len(high)} 中:{len(med)}\n')

if high:
    print('🔴 严重问题:')
    for i in high[:30]:
        print(f"  [{i['cat']}] {i['loc']}: {i['msg']}")
if med:
    print('\n🟡 中等问题:')
    for i in med[:20]:
        print(f"  [{i['cat']}] {i['loc']}: {i['msg']}")

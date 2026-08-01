import os, re, json
from pathlib import Path

OUT = Path('D:/培养方案拓展')
issues = []

def add(severity, category, message, location=''):
    issues.append({'sev': severity, 'cat': category, 'msg': message, 'loc': location})

# ── 1. 检查专业页面 / 年级选择页 ──
for major in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng']:
    idx = OUT / 'majors' / major / 'index.md'
    if not idx.exists():
        add('HIGH', '缺失', f'专业首页缺失: {major}')
        continue
    txt = idx.read_text(encoding='utf-8')
    if '修订版' in txt:
        add('MEDIUM', '内容', f'{major}/index.md 仍含"修订版"字样')
    # Check for empty/null content
    if len(txt) < 200:
        add('HIGH', '内容', f'{major}/index.md 内容过短')

# ── 2. 学期页一致性 ──
sem_issues = 0
for major in ['dianzikexue','dianqigongcheng','nongyejixiehua','nongyegongcheng','jiqirengongcheng']:
    major_dir = OUT / 'majors' / major
    if not major_dir.exists():
        continue
    for year_dir in sorted(major_dir.iterdir()):
        if not year_dir.is_dir() or not year_dir.name.isdigit():
            continue
        for sem_file in sorted(year_dir.glob('semester*.md')):
            txt = sem_file.read_text(encoding='utf-8')
            cards = re.findall(r'class="course-card"', txt)
            codes = re.findall(r'course-code">(\d+)', txt)
            if len(cards) != len(codes):
                add('HIGH', '内容', f'{sem_file.relative_to(OUT)}: cards={len(cards)} codes={len(codes)}')
            if len(codes) != len(set(codes)):
                dupes = [c for c in codes if codes.count(c) > 1]
                add('HIGH', '内容', f'{sem_file.relative_to(OUT)}: 重复课程: {set(dupes)}')
                sem_issues += 1

# ── 3. 共享页 ──
shared_dir = OUT / 'majors' / 'shared'
shared_codes = set()
for f in shared_dir.glob('*.md'):
    if f.name == 'index.md':
        continue
    shared_codes.add(f.stem)
    txt = f.read_text(encoding='utf-8')
    if '课程编号' not in txt:
        add('MEDIUM', '内容', f'shared/{f.name}: 缺少课程编号')
    if '开课信息' not in txt:
        add('MEDIUM', '内容', f'shared/{f.name}: 缺开课信息')
    # Check for special courses wrongly in shared
    code = f.stem
    if code.startswith('321') or '毕业' in txt[:200] or '实习' in txt[:200] or '军训' in txt[:200]:
        if '课程资料' in txt and '投稿' in txt:
            add('MEDIUM', '分类', f'shared/{f.name}: 可能是特殊课程混入共享')

# ── 4. 检查侧边栏导航配置 ──
config = OUT / '.vitepress' / 'config.mts'
cfg_txt = config.read_text(encoding='utf-8')
# Find nav items
nav_items = re.findall(r"text:\s*'([^']+)'", cfg_txt)
for item in ['电子科学与技术','电气工程及其自动化','农业机械化及其自动化','农业工程','机器人工程']:
    if item not in nav_items:
        add('HIGH', '导航', f'导航栏缺少专业: {item}')
    else:
        # find the link following
        m = re.search(rf"text:\s*'{re.escape(item)}',\s*link:\s*'([^']+)'", cfg_txt)
        if m:
            link = m.group(1).strip('/').replace('.html','')
            expected = f'majors/{item[:7]}'
            # get major dir name from mapping
            major_map = {'电子科学与技术':'dianzikexue','电气工程及其自动化':'dianqigongcheng','农业机械化及其自动化':'nongyejixiehua','农业工程':'nongyegongcheng','机器人工程':'jiqirengongcheng'}
            expected_dir = f"majors/{major_map[item]}"
            if link.split('/')[0:2] != expected_dir.split('/'):
                add('MEDIUM', '导航', f'导航链接不一致: {item} → {link}')

# ── 5. 检查侧边栏旧路径残留 ──
old_paths_found = []
for major_dir in (OUT / 'majors').iterdir():
    if not major_dir.is_dir():
        continue
    # Old semester1-1.md pattern
    for old_pattern in ['semester1-1', 'semester1-2', 'courses']:
        if (major_dir / old_pattern).exists():
            old_paths_found.append(f'{major_dir.name}/{old_pattern}')
            add('HIGH', '残留', f'旧路径残留: {major_dir.name}/{old_pattern}/')

# ── 6. 检查 pages 与实际 ──
# Check map.md
map_md = OUT / 'map.md'
if map_md.exists():
    txt = map_md.read_text(encoding='utf-8')
    for major_map in {'dianzikexue':'电子','dianqigongcheng':'电气','nongyejixiehua':'农机','nongyegongcheng':'农工','jiqirengongcheng':'机器人'}:
        if f'/majors/{major_map}/' not in txt:
            add('MEDIUM', '内容', f'map.md 缺专业 {major_map} 链接')

# ── 7. 检查 footer / 关于页 ──
about = OUT / 'about.md'
if about.exists():
    txt = about.read_text(encoding='utf-8')
    for pro in ['电子科学与技术','电气工程','农业机械化','农业工程','机器人']:
        if pro not in txt:
            add('LOW', '内容', f'about.md 缺专业: {pro}')

# ── 输出 ──
print('=== 全站自检报告 ===\n')
high = [i for i in issues if i['sev']=='HIGH']
med = [i for i in issues if i['sev']=='MEDIUM']
low = [i for i in issues if i['sev']=='LOW']
print(f'总计: {len(issues)} 项 | 严重:{len(high)} 中:{len(med)} 低:{len(low)}\n')

if high:
    print('🔴 严重问题:')
    for i in high:
        print(f"  [{i['cat']}] {i['loc']}: {i['msg']}")
if med:
    print('\n🟡 中等问题:')
    for i in med:
        print(f"  [{i['cat']}] {i['loc']}: {i['msg']}")
if low:
    print('\n⚪ 一般问题:')
    for i in low:
        print(f"  [{i['cat']}] {i['loc']}: {i['msg']}")

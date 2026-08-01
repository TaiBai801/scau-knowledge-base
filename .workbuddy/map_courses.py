import os, json

root = r'C:/Users/ASUS1/Desktop/课程资料整理'
COS = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com/files'
skip = '【有版权】单独存放'

# Name mapping: folder name -> course name in gen_v3
name_map = {
    '电磁学': '大学物理B',  # 大二上学期
    '思想政治': '思想道德与法治/毛泽东思想和中国特色社会主义理论体系概论',  # confused
    '信号与系统': '信号与系统',
    '自动控制原理': '自动控制原理',
    '单片机': '单片机原理与应用',
    '数字电子技术': '数字电子技术',
    '人工智能': '人工智能',
    '实验设计': '试验设计与统计分析',
    '嵌入式': '嵌入式系统',
    '电力系统': '电力系统',
    '电机学': '电机学',
    '电气控制与PLC': '电气控制与PLC',
    '电气测量': '电气测量',
    '变电工程': '变电工程',
    '电力电子': '电力电子',
    '电子电路': '电子电路',
    '继电保护': '继电保护',
}

# Build new MATERIALS entries
new_mat = {}
for semester in sorted(os.listdir(root)):
    sp = os.path.join(root, semester)
    if not os.path.isdir(sp) or semester == skip: continue
    for course_dir in sorted(os.listdir(sp)):
        cp = os.path.join(sp, course_dir)
        if not os.path.isdir(cp): continue
        # Collect top-level files only (don't go into subdirs to keep it simple)
        files = []
        for fn in sorted(os.listdir(cp)):
            fp = os.path.join(cp, fn)
            if fn.startswith('~$') or fn.startswith('.'): continue
            if os.path.isdir(fp): continue  # skip subdirs for now
            rel = os.path.relpath(fp, root).replace('\\', '/')
            display = fn.rsplit('.',1)[0]
            files.append((display, f'{COS}/{rel}'))
        if files:
            mapped = name_map.get(course_dir, course_dir)
            # Handle multiple course names
            for m in mapped.split('/'):
                m = m.strip()
                if m not in new_mat: new_mat[m] = []
                if semester not in [f[0] for f in new_mat[m]]:
                    new_mat[m].extend([(f'{semester}|{f[0]}', f[1]) for f in files])

# Print as Python dict
print('New MATERIALS entries:')
for k, v in sorted(new_mat.items()):
    print(f"    '{k}': [")
    for name, url in v:
        print(f"        ({repr(name)}, '{url}'),")
    print('    ],')

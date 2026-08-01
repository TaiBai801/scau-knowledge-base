import pandas as pd, os, json

base = r'C:\Users\ASUS1\Downloads'
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

sem_cols = ['一','二','三','四','五','六','七','八','九','十']
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
            'name': r['课程名称'],
            'name_en': r['英文名称'] if pd.notna(r['英文名称']) else '',
            'type': r['课程性质'],
            'system': r['课程体系'],
            'credits': float(r['学分']) if pd.notna(r['学分']) else 0,
            'total_hours': int(r['总学时']) if pd.notna(r['总学时']) else 0,
            'lecture': int(r['讲课']) if pd.notna(r['讲课']) else 0,
            'lab': int(r['实验']) if pd.notna(r['实验']) else 0,
            'practice': float(r['实践']) if pd.notna(r['实践']) else 0,
            'self_study': int(r['自修']) if pd.notna(r['自修']) else 0,
            'semester': semester, 'sem_hours': sems,
        })

courses = pd.DataFrame(rows)
print(f'Total entries: {len(courses)}, Unique codes: {courses["code"].nunique()}')
print(f'Majors: {sorted(courses["major"].unique())}')
print(f'Major×Year:')
for (m, y), g in courses.groupby(['major','year']):
    cred = g['credits'].sum()
    hr = g['total_hours'].sum()
    print(f'  {m}/{y}: {len(g)} courses, {cred:.1f} credits, {int(hr)}h')
print(f'\nShared pages to create: {courses["code"].nunique()}')
print(f'Semester pages: 8 sem × {len(courses.groupby(["major","year"]))} = {8*len(courses.groupby(["major","year"]))}')

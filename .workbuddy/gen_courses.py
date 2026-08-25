# -*- coding: utf-8 -*-
"""生成 courses.json（课程码 -> 课程名），供 admin 上传页下拉框使用"""
import pandas as pd, glob, json, os

base = r'C:\Users\ASUS1\Downloads'

def norm_name(s):
    # 罗马数字 → 字母，与 course_metadata.txt 保持一致
    return (s.replace('Ⅰ','I').replace('Ⅱ','II')
             .replace('Ⅲ','III').replace('Ⅳ','IV').strip())

seen = {}
for fp in glob.glob(base + '/*.xls'):
    try:
        df = pd.read_excel(fp, header=0)
        for _, r in df.iterrows():
            if pd.notna(r['课程名称']) and pd.notna(r['课程编号']):
                name = norm_name(str(r['课程名称']))
                code = str(int(r['课程编号']))
                if code not in seen:
                    seen[code] = name
    except Exception:
        pass

arr = [{'code': c, 'name': n} for c, n in seen.items()]
arr.sort(key=lambda x: x['name'])

out_path = r'D:\培养方案拓展\public\data\courses.json'
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(arr, f, ensure_ascii=False, indent=2)
print(f'生成 {out_path}，共 {len(arr)} 门课程')

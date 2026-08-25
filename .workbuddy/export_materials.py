# -*- coding: utf-8 -*-
"""
一次性迁移脚本：把 gen_v3.py 里硬编码的 MATERIALS 字典导出为 materials.json
生成「课程码 -> 资料数组」结构，之后课程页从 materials.json 动态读取。
"""
import json, os

COS = 'https://scau-files-1440179010.cos.ap-chengdu.myqcloud.com/files'

# ── 课程名 -> 课程码 映射（从培养方案 Excel 确认）──
NAME_TO_CODE = {
    'C语言程序设计': '1210004000',
    '高等数学AⅠ': '1215607110',
    '大学英语AⅠ': '2210141110',
    '中国近现代史纲要': '1215845000',
    '思想道德与法治': '1215841000',
    '马克思主义基本原理概论': '1210656000',
    '电路分析': '1210175201',
    '自动控制原理': '1211478000',
    '数字电子技术': '1210969000',
    '信号与系统': '1251204000',
    '大学物理B': '1215749220',
}

# ── 旧 MATERIALS 字典（从 gen_v3.py 复制）──
MATERIALS = {
    'C语言程序设计': [
        ('机考复习题（2018-12）', f'{COS}/c-lang/C-exam-review-2018-12.pdf'),
        ('机考复习题', f'{COS}/c-lang/C-exam-1.doc'),
        ('机考复习题（2012-12）', f'{COS}/c-lang/C-exam-2012-12.doc'),
        ('机考复习题详解', f'{COS}/c-lang/C-exam-detailed.docx'),
        ('机考答案（2016-11）', f'{COS}/c-lang/C-exam-answers-2016-11.doc'),
    ],
    '高等数学AⅠ': [
        ('高等数学AI 测试题', f'{COS}/math/math-AI-exam-2.doc'),
        ('高等数学B1 模拟题', f'{COS}/math/math-B1-mock-1.doc'),
        ('清华大学数学测试题', f'{COS}/math/tsinghua-math-test.pdf'),
        ('高等数学A 复习资料', f'{COS}/math/math-A-review.pdf'),
    ],
    '大学英语AⅠ': [
        ('大学英语期末复习资料', f'{COS}/english/english-final-review.doc'),
    ],
    '中国近现代史纲要': [
        ('近代史知识点整理', f'{COS}/jindaishi/history-points.doc'),
        ('近代史全面复习', f'{COS}/jindaishi/jindaishi-full-review.doc'),
        ('近代史重点归纳', f'{COS}/jindaishi/jindaishi-key-points.doc'),
        ('近代史提纲', f'{COS}/jindaishi/jindaishi-outline.doc'),
        ('近代史历年真题', f'{COS}/jindaishi/jindaishi-past-exams.doc'),
        ('近代史题库', f'{COS}/jindaishi/jindaishi-question-bank.doc'),
        ('近代史复习资料1', f'{COS}/jindaishi/jindaishi-review-1.doc'),
        ('近代史复习资料2', f'{COS}/jindaishi/jindaishi-review.docx'),
    ],
    '思想道德与法治': [
        ('思修复习题答案', f'{COS}/sixiu/sixiu-exam-answers.zip'),
        ('思修期末考试复习', f'{COS}/sixiu/sixiu-final-review.docx'),
        ('思修选择题库', f'{COS}/sixiu/sixiu-mcq.doc'),
        ('思修模拟卷', f'{COS}/sixiu/sixiu-mock-18p.docx'),
        ('思修笔记', f'{COS}/sixiu/sixiu-notes.docx'),
        ('思修提纲', f'{COS}/sixiu/sixiu-outline.docx'),
    ],
    '马克思主义基本原理概论': [
        ('基本原理复习1', f'{COS}/basic/basic-review-2018-1.docx'),
        ('基本原理复习2', f'{COS}/basic/basic-review-2018.docx'),
    ],
    '电路分析': [
        ('电路分析期末复习', f'{COS}/大二上/电路分析/电路分析复习.pptx'),
    ],
    '自动控制原理': [
        ('试卷全大题答案（17页）', f'{COS}/大二下/自动控制原理/自动控制原理_试卷_全大题_完整答案（17页）.doc'),
        ('复习试题库20套', f'{COS}/大二下/自动控制原理/自动控制原理复习试题库20套.doc'),
        ('期末考试题（6页）', f'{COS}/大二下/自动控制原理/自动控制原理期末考试题（6页）.doc'),
        ('考试复习题（22页）', f'{COS}/大二下/自动控制原理/自动控制原理考试复习题（22页）.doc'),
        ('试卷及答案（31页）', f'{COS}/大二下/自动控制原理/自动控制原理试卷及答案（31页）.doc'),
        ('选择题（有答案）', f'{COS}/大二下/自动控制原理/自动控制原理选择题(48学时)有答案.doc'),
        ('习题集（含答案）', f'{COS}/大二下/自动控制原理/自动控制理论_习题集(含答案).doc'),
        ('复习题及答案', f'{COS}/大二下/自动控制原理/自控理论_复习题及答案.doc'),
    ],
    '数字电子技术': [
        ('模拟考题2025', f'{COS}/大二下/数字电子技术/数电模拟考题2025.pdf'),
        ('门电路及组合逻辑实验', f'{COS}/大二下/数字电子技术/还原Word_第2章门电路及组合逻辑电路实验.docx'),
    ],
    '信号与系统': [
        ('平时作业（选择判断题）', f'{COS}/大二下/信号与系统/信号与系统平时作业（选择判断题）.docx'),
        ('简答题2', f'{COS}/大二下/信号与系统/信号与系统简答题(2).pdf'),
        ('简答题参考', f'{COS}/大二下/信号与系统/信号简答题（不唯一，以老师课堂上讲的为主）.docx'),
        ('辅导课件1', f'{COS}/大二下/信号与系统/辅导课件(1).pptx'),
        ('辅导课件2', f'{COS}/大二下/信号与系统/辅导课件.pptx'),
    ],
    '大学物理B': [
        ('电磁学题', f'{COS}/大二上/电磁学/电磁学题.docx'),
        ('考点整理', f'{COS}/大二上/电磁学/考点.docx'),
    ],
}


def build():
    result = {}
    unmatched = []
    for name, items in MATERIALS.items():
        code = NAME_TO_CODE.get(name)
        if not code:
            unmatched.append(name)
            continue
        arr = []
        for display, url in items:
            ext = url.rsplit('.', 1)[-1].lower() if '.' in url else ''
            arr.append({
                'name': display,
                'url': url,
                'ext': ext,
                'size': None,
            })
        result[code] = arr
    return result, unmatched


if __name__ == '__main__':
    data, unmatched = build()
    out_path = r'D:\培养方案拓展\data\materials.json'
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total = sum(len(v) for v in data.values())
    print(f'生成 {out_path}')
    print(f'课程数 {len(data)}，资料总数 {total}')
    if unmatched:
        print(f'未匹配课程: {unmatched}')

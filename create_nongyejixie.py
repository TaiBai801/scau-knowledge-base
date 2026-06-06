import urllib.request
import json
import time
import sys

URL = 'https://docs.qq.com/openapi/mcp'
HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': '690a7fd1449845f29d70a075b156670b'
}
SPACE_ID = 'epXJHgEtpIjo'

def call_mcp(method, params, call_id=1):
    data = json.dumps({
        'jsonrpc': '2.0',
        'method': method,
        'params': params,
        'id': call_id
    }).encode('utf-8')
    req = urllib.request.Request(URL, data=data, headers=HEADERS, method='POST')
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read().decode('utf-8'))

def create_space_node(title, node_type, parent_id, extra=None):
    args = {
        'title': title,
        'node_type': node_type,
        'space_id': SPACE_ID,
        'parent_node_id': parent_id
    }
    if extra:
        args.update(extra)
    result = call_mcp('tools/call', {'name': 'create_space_node', 'arguments': args})
    content = result.get('result', {}).get('content', [])
    if content:
        text = content[0].get('text', '{}')
        return json.loads(text)
    return result

def create_course(course_name, parent_id):
    try:
        folder_result = create_space_node(
            course_name, 'wiki_folder', parent_id,
            {'wiki_folder_node': {'title': course_name}}
        )
        folder_info = folder_result.get('node_info', {})
        folder_id = folder_info.get('node_id')
        if not folder_id:
            return False, f"Failed to create folder for {course_name}: {folder_result}"
        
        doc_result = create_space_node(
            course_name, 'wiki_tdoc', folder_id,
            {'wiki_tdoc_node': {'title': course_name, 'doc_type': 'word'}}
        )
        doc_info = doc_result.get('node_info', {})
        doc_id = doc_info.get('node_id')
        if not doc_id:
            return False, f"Failed to create doc for {course_name}: {doc_result}"
        
        return True, None
    except Exception as e:
        return False, str(e)

semesters = {
    '大一上学期': {
        'parent': 'evWpWAGJizxo',
        'courses': [
            '专业概论与新生研讨（农机）', '军事理论', '军训(军事技能)',
            '农学概论', '国家安全教育', '大学体育I',
            '大学生心理健康与职业发展I', '大学生心理健康与职业发展II',
            '大学英语A I', '形势与政策I', '思想道德与法治',
            '机械制图', '机械制图实验', '机械制图教学实习', '高等数学A I',
        ]
    },
    '大一下学期': {
        'parent': 'eralWnFhPrkC',
        'courses': [
            '中国近现代史纲要', '习近平新时代中国特色社会主义思想概论',
            '大学体育II', '大学英语A II', '形势与政策II', '机械制造基础',
            '机械制造基础教学实习', '毛泽东思想和中国特色社会主义理论体系概论',
            '计算机辅助设计B', '高等数学A II',
        ]
    },
    '大二上学期': {
        'parent': 'emaVDOhmfFxX',
        'courses': [
            'C语言程序设计', 'C语言程序设计实验', '劳动教育', '大学体育III',
            '大学物理C', '大学物理实验C', '大学生心理健康与职业发展III',
            '形势与政策III', '材料力学B', '概率论与数理统计B', '理论力学',
            '电工学', '电工学实验',
        ]
    },
    '大二下学期': {
        'parent': 'eEuPQvpHrCGq',
        'courses': [
            '人工智能', '单片机原理与应用', '单片机原理与应用实验',
            '单片机原理与应用综合实践', '复变函数与积分变换',
            '大学生劳动教育（实践I）', '形势与政策IV', '思政课社会实践',
            '控制工程基础', '机械原理', '机械工程三维建模与仿真',
            '机械工程材料', '线性代数', '马克思主义基本原理概论',
        ]
    },
    '大三上学期': {
        'parent': 'elopzNxvjgRo',
        'courses': [
            '互换性与测量技术', '大学生劳动教育（实践II）',
            '大学生心理健康与职业发展IV', '工程测试技术', '形势与政策V',
            '机械设计', '机械设计教学实习', '汽车与拖拉机学教学实习',
            '汽车拖拉机学', '现代机械设计方法', '电子电路设计与仿真',
            '电子电路设计与仿真实验',
        ]
    },
    '大三下学期': {
        'parent': 'elpUSsIklBpJ',
        'courses': [
            '人工智能原理及应用', '农业机械学', '农业机械学教学实习',
            '农产品加工机械', '形势与政策VI', '机械制造工艺学',
            '机械制造工艺学教学实习', '机械电子学', '汽车拖拉机理论',
        ]
    },
    '大四上学期': {
        'parent': 'ehZIJvUVqhAC',
        'courses': [
            '农业机械化', '农业机械化学', '农业机械化学教学实习',
            '农业机械设计与计算', '形势与政策VII', '试验设计与统计分析（研）',
        ]
    },
    '大四下学期': {
        'parent': 'eXGITruaLZaH',
        'courses': [
            '创新创业实践', '毕业实习', '毕业论文（毕业设计）',
        ]
    },
}

total_success = 0
total_fail = 0
semester_results = []

for semester_name, semester_data in semesters.items():
    parent_id = semester_data['parent']
    courses = semester_data['courses']
    
    success = 0
    fail = 0
    
    print(f"\n=== {semester_name} ({len(courses)}门课) ===", flush=True)
    
    for i, course in enumerate(courses):
        ok, err = create_course(course, parent_id)
        if ok:
            success += 1
            print(f"  [{i+1}/{len(courses)}] OK: {course}", flush=True)
        else:
            fail += 1
            print(f"  [{i+1}/{len(courses)}] FAIL: {course} - {err}", flush=True)
        
        time.sleep(0.1)
    
    total_success += success
    total_fail += fail
    semester_results.append((semester_name, success, fail))
    print(f"  => {success}成功, {fail}失败", flush=True)

print(f"\n{'='*50}", flush=True)
print(f"总计: {total_success}成功, {total_fail}失败", flush=True)
for name, s, f in semester_results:
    print(f"  {name}: {s}成功, {f}失败", flush=True)

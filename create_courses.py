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
    """Create a folder and a word doc for a course. Returns (success, error_msg)."""
    try:
        # Step 1: Create folder
        folder_result = create_space_node(
            course_name, 'wiki_folder', parent_id,
            {'wiki_folder_node': {'title': course_name}}
        )
        folder_info = folder_result.get('node_info', {})
        folder_id = folder_info.get('node_id')
        if not folder_id:
            return False, f"Failed to create folder for {course_name}: {folder_result}"
        
        # Step 2: Create word doc inside folder
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

# Course data organized by semester
semesters = {
    '大一上学期': {
        'parent': 'eHZGlGAvDOat',
        'courses': [
            # Already created earlier: C语言程序设计, C语言程序设计实验, 
            # 大学生心理健康与职业发展II, 大学体育I, 大学英语AI, 高等数学AI, 
            # 国家安全教育, 思想道德与法治, 形势与政策I
            '专业概论与新生研讨',
            '大学生心理健康与职业发展I',
            '军训',
        ]
    },
    '大一下学期': {
        'parent': 'eeEnzGwLHssj',
        'courses': [
            '大学体育II',
            '大学物理B',
            '大学物理实验B',
            '大学英语AII',
            '概率论与数理统计B',
            '高等数学AII',
            '马克思主义基本原理概论',
            '线性代数',
            '形势与政策II',
        ]
    },
    '大二上学期': {
        'parent': 'eQWfkHpwTjCS',
        'courses': [
            'CAD计算机辅助设计实验',
            '大学生心理健康与职业发展III',
            '大学体育III',
            '电路分析',
            '电路分析实验',
            '复变函数与积分变换',
            '机械设计基础B',
            '劳动教育',
            '模拟电子技术',
            '模拟电子技术实验',
            '农业与生物系统工程导论',
            '形势与政策III',
            '单片机原理与应用综合实践',
            '机械设计基础课程设计',
            '单片机原理与应用',
            '单片机原理与应用实验',
        ]
    },
    '大二下学期': {
        'parent': 'emyuAgWnkADi',
        'courses': [
            '传感器技术',
            '传感器技术实验',
            '大学生劳动教育（实践I）',
            '毛泽东思想和中国特色社会主义理论体系概论',
            '数字电子技术',
            '数字电子技术实验',
            '自动控制原理',
            '自动控制原理实验',
            '传感器技术教学实习',
            '创新创业实践',
            '思政课社会实践',
            '自动控制原理综合实践',
            '电子电路设计与仿真',
            '电子电路设计与仿真实验',
            '农业机械设计与计算',
        ]
    },
    '大三上学期': {
        'parent': 'eJaqEvyxtqDq',
        'courses': [
            '大学生劳动教育（实践II）',
            '大学生心理健康与职业发展IV',
            '电机学',
            '电机学实验',
            '机械制造基础',
            '机械制造基础实验',
            '汽车拖拉机学',
            '汽车拖拉机学实验',
            '人工智能',
            '习近平新时代中国特色社会主义思想概论',
            '机械制造基础教学实习',
            '汽车与拖拉机学教学实习',
            'Python语言及应用',
            'Python语言及应用实验',
            '机器学习',
            '机器学习实验',
            '工程技术经济学',
        ]
    },
    '大三下学期': {
        'parent': 'eEOqUojqLWTA',
        'courses': [
            '形势与政策V',
            '机械制造工艺学',
            '机械制造工艺学教学实习',
            '设施农业工程及其装备',
            '设施农业工程及其装备教学实习',
            '电气控制技术',
            '电气控制技术实验',
            '农业机械化化学',
        ]
    },
    '大四上学期': {
        'parent': 'eDDvADTQAolg',
        'courses': [
            '生物系统模拟',
            '生物系统模拟实验',
            '试验设计与统计分析（研）',
            '农业机械化管理',
            '形势与政策VII',
            '机械系统动力学',
        ]
    },
    '大四下学期': {
        'parent': 'extzFIYOtfjK',
        'courses': [
            '毕业论文（毕业设计）',
            '毕业实习',
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
        
        # Small delay to avoid rate limiting
        time.sleep(0.1)
    
    total_success += success
    total_fail += fail
    semester_results.append((semester_name, success, fail))
    print(f"  => {success}成功, {fail}失败", flush=True)

print(f"\n{'='*50}", flush=True)
print(f"总计: {total_success}成功, {total_fail}失败", flush=True)
for name, s, f in semester_results:
    print(f"  {name}: {s}成功, {f}失败", flush=True)

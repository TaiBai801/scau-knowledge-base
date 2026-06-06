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
        'parent': 'eUcRcvmMnDjO',
        'courses': [
            'C语言程序设计', 'C语言程序设计实验', '专业概论与新生研讨',
            '中国近现代史纲要', '军训', '国家安全教育', '大学体育I',
            '大学生心理健康与职业发展I', '大学生心理健康与职业发展II',
            '大学英语A I', '形势与政策I', '思想道德与法治', '高等数学AI',
        ]
    },
    '大一下学期': {
        'parent': 'emRUezMjIuBT',
        'courses': [
            'MATLAB程序设计', 'MATLAB程序设计实验', '人工智能',
            '大学体育II', '大学物理B', '大学物理实验B', '大学英语A II',
            '形势与政策II', '概率论与数理统计B', '线性代数', '高等数学AII',
        ]
    },
    '大二上学期': {
        'parent': 'eLrrrRtMUXkR',
        'courses': [
            '习近平新时代中国特色社会主义思想概论', '劳动教育',
            '复变函数与积分变换', '大学体育III', '大学生心理健康与职业发展III',
            '工程电磁学', '模拟电子技术', '模拟电子技术实验',
            '毛泽东思想和中国特色社会主义理论体系概论', '电路分析',
            '电路分析实验', '离散数学',
        ]
    },
    '大二下学期': {
        'parent': 'evrpeQztqFEh',
        'courses': [
            'Python语言及应用', 'Python语言及应用实验', '信号与系统',
            '信号与系统实验', '单片机原理与应用', '单片机原理与应用实验',
            '大学生劳动教育（实践I）', '形势与政策III', '数字电子技术',
            '数字电子技术实验', '自动控制原理', '马克思主义基本原理概论',
        ]
    },
    '大三上学期': {
        'parent': 'eAZedUzervgJ',
        'courses': [
            '大学生劳动教育（实践II）', '大学生心理健康与职业发展IV',
            '数据挖掘', '数据挖掘实验', '电力系统分析', '电力系统分析实验',
            '电机学', '电机学实验', '电气控制技术', '电气测量技术',
            '电气测量技术实验', '自动控制原理实验',
        ]
    },
    '大三下学期': {
        'parent': 'ePCHQtZhlYoy',
        'courses': [
            '人工智能原理及应用', '单片机原理与应用综合实践',
            '变电工程设计', '变电工程设计实验', '嵌入式系统开发与应用',
            '嵌入式系统开发与应用实验', '形势与政策V', '电力电子技术',
            '电力电子技术实验', '电子电路综合实践', '电气控制技术实验',
            '试验设计与统计分析（研）',
        ]
    },
    '大四上学期': {
        'parent': 'eUPlvxwlkSLn',
        'courses': [
            '传感器技术', '传感器技术实验', '形势与政策VI',
            '电力系统继电保护', '电力系统继电保护实验',
        ]
    },
    '大四下学期': {
        'parent': 'eBNAzvZxzjcO',
        'courses': [
            '创新创业实践', '毕业实习', '毕业设计（论文）',
            '现代控制理论', '电力系统仿真技术', '电力系统仿真技术实验',
            '电子电路设计与仿真', '电子电路设计与仿真实验',
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

import urllib.request, json, time

URL = 'https://docs.qq.com/openapi/mcp'
HEADERS = {'Content-Type': 'application/json', 'Authorization': '690a7fd1449845f29d70a075b156670b'}
SPACE_ID = 'epXJHgEtpIjo'

TEMPLATE = '''\

## 课程介绍

【待填充】

## 学习目标

【待填充】

## 课程大纲

【待填充】

## 课件资料

【待填充】

## 课后练习

【待填充】

## 参考资源

【待填充】
'''

def call_mcp(name, args):
    data = json.dumps({'jsonrpc':'2.0','method':'tools/call','params':{'name':name,'arguments':args},'id':1}).encode()
    req = urllib.request.Request(URL, data=data, headers=HEADERS, method='POST')
    resp = urllib.request.urlopen(req, timeout=30)
    r = json.loads(resp.read().decode())
    content = r.get('result',{}).get('content',[])
    if content:
        t = content[0].get('text','{}')
        try: return json.loads(t)
        except: return t
    return r

def query_children(parent_id):
    result = call_mcp('query_space_node', {'space_id':SPACE_ID,'parent_id':parent_id})
    return result.get('children',[]) if isinstance(result,dict) else []

def insert_template(doc_id, course_name):
    result = call_mcp('doc.insert_markdown', {
        'file_id': doc_id, 'index': 0,
        'markdown': f'# {course_name}{TEMPLATE}'
    })
    if isinstance(result,dict) and 'edit_result' in result:
        return True
    if isinstance(result,dict) and result.get('last_index'):
        return True
    return False

major_semesters = {
    '电子科学与技术': [
        ('大一上学期','eDBqHMWunTXI'),('大一下学期','egdBjUzuDYDS'),
        ('大二上学期','eqWhqCztbaEi'),('大二下学期','enrOemqmlBjp'),
        ('大三上学期','eDhWmBeunwEM'),('大三下学期','eYemZfTbwWLo'),
        ('大四上学期','eFhLmAtjOVXi'),('大四下学期','eTPdHHnunFnW'),
    ],
    '电气工程及其自动化': [
        ('大一上学期','eUcRcvmMnDjO'),('大一下学期','emRUezMjIuBT'),
        ('大二上学期','eLrrrRtMUXkR'),('大二下学期','evrpeQztqFEh'),
        ('大三上学期','eAZedUzervgJ'),('大三下学期','ePCHQtZhlYoy'),
        ('大四上学期','eUPlvxwlkSLn'),('大四下学期','eBNAzvZxzjcO'),
    ],
    '农业机械化及其自动化': [
        ('大一上学期','evWpWAGJizxo'),('大一下学期','eralWnFhPrkC'),
        ('大二上学期','emaVDOhmfFxX'),('大二下学期','eEuPQvpHrCGq'),
        ('大三上学期','elopzNxvjgRo'),('大三下学期','elpUSsIklBpJ'),
        ('大四上学期','ehZIJvUVqhAC'),('大四下学期','eXGITruaLZaH'),
    ],
    '农业工程': [
        ('大一上学期','eHZGlGAvDOat'),('大一下学期','eeEnzGwLHssj'),
        ('大二上学期','eQWfkHpwTjCS'),('大二下学期','emyuAgWnkADi'),
        ('大三上学期','eJaqEvyxtqDq'),('大三下学期','eEOqUojqLWTA'),
        ('大四上学期','eDDvADTQAolg'),('大四下学期','extzFIYOtfjK'),
    ],
}

total = 0
success = 0

for major, semesters in major_semesters.items():
    print(f'\n=== {major} ===')
    for sem_name, sem_id in semesters:
        children = query_children(sem_id)
        course_count = 0
        for child in children:
            if child['node_type'] == 'wiki_folder' and child.get('has_child'):
                docs = query_children(child['node_id'])
                for doc in docs:
                    if doc['node_type'] == 'wiki_file':
                        total += 1
                        ok = insert_template(doc['node_id'], child['title'])
                        if ok:
                            success += 1
                            course_count += 1
                            print(f'  ✓ {child["title"]}', flush=True)
                        else:
                            name = child['title']
                            rid = doc['node_id'][:8]
                            print(f'  ✗ {name} ({rid}) FAILED', flush=True)
                        time.sleep(0.12)
                        break
        print(f'  [{sem_name}] {course_count}/{len([x for x in children if x["node_type"]=="wiki_folder"])}', flush=True)

print(f'\n{"="*60}')
print(f'总计: {success}/{total} 成功')

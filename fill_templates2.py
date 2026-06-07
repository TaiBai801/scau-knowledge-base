import urllib.request, json, time, sys

URL = 'https://docs.qq.com/openapi/mcp'
H = {'Content-Type': 'application/json', 'Authorization': '690a7fd1449845f29d70a075b156670b'}
S = 'epXJHgEtpIjo'

TEMPLATE = '''
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

call_count = 0

def mcp(n, a):
    global call_count
    call_count += 1
    if call_count % 100 == 0:
        time.sleep(3)
    d = json.dumps({'jsonrpc':'2.0','method':'tools/call','params':{'name':n,'arguments':a},'id':1}).encode()
    r = json.loads(urllib.request.urlopen(
        urllib.request.Request(URL, data=d, headers=H, method='POST'), timeout=20
    ).read())
    c = r.get('result',{}).get('content',[])
    return json.loads(c[0].get('text','{}')) if c else r

def get_docs(sem_id):
    children = mcp('query_space_node', {'space_id':S,'parent_id':sem_id}).get('children',[])
    results = []
    seen = set()
    for c in children:
        if c['node_type'] == 'wiki_folder' and c.get('has_child'):
            name = c['title']
            if name in seen:
                continue
            seen.add(name)
            docs = mcp('query_space_node', {'space_id':S,'parent_id':c['node_id']}).get('children',[])
            for d in docs:
                if d['node_type'] == 'wiki_file':
                    results.append((c['title'], d['node_id']))
                    break
            time.sleep(0.06)
    return results

def needs_template(doc_id):
    try:
        content = str(mcp('get_content', {'file_id': doc_id}))
        return '课程介绍' not in content
    except:
        return True

def insert_template(doc_id, course_name):
    result = mcp('doc.insert_markdown', {
        'file_id': doc_id, 'index': 0,
        'markdown': '# ' + course_name + TEMPLATE
    })
    ok = isinstance(result, dict) and ('edit_result' in result or result.get('last_index'))
    time.sleep(0.12)
    return ok

# FIXED: Correct semester IDs from actual space structure
major_semesters = {
    '电子科学': [
        ('大一上','eTfVpWENLbaE'),('大一下','egdBjUzuDYDS'),
        ('大二上','eqWhqCztbaEi'),('大二下','eFsvHhTOpizj'),
        ('大三上','efyJDvTFrCDC'),('大三下','etfSasICtFMj'),
        ('大四上','eEXZLHIQNZOE'),('大四下','eFIrJYCFJGaT'),
    ],
    '农工(后三学期)': [
        ('大三下','egJlnnPtFOmF'),('大四上','eTwrqoEVCaRS'),
        ('大四下','eRJEcQYukivu'),
    ],
}

total_filled = total_skipped = total_failed = 0

for major, semesters in major_semesters.items():
    sys.stdout.write('\n--- %s ---\n' % major); sys.stdout.flush()
    for sem_name, sem_id in semesters:
        docs = get_docs(sem_id)
        filled = skipped = failed = 0
        for course_name, doc_id in docs:
            if needs_template(doc_id):
                ok = insert_template(doc_id, course_name)
                if ok:
                    filled += 1; sys.stdout.write('+')
                else:
                    failed += 1; sys.stdout.write('X')
            else:
                skipped += 1; sys.stdout.write('.')
            sys.stdout.flush()
        sys.stdout.write(' [%s] fill:%d skip:%d fail:%d\n' % (sem_name, filled, skipped, failed))
        sys.stdout.flush()
        total_filled += filled; total_skipped += skipped; total_failed += failed

print('\n===== DONE =====')
print('Fill:%d Skip:%d Fail:%d' % (total_filled, total_skipped, total_failed))

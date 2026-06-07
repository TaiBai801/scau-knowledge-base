import urllib.request, json, time, sys, pandas as pd

URL = 'https://docs.qq.com/openapi/mcp'
H = {'Content-Type': 'application/json', 'Authorization': '690a7fd1449845f29d70a075b156670b'}
S = 'epXJHgEtpIjo'

def mcp(n, a):
    d = json.dumps({'jsonrpc':'2.0','method':'tools/call','params':{'name':n,'arguments':a},'id':1}).encode()
    r = json.loads(urllib.request.urlopen(
        urllib.request.Request(URL, data=d, headers=H, method='POST'), timeout=20
    ).read())
    c = r.get('result',{}).get('content',[])
    return json.loads(c[0].get('text','{}')) if c else r

TEMPLATE = '''## ① 课程介绍

| 项目 | 内容 |
|------|------|
| **课程名称** | {name} |
| **学分** | {credits} |
| **开设学期** | {semester} |
| **课程性质** | {nature} |

> 📦 该课程资料正在整理中，敬请期待！

## ② 课程资料

> 📄 资料收集中。

## ③ 练习题

> ✏️ 整理中。

## ④ 推荐资源

> 🚧 待老师推荐。

## ⑤ 优秀学长「ta 说」

> 🔎 招募中 — 欢迎学过的同学分享经验！

---
> 🔄 本页内容同步自 [腾讯文档编辑后台](https://docs.qq.com/space/DZXBYSkhnRXRwSWpv)
'''

# Read course metadata from xlsx
df = pd.read_excel('课程任务分配表.xlsx', sheet_name='课程分配表')
course_map = {}
for _, row in df.iterrows():
    key = row['课程名称'].strip()
    course_map[key] = {
        'credits': str(row['学分']),
        'semester': str(row['学期']),
        'nature': str(row['性质']),
    }

print('Loaded %d course metadata entries' % len(course_map))

call_count = 0
def safe_mcp(n, a):
    global call_count
    call_count += 1
    if call_count % 80 == 0:
        print('  [pause 3s for rate limit]', flush=True)
        time.sleep(3)
    return mcp(n, a)

major_semesters = {
    '电子科学': [
        ('大一上','eTfVpWENLbaE'),('大一下','egdBjUzuDYDS'),
        ('大二上','eqWhqCztbaEi'),('大二下','eFsvHhTOpizj'),
        ('大三上','efyJDvTFrCDC'),('大三下','etfSasICtFMj'),
        ('大四上','eEXZLHIQNZOE'),('大四下','eFIrJYCFJGaT'),
    ],
    '电气': [
        ('大一上','eUcRcvmMnDjO'),('大一下','emRUezMjIuBT'),
        ('大二上','eLrrrRtMUXkR'),('大二下','evrpeQztqFEh'),
        ('大三上','eAZedUzervgJ'),('大三下','ePCHQtZhlYoy'),
        ('大四上','eUPlvxwlkSLn'),('大四下','eBNAzvZxzjcO'),
    ],
    '农机': [
        ('大一上','evWpWAGJizxo'),('大一下','eralWnFhPrkC'),
        ('大二上','emaVDOhmfFxX'),('大二下','eEuPQvpHrCGq'),
        ('大三上','elopzNxvjgRo'),('大三下','elpUSsIklBpJ'),
        ('大四上','ehZIJvUVqhAC'),('大四下','eXGITruaLZaH'),
    ],
    '农工': [
        ('大一上','eHZGlGAvDOat'),('大一下','eeEnzGwLHssj'),
        ('大二上','eQWfkHpwTjCS'),('大二下','emyuAgWnkADi'),
        ('大三上','eJaqEvyxtqDq'),('大三下','egJlnnPtFOmF'),
        ('大四上','eTwrqoEVCaRS'),('大四下','eRJEcQYukivu'),
    ],
}

total_ok = total_fail = 0

for major, semesters in major_semesters.items():
    sys.stdout.write('\n--- %s ---\n' % major); sys.stdout.flush()
    for sem_name, sem_id in semesters:
        children = safe_mcp('query_space_node', {'space_id':S,'parent_id':sem_id}).get('children',[])
        seen = set()
        ok = fail = 0
        for c in children:
            if c['node_type'] != 'wiki_folder' or not c.get('has_child'):
                continue
            name = c['title'].strip()
            if name in seen:
                continue
            seen.add(name)
            docs = safe_mcp('query_space_node', {'space_id':S,'parent_id':c['node_id']}).get('children',[])
            for d in docs:
                if d['node_type'] != 'wiki_file':
                    continue
                meta = course_map.get(name, {})
                md = TEMPLATE.format(
                    name=name,
                    credits=meta.get('credits','-'),
                    semester=meta.get('semester','-'),
                    nature=meta.get('nature','-'),
                )
                result = safe_mcp('doc.insert_markdown', {
                    'file_id': d['node_id'], 'index': 0, 'markdown': '# ' + name + '\n\n' + md
                })
                good = isinstance(result, dict) and ('edit_result' in result or result.get('last_index'))
                if good:
                    ok += 1; sys.stdout.write('+')
                else:
                    fail += 1; sys.stdout.write('x')
                break
            time.sleep(0.1)
        sys.stdout.write(' [%s] ok:%d fail:%d\n' % (sem_name, ok, fail)); sys.stdout.flush()
        total_ok += ok; total_fail += fail

print('\n===== DONE =====')
print('OK:%d FAIL:%d' % (total_ok, total_fail))

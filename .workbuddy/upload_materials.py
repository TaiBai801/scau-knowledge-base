# -*- coding: utf-8 -*-
"""上传 data/materials.json 到 COS（密钥从环境变量读）"""
import hashlib, hmac, time, os, requests

HOST = 'scau-files-1440179010.cos.ap-chengdu.myqcloud.com'
SECRET_ID = os.environ.get('COS_SECRET_ID', '')
SECRET_KEY = os.environ.get('COS_SECRET_KEY', '')

def auth(method, path):
    now = int(time.time()); kt = f'{now};{now+3600}'
    sk = hmac.new(SECRET_KEY.encode(), kt.encode(), hashlib.sha1).hexdigest()
    s = hashlib.sha1(f'{method}\n{path}\n\nhost={HOST}\n'.encode()).hexdigest()
    sig = hmac.new(sk.encode(), f'sha1\n{kt}\n{s}\n'.encode(), hashlib.sha1).hexdigest()
    return f'q-sign-algorithm=sha1&q-ak={SECRET_ID}&q-sign-time={kt}&q-key-time={kt}&q-header-list=host&q-url-param-list=&q-signature={sig}'

key = 'data/materials.json'
local = r'D:\培养方案拓展\data\materials.json'
with open(local, 'rb') as f:
    data = f.read()
r = requests.put(f'https://{HOST}/{key}', data=data, headers={
    'Host': HOST,
    'Authorization': auth('put', f'/{key}'),
    'Content-Type': 'application/json',
}, timeout=60)
print(f'上传 materials.json -> {r.status_code}')
print(f'URL: https://{HOST}/{key}')

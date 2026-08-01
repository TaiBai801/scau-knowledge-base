import hashlib, hmac, time, os, requests

SECRET_ID  = os.environ.get('COS_SECRET_ID', '')
SECRET_KEY = os.environ.get('COS_SECRET_KEY', '')
BUCKET     = os.environ.get('COS_BUCKET', 'scau-files-1440179010')
REGION     = 'ap-chengdu'
HOST = f'{BUCKET}.cos.{REGION}.myqcloud.com'

def auth_cos(method, path):
    now = int(time.time())
    kt = f'{now};{now+3600}'
    sk = hmac.new(SECRET_KEY.encode(), kt.encode(), hashlib.sha1).hexdigest()
    http_str = f'{method.lower()}\n{path}\n\nhost={HOST}\n'
    sha1_http = hashlib.sha1(http_str.encode()).hexdigest()
    sig = hmac.new(sk.encode(), f'sha1\n{kt}\n{sha1_http}\n'.encode(), hashlib.sha1).hexdigest()
    return f'q-sign-algorithm=sha1&q-ak={SECRET_ID}&q-sign-time={kt}&q-key-time={kt}&q-header-list=host&q-url-param-list=&q-signature={sig}'

def upload_file(local, cos_key):
    url = f'https://{HOST}/{cos_key}'
    with open(local, 'rb') as f:
        data = f.read()
    r = requests.put(url, data=data, headers={
        'Host': HOST,
        'Authorization': auth_cos('put', f'/{cos_key}'),
    }, timeout=30)
    if r.status_code in (200, 204):
        return True
    print(f'  FAIL {cos_key}: {r.status_code} {r.text[:200]}')
    return False

print('=== Uploading ===')
total = ok = 0
root = 'D:/培养方案拓展/public/files'
for dirpath, _, filenames in os.walk(root):
    for fn in filenames:
        local = os.path.join(dirpath, fn)
        rel = os.path.relpath(local, root).replace('\\', '/')
        cos = f'files/{rel}'
        total += 1
        if upload_file(local, cos):
            ok += 1
            md5 = hashlib.md5(open(local,'rb').read()).hexdigest()[:8]
            print(f'  ✓ {cos}')
        else:
            break
print(f'Done: {ok}/{total}')

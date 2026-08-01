import os
root = r'C:/Users/ASUS1/Desktop/课程资料整理'
skip = '【有版权】单独存放'

for semester in sorted(os.listdir(root)):
    sp = os.path.join(root, semester)
    if not os.path.isdir(sp) or semester == skip: continue
    for course in sorted(os.listdir(sp)):
        cp = os.path.join(sp, course)
        if not os.path.isdir(cp): continue
        count = 0; size = 0
        for _, _, fnames in os.walk(cp):
            for fn in fnames:
                if not fn.startswith('~$') and not fn.startswith('.'):
                    count += 1
                    size += os.path.getsize(os.path.join(cp, fn))
        print(f'  {course}: {count} files, {size/1024/1024:.0f}MB')

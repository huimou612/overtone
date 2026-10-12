"""校验 .github/workflows/release.yml：
1) YAML 能否解析
2) 每个 run: 块能否通过 bash -n 语法检查
3) 打包命令是否都存在于 package.json 的 scripts 里
"""
import io
import json
import os
import subprocess
import sys
import tempfile

import yaml

WF = '.github/workflows/release.yml'
PKG = 'package.json'

# 本机 PATH 里的 `bash` 会解析到 WSL 的 bash（被安全策略拦截），必须用绝对路径。
# 找 Git Bash 自带的 bash.exe：先从 PATH 上的 sh/bash 反推 PortableGit 根目录。
def find_bash():
    import shutil
    for probe in ('bash', 'sh'):
        p = shutil.which(probe)
        if not p:
            continue
        root = os.path.dirname(os.path.dirname(p))  # .../PortableGit/usr
        cand = os.path.join(root, 'bin', 'bash.exe')
        if os.path.exists(cand):
            return cand
        if p.lower().endswith(('bash.exe', 'bash')):
            return p
    for pat in (r'C:\Program Files\Git\bin\bash.exe',
                r'C:\Program Files\Git\usr\bin\bash.exe'):
        if os.path.exists(pat):
            return pat
    raise SystemExit('找不到可用的 bash，无法做语法检查')


BASH = find_bash()
print('using bash:', BASH)

d = yaml.safe_load(io.open(WF, encoding='utf-8'))
print('YAML OK')
print('jobs:', list(d['jobs'].keys()))
print('concurrency:', d.get('concurrency'))
print('permissions:', d.get('permissions'))
print('on:', d.get(True))
print('Release.needs:', d['jobs']['Release']['needs'])
print()

scripts = set(json.load(io.open(PKG, encoding='utf-8'))['scripts'])

bad = 0
used_npm = set()
for jn, job in d['jobs'].items():
    for st in job.get('steps', []):
        script = st.get('run')
        if not script:
            continue
        body = script.getvalue() if hasattr(script, 'getvalue') else str(script)
        shell = st.get('shell', 'bash')

        # 收集用到的 npm run 目标
        for tok in body.split():
            if tok.startswith('npm'):
                continue
        import re
        for m in re.finditer(r'npm run ([\w:.-]+)', body):
            used_npm.add(m.group(1))

        if shell == 'pwsh':
            print(f'  [skip-pwsh ] {jn} / {st["name"]}')
            continue

        fd, tmp = tempfile.mkstemp(suffix='.sh')
        os.close(fd)
        io.open(tmp, 'w', encoding='utf-8', newline='\n').write(body)
        r = subprocess.run([BASH, '-n', tmp], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        if r.returncode != 0:
            bad += 1
            print(f'  [FAIL bash] {jn} / {st["name"]}')
            print('      ', r.stderr.strip()[:600])
        else:
            print(f'  [ok   bash] {jn} / {st["name"]}  ({len(body.splitlines())} lines)')
        os.unlink(tmp)

print()
print('bash syntax failures:', bad)

missing = sorted(t for t in used_npm if t not in scripts)
print('npm run 目标总数:', len(used_npm))
if missing:
    print('!! package.json 中不存在的 script:')
    for t in missing:
        print('   -', t)
else:
    print('全部 npm run 目标均存在于 package.json')

# 关键点：不能再用 publish:*（那会重新引入 draft 竞态）
pubs = sorted(t for t in used_npm if t.startswith('publish'))
print('仍在使用的 publish:* ->', pubs if pubs else '（无，符合预期）')

sys.exit(1 if (bad or missing or pubs) else 0)

"""Watch the startup sequence over CDP and report when the splash appears and goes.

The splash lives for ~1.4s in production, so this polls /json every 0.3s to catch both edges. It
records *every* page target, not just the splash, because the question that matters is the overlap:
the splash is alwaysOnTop, so if it is still alive after the main window shows, it is covering the UI.

Timings are measured from the moment the first target shows up, not from process start — the dev
build spends most of its wall clock in webpack before Electron even launches.
"""
import json
import sys
import time
import urllib.request

PORT = 9222
DEADLINE_S = float(sys.argv[1]) if len(sys.argv) > 1 else 300.0
POLL_S = 0.3


def targets():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2) as response:
            return json.load(response)
    except Exception:
        return []


def classify(url):
    if 'splash.html' in url:
        return 'SPLASH'
    if url.startswith('http') or url.startswith('file'):
        return 'MAIN'
    return 'OTHER'


alive = {}
timeline = []
splash_gone_at = None
started = None
boot = time.time()

while time.time() - boot < DEADLINE_S:
    now = time.time()

    seen_pages = {}
    for item in targets():
        if item.get('type') != 'page':
            continue
        url = str(item.get('url') or '')
        # devtools 目标会跟着窗口一起出现，混进时间线只会制造噪音
        if url.startswith('devtools://'):
            continue
        seen_pages[item.get('id')] = url

    if started is None:
        # dev 下主进程要编译几十秒才轮到 Electron 启动，这段时间 CDP 里什么都没有。
        # 等真的出现页面再开始计时，否则时间线前面是一大段无意义的空白。
        if not seen_pages:
            time.sleep(POLL_S)
            continue
        started = now

    rel = now - started

    for tid, url in seen_pages.items():
        if tid in alive:
            continue
        alive[tid] = {'url': url, 'first': rel}
        kind = classify(url)
        short = url if len(url) <= 88 else url[:85] + '...'
        timeline.append((rel, '出现', f'{kind}  {short}'))

    for tid, info in alive.items():
        if tid in seen_pages or 'last' in info:
            continue
        info['last'] = rel
        kind = classify(info['url'])
        timeline.append((rel, '消失', f'{kind}  (存活 {rel - info["first"]:.2f}s)'))
        if kind == 'SPLASH':
            splash_gone_at = rel

    if splash_gone_at is not None and any(classify(v['url']) == 'MAIN' for v in alive.values()):
        # 两个边都拿到了，收工
        break

    time.sleep(POLL_S)

elapsed = time.time() - started if started else 0
print(f'观测时长 {elapsed:.1f}s')
print('---- 时间线 ----')
if not timeline:
    print('  （什么都没观测到）')
for rel, kind, label in timeline:
    print(f'  {rel:7.2f}s  {kind}  {label}')

splashes = [v for v in alive.values() if classify(v['url']) == 'SPLASH']
if not splashes:
    print('结论 FAIL：没有观测到 splash.html —— 入场动画根本没显示')
    sys.exit(1)

info = splashes[0]
if 'last' not in info:
    print(f'结论 FAIL：splash 出现了，但 {elapsed:.1f}s 内一直没消失（兜底上限没生效？）')
    sys.exit(1)

shown = info['last'] - info['first']
mains = [v for v in alive.values() if classify(v['url']) == 'MAIN']
print(f'结论：splash 存活 {shown:.2f}s，主窗口目标 {len(mains)} 个')

if not mains:
    print('结论 FAIL：没有观测到主窗口目标')
    sys.exit(1)

main_first = min(v['first'] for v in mains)
if main_first < info['first']:
    print(f'提示：主窗口目标（{main_first:.2f}s）早于 splash（{info["first"]:.2f}s）出现')
print('PASS：splash 出现、并在主窗口就绪后消失')

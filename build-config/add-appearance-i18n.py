"""Insert the `setting__appearance*` i18n keys into all four locale files.

Inserted right after `setting__basic` so the new "外观与个性化" tab sits next to the basic tab it
belongs with. Same validation as add-stem-i18n.py: JSON parses, the four locales keep identical key
sets, and no value is empty.
"""
import io
import json
import os
import sys

HERE = r'F:\workbuddy\2026-10-12-13-28-07\fusion-music\app\src\lang'

KEYS = [
    ('setting__appearance', {
        'zh-cn': '外观与个性化',
        'zh-tw': '外觀與個人化',
        'en-us': 'Appearance',
        'ko-kr': '모양 및 개인 설정',
    }),
    ('setting__appearance_splash', {
        'zh-cn': '启动动画',
        'zh-tw': '啟動動畫',
        'en-us': 'Splash screen',
        'ko-kr': '시작 화면',
    }),
    ('setting__appearance_splash_desc', {
        'zh-cn': '点开软件到界面出现之间有一小段空窗，要等设置和数据加载。启动动画就是用来填这段时间的，填满了才不会先看到一个空的窗口。',
        'zh-tw': '點開軟體到介面出現之間有一小段空窗，要等設定與資料載入。啟動動畫就是用來填這段時間的，填滿了才不會先看到一個空的視窗。',
        'en-us': 'There is a short gap between clicking the icon and the UI appearing, while settings and data load. The splash screen fills it so you never stare at an empty window.',
        'ko-kr': '아이콘을 눌러 화면이 나타나기까지 설정과 데이터를 불러오는 짧은 공백이 있습니다. 시작 화면이 이 시간을 채워 빈 창을 보지 않게 합니다.',
    }),
    ('setting__appearance_splash_enable', {
        'zh-cn': '显示启动动画',
        'zh-tw': '顯示啟動動畫',
        'en-us': 'Show splash screen',
        'ko-kr': '시작 화면 표시',
    }),
    ('setting__appearance_splash_image', {
        'zh-cn': '自定义图片',
        'zh-tw': '自訂圖片',
        'en-us': 'Custom image',
        'ko-kr': '사용자 이미지',
    }),
    ('setting__appearance_splash_image_pick', {
        'zh-cn': '选择图片',
        'zh-tw': '選擇圖片',
        'en-us': 'Choose image',
        'ko-kr': '이미지 선택',
    }),
    ('setting__appearance_splash_image_clear', {
        'zh-cn': '清除',
        'zh-tw': '清除',
        'en-us': 'Clear',
        'ko-kr': '지우기',
    }),
    ('setting__appearance_splash_image_none', {
        'zh-cn': '未设置，使用内置标识',
        'zh-tw': '未設定，使用內建標識',
        'en-us': 'Not set — using the built-in mark',
        'ko-kr': '설정되지 않음 — 기본 표시 사용',
    }),
    ('setting__appearance_splash_image_tip', {
        'zh-cn': '建议用透明背景的 PNG，高度 88 像素左右。',
        'zh-tw': '建議用透明背景的 PNG，高度 88 像素左右。',
        'en-us': 'A transparent PNG around 88px tall works best.',
        'ko-kr': '투명 배경 PNG, 높이 88픽셀 정도를 권장합니다.',
    }),
    ('setting__appearance_splash_title', {
        'zh-cn': '标题文字',
        'zh-tw': '標題文字',
        'en-us': 'Title text',
        'ko-kr': '제목 텍스트',
    }),
    ('setting__appearance_splash_title_placeholder', {
        'zh-cn': '留空则显示应用名',
        'zh-tw': '留空則顯示應用程式名稱',
        'en-us': 'Leave empty to use the app name',
        'ko-kr': '비워 두면 앱 이름이 표시됩니다',
    }),
    ('setting__appearance_splash_min', {
        'zh-cn': '最短显示时长',
        'zh-tw': '最短顯示時長',
        'en-us': 'Minimum duration',
        'ko-kr': '최소 표시 시간',
    }),
    ('setting__appearance_splash_sec', {
        'zh-cn': '{n} 秒',
        'zh-tw': '{n} 秒',
        'en-us': '{n} s',
        'ko-kr': '{n}초',
    }),
    ('setting__appearance_splash_min_tip', {
        'zh-cn': '界面准备得更快时也会等满这么久。否则启动快的机器上它会一闪而过，观感比没有还差。',
        'zh-tw': '介面準備得更快時也會等滿這麼久。否則啟動快的機器上它會一閃而過，觀感比沒有還差。',
        'en-us': 'Even if the UI is ready sooner, the splash stays this long. Otherwise it flashes by on fast machines, which looks worse than having none.',
        'ko-kr': '화면이 더 빨리 준비되어도 이 시간만큼 유지합니다. 그렇지 않으면 빠른 기기에서 깜빡이고 지나가 오히려 보기 나쁩니다.',
    }),
    ('setting__appearance_splash_tip', {
        'zh-cn': '修改后重启应用生效。',
        'zh-tw': '修改後重新啟動應用程式生效。',
        'en-us': 'Restart the app to apply.',
        'ko-kr': '앱을 다시 시작하면 적용됩니다.',
    }),
]

LOCALES = ['zh-cn', 'zh-tw', 'en-us', 'ko-kr']


def insert(locale):
    path = os.path.join(HERE, locale + '.json')
    with io.open(path, encoding='utf-8') as handle:
        text = handle.read()

    existing = json.loads(text)
    # Idempotent: running twice must not insert the block twice.
    pending = [(key, values) for key, values in KEYS if key not in existing]
    if not pending:
        return existing, 0

    lines = text.split('\n')
    # 精确锚点：`"setting__basic"` 后面还跟着一堆 `"setting__basic_xxx"`，
    # 前缀匹配会落到最后一条 `_xxx` 上去。
    anchor = max(index for index, line in enumerate(lines) if line.lstrip().startswith('"setting__basic":'))

    block = []
    for key, values in pending:
        block.append(f'  {json.dumps(key, ensure_ascii=False)}: {json.dumps(values[locale], ensure_ascii=False)},')

    merged = lines[:anchor + 1] + block + lines[anchor + 1:]
    out = '\n'.join(merged)

    # validate before writing: a broken locale file takes the whole UI down, not just one string
    parsed = json.loads(out)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(out)
    return parsed, len(pending)


# every locale must start from the same key set, or the counts below prove nothing
before = {}
for locale in LOCALES:
    with io.open(os.path.join(HERE, locale + '.json'), encoding='utf-8') as handle:
        before[locale] = set(json.load(handle))
if len({frozenset(value) for value in before.values()}) != 1:
    print('locale key sets already differ, refusing to proceed')
    sys.exit(1)
print(f'before: {len(before["zh-cn"])} keys, all four identical')

after = {}
for locale in LOCALES:
    after[locale], added_now = insert(locale)
    print(f'  {locale}: +{added_now}')

counts = {locale: len(value) for locale, value in after.items()}
print('after :', counts)
if len(set(counts.values())) != 1:
    print('FAIL: key counts diverged')
    sys.exit(1)

added = sorted(set(after['zh-cn']) - before['zh-cn'])
print(f'added {len(added)} keys: {added[0]} .. {added[-1]}')
empty = [key for key, values in KEYS for locale in LOCALES if not str(values[locale]).strip()]
print('empty values:', empty)
if empty or len(added) != len(KEYS):
    sys.exit(1)
print('OK')

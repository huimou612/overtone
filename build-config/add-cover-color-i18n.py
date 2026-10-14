#!/usr/bin/env python3
"""为「跟随封面取色」补 4 个设置项文案（阶段 8）。

做法：在 `setting__appearance_splash` 那一行**之前**插入新键。

为什么不是「追加到文件末尾」——语言文件是 JSON 对象，键的顺序只影响可读性，
但同一个键出现两次时是**后者胜出**，而「新增一行 + 保留原行」正是上一轮
（add-mode-i18n.py）踩过的坑：文件里看着有两份，实际生效的是旧的。
所以这里统一按「先删后插」处理：重复执行也只会得到一份，且位置固定。

跑完会做三项校验：JSON 可解析、全文无重复键、总键数符合预期。
"""

import json
import re
import sys
from pathlib import Path

LANG_DIR = Path(__file__).resolve().parent.parent / 'src' / 'lang'

# 插入锚点：新键会插在这一行的前面
ANCHOR = '"setting__appearance_splash":'

TEXTS = {
    'zh-cn': {
        'setting__appearance_cover': '跟随封面取色',
        'setting__appearance_cover_desc': '从当前播放歌曲的封面里提出主色，让背景的氛围跟着这首歌走 —— 一首歌一个味道，切歌就换。',
        'setting__appearance_cover_enable': '开启跟随封面取色',
        'setting__appearance_cover_tip': '背景色不透明的主题会盖住背景层，配合半透明主题或壁纸才能看到效果。',
    },
    'zh-tw': {
        'setting__appearance_cover': '跟隨封面取色',
        'setting__appearance_cover_desc': '從目前播放歌曲的封面提出主色，讓背景氛圍跟著這首歌走 —— 一首歌一個味道，切歌就換。',
        'setting__appearance_cover_enable': '開啟跟隨封面取色',
        'setting__appearance_cover_tip': '背景色不透明的佈景主題會蓋住背景層，搭配半透明主題或桌布才看得到效果。',
    },
    'en-us': {
        'setting__appearance_cover': 'Cover color',
        'setting__appearance_cover_desc': "Pull the dominant color out of the current track's cover art and let the background follow the song — one song, one mood, a new one with every skip.",
        'setting__appearance_cover_enable': 'Follow the album cover color',
        'setting__appearance_cover_tip': 'A theme with an opaque background hides the background layer. Pair this with a translucent theme or a wallpaper to see it.',
    },
    'ko-kr': {
        'setting__appearance_cover': '커버 색상 추출',
        'setting__appearance_cover_desc': '현재 재생 중인 곡의 커버에서 대표 색을 뽑아 배경 분위기가 곡을 따라가게 합니다. 곡마다 다른 분위기가 만들어집니다.',
        'setting__appearance_cover_enable': '커버 색상 따라가기',
        'setting__appearance_cover_tip': '배경이 불투명한 테마에서는 배경 레이어가 가려집니다. 반투명 테마나 배경 화면과 함께 사용해야 효과를 볼 수 있습니다.',
    },
}


def strip_existing(lines, keys):
    """去掉已经存在的这些键所在的行（幂等的前提）。"""
    pattern = re.compile(r'^\s*"(' + '|'.join(re.escape(k) for k in keys) + r')"\s*:')
    return [line for line in lines if not pattern.match(line)]


def process(path, texts):
    raw = path.read_text(encoding='utf-8')
    lines = raw.splitlines()

    before = len(json.loads(raw))
    lines = strip_existing(lines, texts.keys())

    # 锚点行必须唯一，否则插入位置就不确定了
    hits = [i for i, line in enumerate(lines) if ANCHOR in line]
    if len(hits) != 1:
        raise SystemExit(f'{path.name}: 锚点 {ANCHOR} 命中 {len(hits)} 次，应为 1 次')
    at = hits[0]

    inserted = [f'  "{key}": {json.dumps(value, ensure_ascii=False)},' for key, value in texts.items()]
    lines[at:at] = inserted

    text = '\n'.join(lines) + '\n'

    # 校验一：能解析
    data = json.loads(text)
    # 校验二：全文没有重复键（JSON 解析器不报这个，得自己数）
    seen = {}
    for line in lines:
        match = re.match(r'^\s*"([^"]+)"\s*:', line)
        if match:
            seen[match.group(1)] = seen.get(match.group(1), 0) + 1
    dupes = {key: count for key, count in seen.items() if count > 1}
    if dupes:
        raise SystemExit(f'{path.name}: 出现重复键 {dupes}')
    # 校验三：键数 = 原有 + 新增，且新键都在
    if len(data) != before + len(texts):
        raise SystemExit(f'{path.name}: 键数 {len(data)} != {before} + {len(texts)}')
    for key in texts:
        if not data.get(key):
            raise SystemExit(f'{path.name}: {key} 为空')

    path.write_text(text, encoding='utf-8')
    print(f'{path.name}: {before} -> {len(data)} 键')


def main():
    for name, texts in TEXTS.items():
        path = LANG_DIR / f'{name}.json'
        if not path.exists():
            raise SystemExit(f'缺少语言文件 {path}')
        process(path, texts)
    print('OK')


if __name__ == '__main__':
    sys.exit(main())

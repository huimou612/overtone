# -*- coding: utf-8 -*-
"""给四个语言文件补动态壁纸相关的键（阶段 7.2）。

为什么不手改：四个文件各 800+ 行，手工插容易出现「某个语言漏了 / 缩进不一致 /
逗号丢了」——JSON 一坏整个界面都是 key。这里按行插入，插完立刻用 json.load 校验，
并且对照四份文件的键集合必须完全一致，不一致就报错退出。

锚点选 `"theme_edit_modal__bg_image":`（带冒号）：
不能只匹配 `theme_edit_modal__bg_image`，那样会落到 `__bg_image_add` /
`__bg_image_change` / `__bg_image_remove` 上，位置飘。
"""
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANG_DIR = os.path.join(HERE, '..', 'src', 'lang')

ANCHOR = '"theme_edit_modal__bg_image":'

# 插在锚点之后的键（顺序即界面顺序）
NEW_KEYS = [
    'theme_edit_modal__wallpaper_blur',
    'theme_edit_modal__wallpaper_mask',
    'theme_edit_modal__wallpaper_hint',
]

VALUES = {
    'zh-cn': {
        'theme_edit_modal__wallpaper_blur': '壁纸模糊',
        'theme_edit_modal__wallpaper_mask': '壁纸遮罩',
        'theme_edit_modal__wallpaper_hint': '支持图片与视频，视频建议 30 秒以内',
        'theme_edit_modal__select_bg_file': '选择壁纸文件',
        'theme_edit_modal__bg_image': '壁纸',
    },
    'zh-tw': {
        'theme_edit_modal__wallpaper_blur': '壁紙模糊',
        'theme_edit_modal__wallpaper_mask': '壁紙遮罩',
        'theme_edit_modal__wallpaper_hint': '支援圖片與影片，影片建議 30 秒以內',
        'theme_edit_modal__select_bg_file': '選擇壁紙檔案',
        'theme_edit_modal__bg_image': '壁紙',
    },
    'en-us': {
        'theme_edit_modal__wallpaper_blur': 'Wallpaper blur',
        'theme_edit_modal__wallpaper_mask': 'Wallpaper overlay',
        'theme_edit_modal__wallpaper_hint': 'Images and videos are supported; keep videos under 30s',
        'theme_edit_modal__select_bg_file': 'Select wallpaper file',
        'theme_edit_modal__bg_image': 'Wallpaper',
    },
    'ko-kr': {
        'theme_edit_modal__wallpaper_blur': '배경화면 흐림',
        'theme_edit_modal__wallpaper_mask': '배경화면 오버레이',
        'theme_edit_modal__wallpaper_hint': '이미지와 동영상을 지원합니다. 동영상은 30초 이내를 권장합니다',
        'theme_edit_modal__select_bg_file': '배경화면 파일 선택',
        'theme_edit_modal__bg_image': '배경화면',
    },
}

# 这次要一并改写的既有键（原来只提「图片」，现在也吃视频了）
REWRITE_KEYS = [
    'theme_edit_modal__bg_image',
    'theme_edit_modal__select_bg_file',
]


def line_key(line):
    """取出 `"xxx": ...` 里的 xxx，不是这种形状就返回 None"""
    s = line.strip()
    if not s.startswith('"'):
        return None
    end = s.find('"', 1)
    if end < 0:
        return None
    return s[1:end]


def indent_of(line):
    return line[:len(line) - len(line.lstrip())]


def patch(path, lang):
    with io.open(path, encoding='utf-8') as f:
        lines = f.readlines()

    values = VALUES[lang]
    out = []
    inserted = 0
    rewritten = 0

    for line in lines:
        key = line_key(line)
        # 改写既有键时**只输出新行**，不能再把原行 append 回去。
        # 第一版就是栽在这里：两行都进了文件，于是同一个键出现两次，
        # json.load 取后者（也就是旧值），结果「脚本报成功、界面文案没变」。
        replaced = key in REWRITE_KEYS
        if replaced:
            # 保留原行尾（CRLF/LF）与缩进，只换值
            tail = '\r\n' if line.endswith('\r\n') else '\n'
            out.append('%s"%s": %s,%s' % (indent_of(line), key, json.dumps(values[key], ensure_ascii=False), tail))
            rewritten += 1
        else:
            out.append(line)

        if key == 'theme_edit_modal__bg_image' and inserted == 0:
            tail = '\r\n' if line.endswith('\r\n') else '\n'
            for k in NEW_KEYS:
                out.append('%s"%s": %s,%s' % (indent_of(line), k, json.dumps(values[k], ensure_ascii=False), tail))
                inserted += 1

    if inserted != len(NEW_KEYS):
        sys.exit('❌ %s 未找到锚点 %s（插入 %d/%d）' % (path, ANCHOR, inserted, len(NEW_KEYS)))
    if rewritten != len(REWRITE_KEYS):
        sys.exit('❌ %s 改写 %d/%d 个既有键' % (path, rewritten, len(REWRITE_KEYS)))

    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.writelines(out)
    return inserted, rewritten


def no_duplicates(pairs):
    """json.load 默认「后者胜出」，重复键会被悄悄吃掉。
    这里显式炸出来 —— 上面那个 bug 就是靠它才暴露的。"""
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise ValueError('重复键 %s' % k)
        seen[k] = v
    return seen


def main():
    langs = ['zh-cn', 'zh-tw', 'en-us', 'ko-kr']
    for lang in langs:
        path = os.path.join(LANG_DIR, lang + '.json')
        ins, rew = patch(path, lang)
        print('%s: +%d 新键, ~%d 改写' % (lang, ins, rew))

    # 校验 1：能 parse，且没有重复键
    key_sets = {}
    for lang in langs:
        path = os.path.join(LANG_DIR, lang + '.json')
        with io.open(path, encoding='utf-8') as f:
            try:
                data = json.load(f, object_pairs_hook=no_duplicates)
            except ValueError as e:
                sys.exit('❌ %s 解析失败：%s' % (lang, e))
        key_sets[lang] = set(data.keys())
        empty = [k for k in data if data[k] is None or data[k] == '']
        print('%s: %d 键, 空值 %d' % (lang, len(data), len(empty)))
        if empty:
            sys.exit('❌ %s 有空值：%s' % (lang, empty[:5]))

    # 校验 2：四个语言的键集合必须完全一致
    base = key_sets['zh-cn']
    for lang in langs[1:]:
        if key_sets[lang] != base:
            miss = base - key_sets[lang]
            extra = key_sets[lang] - base
            sys.exit('❌ %s 与 zh-cn 键集合不一致：缺 %s，多 %s' % (lang, sorted(miss)[:5], sorted(extra)[:5]))
    print('✅ 四语言键集合一致，共 %d 键' % len(base))

    # 校验 3：新键都在
    for k in NEW_KEYS:
        if k not in base:
            sys.exit('❌ 缺键 %s' % k)


if __name__ == '__main__':
    main()

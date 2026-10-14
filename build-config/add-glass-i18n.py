# -*- coding: utf-8 -*-
"""
阶段 7.5「通透主题」的文案。

两件事：
  1. 新主题名（theme_overtone_glass / theme_overtone_glass_dark）
  2. 主题编辑器壁纸组的「通透」控件，以及两处提示文案的改写

做法沿用 add-workbench-i18n.py：整份 JSON 读写而不是行级插入。
前提是四个语言文件的字节内容正好等于 json.dumps(indent=2, ensure_ascii=False) + '\n'，
脚本会先验证这一点，不成立就直接退出（宁可报错也不要写出一份格式不一致的文件）。
"""
import io
import json
import os

LANGS = ['zh-cn', 'zh-tw', 'en-us', 'ko-kr']

# 新增键
NEW = {
    'zh-cn': {
        'theme_overtone_glass': '澄澈泛音',
        'theme_overtone_glass_dark': '澄澈夜色',
        'theme_edit_modal__translucent': '内容层通透',
        'theme_edit_modal__translucent_on': '一键通透',
        'theme_edit_modal__translucent_off': '恢复不透明',
    },
    'zh-tw': {
        'theme_overtone_glass': '澄澈泛音',
        'theme_overtone_glass_dark': '澄澈夜色',
        'theme_edit_modal__translucent': '內容層通透',
        'theme_edit_modal__translucent_on': '一鍵通透',
        'theme_edit_modal__translucent_off': '恢復不透明',
    },
    'en-us': {
        'theme_overtone_glass': 'Clear Overtone',
        'theme_overtone_glass_dark': 'Clear Nightfall',
        'theme_edit_modal__translucent': 'Content layer opacity',
        'theme_edit_modal__translucent_on': 'Make translucent',
        'theme_edit_modal__translucent_off': 'Make opaque',
    },
    'ko-kr': {
        'theme_overtone_glass': '맑은 여음',
        'theme_overtone_glass_dark': '맑은 야색',
        'theme_edit_modal__translucent': '콘텐츠 레이어 투명도',
        'theme_edit_modal__translucent_on': '반투명으로',
        'theme_edit_modal__translucent_off': '불투명으로',
    },
}

# 改写既有键的值：原来说了「看不见」，但没说「怎么办」，现在把出路指出来
REWRITE = {
    'zh-cn': {
        'theme_edit_modal__wallpaper_hint': '支持图片与视频，视频建议 30 秒以内。壁纸要被看见，内容层得是半透明的',
        'setting__appearance_cover_tip': '背景不透明的主题会盖住背景层。想让它生效，切到「澄澈泛音」主题，或在主题编辑器里点「一键通透」。',
    },
    'zh-tw': {
        'theme_edit_modal__wallpaper_hint': '支援圖片與影片，影片建議 30 秒以內。桌布要被看見，內容層必須是半透明的',
        'setting__appearance_cover_tip': '背景不透明的佈景主題會蓋住背景層。想讓它生效，切到「澄澈泛音」主題，或在主題編輯器裡點「一鍵通透」。',
    },
    'en-us': {
        'theme_edit_modal__wallpaper_hint': 'Images and videos are supported; keep videos under 30s. To actually see a wallpaper, the content layer must be translucent',
        'setting__appearance_cover_tip': 'A theme with an opaque background hides the background layer. To make it visible, switch to the "Clear Overtone" theme, or click "Make translucent" in the theme editor.',
    },
    'ko-kr': {
        'theme_edit_modal__wallpaper_hint': '이미지와 동영상을 지원합니다. 동영상은 30초 이내를 권장합니다. 배경 화면이 보이려면 콘텐츠 레이어가 반투명해야 합니다',
        'setting__appearance_cover_tip': "배경이 불투명한 테마에서는 배경 레이어가 가려집니다. 효과를 보려면 '맑은 여음' 테마로 전환하거나 테마 편집기에서 '반투명으로'를 누르세요.",
    },
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    lang_dir = os.path.join(here, '..', 'src', 'lang')

    for lang in LANGS:
        path = os.path.join(lang_dir, f'{lang}.json')
        raw = io.open(path, encoding='utf-8').read()
        data = json.loads(raw)

        # 格式守卫：先证明「重写一遍不会产生无关 diff」，再动手
        if json.dumps(data, indent=2, ensure_ascii=False) + '\n' != raw:
            raise SystemExit(f'{lang}.json 的格式与本脚本的序列化方式不一致，已中止')

        before = len(data)
        for key, value in NEW[lang].items():
            if key in data:
                raise SystemExit(f'{lang}.json 里已存在键 {key}，已中止')
            data[key] = value
        for key, value in REWRITE[lang].items():
            if key not in data:
                raise SystemExit(f'{lang}.json 里缺少键 {key}，已中止')
            data[key] = value

        # 文件不是字母序（上游按语义分组排的），所以不能排序 —— 一排序整份文件都会变。
        # 保持原顺序，新键追加到末尾，diff 就只剩新增的那几行。
        # newline 必须显式给 '\r\n'：四个语言包都是 CRLF，按默认写会整份退化成 LF。
        io.open(path, 'w', encoding='utf-8', newline='\r\n').write(
            json.dumps(data, indent=2, ensure_ascii=False) + '\n')

        print(f'{lang}: {before} -> {len(data)} 键（+{len(data) - before}）')


if __name__ == '__main__':
    main()

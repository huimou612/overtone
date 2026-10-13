# -*- coding: utf-8 -*-
"""阶段 7.3：外观模式相关 i18n 键 + 两个缺失的主题名键

行级插入（不是 json.load → json.dump），因为后者的格式化会把整个文件重排成
一大坨 diff，评审时看不出真正改了什么。代价是要自己保证插入位置与逗号正确，
所以末尾有两道校验：解析得动 + 没有重复键。

顺带修一个品牌化遗留的显示缺陷：SettingBasic.vue 对所有内置主题都做
t('theme_' + id) 取名字，而改 id 成 overtone / overtone_dark 时没同步语言文件，
导致主题列表里直接显示字面量 "theme_overtone"。
"""
import io
import json
import os
import re
import sys

LANG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'lang')

VALUES = {
    'zh-cn': {
        'setting__appearance_mode': '外观模式',
        'setting__appearance_mode_desc': '两档外观是同一套界面的两种形态，功能一个不少，区别只在「管理态」与「沉浸态」。',
        'setting__appearance_mode_classic': '经典模式',
        'setting__appearance_mode_personal': '个性模式',
        'setting__appearance_mode_tip_classic': '侧栏常驻、页面直接切换，适合整理歌单、批量改标签这类活儿。',
        'setting__appearance_mode_tip_personal': '侧栏收起（鼠标移到窗口左边缘会滑出），页面切换带过渡动画，启动时若有在听的歌会直接进播放页。',
        'theme_overtone': '余音绕梁',
        'theme_overtone_dark': '夜色泛音',
    },
    'zh-tw': {
        'setting__appearance_mode': '外觀模式',
        'setting__appearance_mode_desc': '兩檔外觀是同一套介面的兩種形態，功能一個不少，差別只在「管理態」與「沉浸態」。',
        'setting__appearance_mode_classic': '經典模式',
        'setting__appearance_mode_personal': '個性模式',
        'setting__appearance_mode_tip_classic': '側欄常駐、頁面直接切換，適合整理歌單、批次改標籤這類活兒。',
        'setting__appearance_mode_tip_personal': '側欄收起（滑鼠移到視窗左邊緣會滑出），頁面切換帶過場動畫，啟動時若有在聽的歌會直接進播放頁。',
        'theme_overtone': '餘音繞樑',
        'theme_overtone_dark': '夜色泛音',
    },
    'en-us': {
        'setting__appearance_mode': 'Appearance mode',
        'setting__appearance_mode_desc': 'The two modes are two forms of the same interface. No feature is lost — it is just management versus immersion.',
        'setting__appearance_mode_classic': 'Classic',
        'setting__appearance_mode_personal': 'Personal',
        'setting__appearance_mode_tip_classic': 'Sidebar stays, pages switch instantly. Best for organising playlists and batch-editing tags.',
        'setting__appearance_mode_tip_personal': 'Sidebar collapses (move the cursor to the left edge to slide it out), page switches fade, and the player opens straight away if a song was playing.',
        'theme_overtone': 'Overtone',
        'theme_overtone_dark': 'Night Overtone',
    },
    'ko-kr': {
        'setting__appearance_mode': '보기 모드',
        'setting__appearance_mode_desc': '두 모드는 같은 인터페이스의 두 가지 형태입니다. 기능은 하나도 빠지지 않고 「관리형」과 「몰입형」의 차이일 뿐입니다.',
        'setting__appearance_mode_classic': '클래식 모드',
        'setting__appearance_mode_personal': '개성 모드',
        'setting__appearance_mode_tip_classic': '사이드바가 고정되고 페이지가 바로 전환됩니다. 재생 목록 정리나 태그 일괄 수정에 적합합니다.',
        'setting__appearance_mode_tip_personal': '사이드바가 접히고(창 왼쪽 가장자리로 마우스를 옮기면 나옵니다), 페이지 전환에 페이드가 적용되며, 듣던 곡이 있으면 시작 시 재생 화면으로 바로 들어갑니다.',
        'theme_overtone': '여음요량',
        'theme_overtone_dark': '야색범음',
    },
}

APPEARANCE_KEYS = [k for k in VALUES['zh-cn'] if k.startswith('setting__')]
THEME_KEYS = [k for k in VALUES['zh-cn'] if k.startswith('theme_')]


def key_of(line):
    m = re.match(r'\s*"([^"]+)"\s*:', line)
    return m.group(1) if m else None


def indent_of(line):
    return line[:len(line) - len(line.lstrip())]


def tail_of(line):
    return '\r\n' if line.endswith('\r\n') else '\n'


def patch(path, lang):
    with io.open(path, encoding='utf-8', newline='') as f:
        lines = f.readlines()

    values = VALUES[lang]
    existing = {key_of(l) for l in lines}

    out = []
    inserted_appearance = 0
    inserted_theme = 0

    for line in lines:
        out.append(line)
        key = key_of(line)

        if key == 'setting__appearance' and inserted_appearance == 0:
            tail = tail_of(line)
            ind = indent_of(line)
            for k in APPEARANCE_KEYS:
                if k in existing:
                    continue
                out.append('%s"%s": %s,%s' % (ind, k, json.dumps(values[k], ensure_ascii=False), tail))
                inserted_appearance += 1

        if key == 'theme_orange' and inserted_theme == 0:
            tail = tail_of(line)
            ind = indent_of(line)
            for k in THEME_KEYS:
                if k in existing:
                    continue
                out.append('%s"%s": %s,%s' % (ind, k, json.dumps(values[k], ensure_ascii=False), tail))
                inserted_theme += 1

    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(''.join(out))

    return inserted_appearance, inserted_theme


def main():
    langs = ['zh-cn', 'zh-tw', 'en-us', 'ko-kr']

    for lang in langs:
        path = os.path.join(LANG_DIR, lang + '.json')
        ins_a, ins_t = patch(path, lang)
        print('%s: +%d 外观键, +%d 主题名键' % (lang, ins_a, ins_t))

    print('--- 校验 ---')
    key_sets = {}
    for lang in langs:
        path = os.path.join(LANG_DIR, lang + '.json')

        # 校验 1：能 parse（重复键 + 尾随逗号都会在这里暴露；但重复键 JSON 会静默取后者，
        #          所以还要单独数一遍出现次数）
        with io.open(path, encoding='utf-8') as f:
            text = f.read()
            data = json.loads(text)

        counts = {}
        for line in text.splitlines():
            k = key_of(line)
            if k:
                counts[k] = counts.get(k, 0) + 1
        dupes = [k for k, c in counts.items() if c > 1]
        if dupes:
            sys.exit('❌ %s 有重复键：%s' % (lang, dupes))

        empty = [k for k, v in data.items() if v is None or v == '']
        if empty:
            sys.exit('❌ %s 有空值：%s' % (lang, empty[:5]))

        key_sets[lang] = set(data.keys())
        print('%s: %d 键, 无重复, 无空值' % (lang, len(data)))

    # 校验 2：四语言键集必须完全一致
    base = key_sets['zh-cn']
    for lang in langs[1:]:
        only_base = base - key_sets[lang]
        only_lang = key_sets[lang] - base
        if only_base or only_lang:
            sys.exit('❌ %s 与 zh-cn 键集不一致：缺 %s，多 %s' % (lang, sorted(only_base)[:5], sorted(only_lang)[:5]))
    print('四语言键集一致 ✓')


if __name__ == '__main__':
    main()

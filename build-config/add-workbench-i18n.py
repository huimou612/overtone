#!/usr/bin/env python3
"""为阶段 6「能力显性化」补 23 个文案键。

三块：
  1. `workbench__nav` —— 侧栏一级入口的提示
  2. `workbench__*`   —— 工作台页面（当前歌曲 / 两张能力卡 / 数据位置）
  3. `player__tool_*` —— 播放详情页常驻工具行的两个胶囊

做法与上一轮（add-cover-color-i18n.py）不同：那里按行插入，这里直接读写 JSON。
依据是先验证过的事实 —— 四个语言文件的字节内容**正好等于**
`json.dumps(data, indent=2, ensure_ascii=False) + '\n'`，所以整份重写不会产生
任何无关的 diff，也就不需要跟行级正则打交道。

插入位置：锚点键 `user_api_import_online__title`（文件里最后一个键）之前。
新功能的文案集中成一块，review 时一眼能看出加了什么。

新键的落点不是字母序位置，而是「跟同一功能的键待在一起」——这也是这个仓库既有
的惯例（`ai_lyric__*` 就整组插在 `alert_button_text` 之后）。
"""

import json
import sys
from pathlib import Path

LANG_DIR = Path(__file__).resolve().parent.parent / 'src' / 'lang'

ANCHOR = 'user_api_import_online__title'

TEXTS = {
    'zh-cn': {
        'workbench__nav': '工作台',
        'workbench__title': '工作台',
        'workbench__subtitle': '泛音自研的音频能力 —— AI 逐字歌词与音源分离，作用在正在播放的这首歌上。',
        'workbench__current': '当前歌曲',
        'workbench__no_song': '还没有正在播放的歌曲，先去搜索或从列表里播放一首。',
        'workbench__lyric_done': '已有逐字歌词',
        'workbench__lyric_none': '尚无逐字歌词',
        'workbench__tools': '可用能力',
        'workbench__ai_lyric': 'AI 逐字歌词',
        'workbench__ai_lyric_desc': '交给模型把每行歌词切到词一级，播放时跟着唱。结果写回本地，不会因为重装丢失。',
        'workbench__ai_ready': '模型已配置',
        'workbench__ai_unready': '未配置 API Key',
        'workbench__stem': '音源分离',
        'workbench__stem_desc': '把这首歌拆成人声与伴奏，各导出一个音频文件，方便做翻唱或卡拉 OK。',
        'workbench__stem_ready': '模型已就绪',
        'workbench__stem_unready': '模型待下载',
        'workbench__stem_unsupported': '当前平台不支持',
        'workbench__paths': '数据位置',
        'workbench__models_dir': '分离模型',
        'workbench__output_dir': '导出结果',
        'workbench__open_dir': '打开目录',
        'player__tool_ai_lyric': '分词',
        'player__tool_stem': '分离',
    },
    'zh-tw': {
        'workbench__nav': '工作台',
        'workbench__title': '工作台',
        'workbench__subtitle': '泛音自研的音訊能力 —— AI 逐字歌詞與音源分離，作用在正在播放的這首歌上。',
        'workbench__current': '目前歌曲',
        'workbench__no_song': '還沒有正在播放的歌曲，先去搜尋或從清單裡播放一首。',
        'workbench__lyric_done': '已有逐字歌詞',
        'workbench__lyric_none': '尚無逐字歌詞',
        'workbench__tools': '可用能力',
        'workbench__ai_lyric': 'AI 逐字歌詞',
        'workbench__ai_lyric_desc': '交給模型把每行歌詞切到詞一級，播放時跟著唱。結果寫回本機，不會因為重裝遺失。',
        'workbench__ai_ready': '模型已設定',
        'workbench__ai_unready': '未設定 API Key',
        'workbench__stem': '音源分離',
        'workbench__stem_desc': '把這首歌拆成人聲與伴奏，各匯出一個音訊檔，方便做翻唱或卡拉 OK。',
        'workbench__stem_ready': '模型已就緒',
        'workbench__stem_unready': '模型待下載',
        'workbench__stem_unsupported': '目前平台不支援',
        'workbench__paths': '資料位置',
        'workbench__models_dir': '分離模型',
        'workbench__output_dir': '匯出結果',
        'workbench__open_dir': '開啟目錄',
        'player__tool_ai_lyric': '分詞',
        'player__tool_stem': '分離',
    },
    'en-us': {
        'workbench__nav': 'Workbench',
        'workbench__title': 'Workbench',
        'workbench__subtitle': "Overtone's own audio tooling — AI word-level lyrics and stem separation, applied to whatever is playing right now.",
        'workbench__current': 'Now playing',
        'workbench__no_song': 'Nothing is playing yet — search for a track, or start one from a playlist.',
        'workbench__lyric_done': 'Word-level lyrics ready',
        'workbench__lyric_none': 'No word-level lyrics yet',
        'workbench__tools': 'Available tools',
        'workbench__ai_lyric': 'AI word-level lyrics',
        'workbench__ai_lyric_desc': 'Hand each lyric line to a model and get it split into words, so the player can follow along. Saved locally.',
        'workbench__ai_ready': 'Model configured',
        'workbench__ai_unready': 'No API key',
        'workbench__stem': 'Stem separation',
        'workbench__stem_desc': 'Split the track into vocals and instrumental and export each as its own file — handy for covers and karaoke.',
        'workbench__stem_ready': 'Model ready',
        'workbench__stem_unready': 'Model not downloaded',
        'workbench__stem_unsupported': 'Not supported on this platform',
        'workbench__paths': 'File locations',
        'workbench__models_dir': 'Stems model',
        'workbench__output_dir': 'Exports',
        'workbench__open_dir': 'Open folder',
        'player__tool_ai_lyric': 'AI lyrics',
        'player__tool_stem': 'Split stems',
    },
    'ko-kr': {
        'workbench__nav': '작업대',
        'workbench__title': '작업대',
        'workbench__subtitle': '오버톤 자체 오디오 기능 — AI 단어별 가사와 음원 분리. 지금 재생 중인 곡에 적용됩니다.',
        'workbench__current': '현재 곡',
        'workbench__no_song': '아직 재생 중인 곡이 없습니다. 먼저 검색하거나 목록에서 곡을 재생해 주세요.',
        'workbench__lyric_done': '단어별 가사 있음',
        'workbench__lyric_none': '단어별 가사 없음',
        'workbench__tools': '사용 가능한 기능',
        'workbench__ai_lyric': 'AI 단어별 가사',
        'workbench__ai_lyric_desc': '각 가사 줄을 모델에 넘겨 단어 단위로 나눕니다. 재생할 때 따라 부를 수 있고, 결과는 로컬에 저장됩니다.',
        'workbench__ai_ready': '모델 설정됨',
        'workbench__ai_unready': 'API Key 미설정',
        'workbench__stem': '음원 분리',
        'workbench__stem_desc': '곡을 보컬과 반주로 나누어 각각 파일로 내보냅니다. 커버나 노래방에 유용합니다.',
        'workbench__stem_ready': '모델 준비됨',
        'workbench__stem_unready': '모델 다운로드 필요',
        'workbench__stem_unsupported': '이 플랫폼에서는 지원되지 않습니다',
        'workbench__paths': '데이터 위치',
        'workbench__models_dir': '분리 모델',
        'workbench__output_dir': '내보낸 결과',
        'workbench__open_dir': '폴더 열기',
        'player__tool_ai_lyric': 'AI 가사',
        'player__tool_stem': '음원 분리',
    },
}


def process(path, texts):
    raw = path.read_text(encoding='utf-8')
    data = json.loads(raw)

    # 幂等的前提：先把可能已经存在的同名键摘掉，重跑不会留下两份
    for key in texts:
        data.pop(key, None)
    base = len(data)

    if ANCHOR not in data:
        raise SystemExit(f'{path.name}: 找不到锚点 {ANCHOR}')

    merged = {}
    for key, value in data.items():
        if key == ANCHOR:
            merged.update(texts)
        merged[key] = value

    if len(merged) != base + len(texts):
        raise SystemExit(f'{path.name}: 键数 {len(merged)} != {base} + {len(texts)}')
    for key in texts:
        if not merged.get(key):
            raise SystemExit(f'{path.name}: {key} 为空')

    text = json.dumps(merged, indent=2, ensure_ascii=False) + '\n'
    # 写回前再确认一次：解析得回来，且键数对得上
    if len(json.loads(text)) != len(merged):
        raise SystemExit(f'{path.name}: 写回后解析不一致')

    path.write_text(text, encoding='utf-8')
    print(f'{path.name}: {base} -> {len(merged)} 键（+{len(texts)}）')


def main():
    for name, texts in TEXTS.items():
        path = LANG_DIR / f'{name}.json'
        if not path.exists():
            raise SystemExit(f'缺少语言文件 {path}')
        process(path, texts)
    print('OK')


if __name__ == '__main__':
    sys.exit(main())

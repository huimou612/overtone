"""Insert the `stem__*` i18n keys into all four locale files.

Inserted right after the last `ai_lyric__` key so the two ported features stay adjacent, and
validated afterwards: JSON parses, key sets are identical across the four files, and no key has an
empty value. A locale that silently misses a key renders the raw key name in the UI, which is the
kind of "it works" that ships.
"""
import io
import json
import os
import re
import sys

HERE = r'F:\workbuddy\2026-10-12-13-28-07\fusion-music\app\src\lang'

KEYS = [
    ('stem__menu', {
        'zh-cn': '音源分离…',
        'zh-tw': '音源分離…',
        'en-us': 'Stem separation…',
        'ko-kr': '음원 분리…',
    }),
    ('stem__title', {
        'zh-cn': '音源分离',
        'zh-tw': '音源分離',
        'en-us': 'Stem separation',
        'ko-kr': '음원 분리',
    }),
    ('stem__desc', {
        'zh-cn': '把当前播放的歌曲分离成人声与伴奏两个 WAV 文件。整个过程都在本机完成，不会上传任何音频。',
        'zh-tw': '把目前播放的歌曲分離成人聲與伴奏兩個 WAV 檔案。整個過程都在本機完成，不會上傳任何音訊。',
        'en-us': 'Split the song that is playing into two WAV files: vocals and accompaniment. Everything happens on this machine; no audio is uploaded.',
        'ko-kr': '재생 중인 곡을 보컬과 반주 두 개의 WAV 파일로 분리합니다. 모든 처리는 이 컴퓨터에서 이루어지며 오디오를 업로드하지 않습니다.',
    }),
    ('stem__checking', {
        'zh-cn': '正在检查模型…',
        'zh-tw': '正在檢查模型…',
        'en-us': 'Checking the model…',
        'ko-kr': '모델을 확인하는 중…',
    }),
    ('stem__unsupported', {
        'zh-cn': '当前平台没有可用的分离运行时。这个功能在 64 位 Windows、Linux 和 Apple 芯片的 macOS 上可用。',
        'zh-tw': '目前平台沒有可用的分離執行環境。這個功能在 64 位元 Windows、Linux 與 Apple 晶片的 macOS 上可用。',
        'en-us': 'There is no separation runtime for this platform. The feature is available on 64-bit Windows, Linux, and Apple-silicon macOS.',
        'ko-kr': '이 플랫폼에는 사용할 수 있는 분리 런타임이 없습니다. 64비트 Windows, Linux, Apple 실리콘 macOS에서 사용할 수 있습니다.',
    }),
    ('stem__model_htdemucs', {
        'zh-cn': '分离模型 htdemucs',
        'zh-tw': '分離模型 htdemucs',
        'en-us': 'Separation model htdemucs',
        'ko-kr': '분리 모델 htdemucs',
    }),
    ('stem__model_runtime', {
        'zh-cn': 'Python 运行时',
        'zh-tw': 'Python 執行環境',
        'en-us': 'Python runtime',
        'ko-kr': 'Python 런타임',
    }),
    ('stem__installed', {
        'zh-cn': '已安装',
        'zh-tw': '已安裝',
        'en-us': 'Installed',
        'ko-kr': '설치됨',
    }),
    ('stem__download', {
        'zh-cn': '下载',
        'zh-tw': '下載',
        'en-us': 'Download',
        'ko-kr': '다운로드',
    }),
    ('stem__downloading', {
        'zh-cn': '下载中 {percent}%',
        'zh-tw': '下載中 {percent}%',
        'en-us': 'Downloading {percent}%',
        'ko-kr': '다운로드 중 {percent}%',
    }),
    ('stem__download_failed', {
        'zh-cn': '下载失败：{reasons}',
        'zh-tw': '下載失敗：{reasons}',
        'en-us': 'Download failed: {reasons}',
        'ko-kr': '다운로드 실패: {reasons}',
    }),
    ('stem__cancel', {
        'zh-cn': '取消',
        'zh-tw': '取消',
        'en-us': 'Cancel',
        'ko-kr': '취소',
    }),
    ('stem__models_dir', {
        'zh-cn': '模型目录',
        'zh-tw': '模型目錄',
        'en-us': 'Models folder',
        'ko-kr': '모델 폴더',
    }),
    ('stem__manual', {
        'zh-cn': '镜像都连不上时，可以先用网盘手动下载，把文件放进上面这个模型目录：',
        'zh-tw': '鏡像都連不上時，可以先用網盤手動下載，把檔案放進上面這個模型目錄：',
        'en-us': 'If no mirror is reachable, download the file by hand and put it in the models folder above:',
        'ko-kr': '미러에 연결할 수 없으면 직접 내려받아 위의 모델 폴더에 넣어 주세요:',
    }),
    ('stem__manual_code', {
        'zh-cn': '提取码',
        'zh-tw': '提取碼',
        'en-us': 'code',
        'ko-kr': '추출 코드',
    }),
    ('stem__song', {
        'zh-cn': '当前歌曲',
        'zh-tw': '目前歌曲',
        'en-us': 'Current song',
        'ko-kr': '현재 곡',
    }),
    ('stem__no_song', {
        'zh-cn': '没有正在播放的歌曲',
        'zh-tw': '沒有正在播放的歌曲',
        'en-us': 'Nothing is playing',
        'ko-kr': '재생 중인 곡이 없습니다',
    }),
    ('stem__duration', {
        'zh-cn': '时长',
        'zh-tw': '長度',
        'en-us': 'Length',
        'ko-kr': '길이',
    }),
    ('stem__output_dir', {
        'zh-cn': '导出目录',
        'zh-tw': '匯出目錄',
        'en-us': 'Export folder',
        'ko-kr': '내보내기 폴더',
    }),
    ('stem__start', {
        'zh-cn': '开始分离',
        'zh-tw': '開始分離',
        'en-us': 'Start separation',
        'ko-kr': '분리 시작',
    }),
    ('stem__decoding', {
        'zh-cn': '正在解码…',
        'zh-tw': '正在解碼…',
        'en-us': 'Decoding…',
        'ko-kr': '디코딩 중…',
    }),
    ('stem__decoding_hint', {
        'zh-cn': '正在读取并解码这首歌的音频…',
        'zh-tw': '正在讀取並解碼這首歌的音訊…',
        'en-us': "Reading and decoding this song's audio…",
        'ko-kr': '이 곡의 오디오를 읽고 디코딩하는 중…',
    }),
    ('stem__loading_model', {
        'zh-cn': '正在加载模型…',
        'zh-tw': '正在載入模型…',
        'en-us': 'Loading the model…',
        'ko-kr': '모델을 불러오는 중…',
    }),
    ('stem__separating', {
        'zh-cn': '正在分离 {percent}%',
        'zh-tw': '正在分離 {percent}%',
        'en-us': 'Separating {percent}%',
        'ko-kr': '분리 중 {percent}%',
    }),
    ('stem__abort', {
        'zh-cn': '中止',
        'zh-tw': '中止',
        'en-us': 'Abort',
        'ko-kr': '중단',
    }),
    ('stem__done', {
        'zh-cn': '已导出两个文件：',
        'zh-tw': '已匯出兩個檔案：',
        'en-us': 'Two files exported:',
        'ko-kr': '두 파일을 내보냈습니다:',
    }),
    ('stem__vocals', {
        'zh-cn': '人声',
        'zh-tw': '人聲',
        'en-us': 'Vocals',
        'ko-kr': '보컬',
    }),
    ('stem__accompaniment', {
        'zh-cn': '伴奏',
        'zh-tw': '伴奏',
        'en-us': 'Accompaniment',
        'ko-kr': '반주',
    }),
    ('stem__open_dir', {
        'zh-cn': '打开所在文件夹',
        'zh-tw': '開啟所在資料夾',
        'en-us': 'Open containing folder',
        'ko-kr': '폴더 열기',
    }),
    ('stem__remove', {
        'zh-cn': '删除模型（释放约 140 MB）',
        'zh-tw': '刪除模型（釋放約 140 MB）',
        'en-us': 'Delete the model (frees about 140 MB)',
        'ko-kr': '모델 삭제(약 140 MB 확보)',
    }),
    ('stem__removed', {
        'zh-cn': '已释放 {size}',
        'zh-tw': '已釋放 {size}',
        'en-us': 'Freed {size}',
        'ko-kr': '{size} 확보',
    }),
    ('stem__tip', {
        'zh-cn': '四分钟的歌曲大约需要两三分钟。分离期间应用可以照常使用，只是 CPU 会比较忙。',
        'zh-tw': '四分鐘的歌曲大約需要兩三分鐘。分離期間應用程式可以照常使用，只是 CPU 會比較忙。',
        'en-us': 'A four-minute song takes roughly two to three minutes. You can keep using the app, but the CPU will be busy.',
        'ko-kr': '4분 곡은 대략 2~3분 걸립니다. 분리하는 동안에도 앱은 계속 쓸 수 있지만 CPU는 바쁩니다.',
    }),
    ('stem__close', {
        'zh-cn': '关闭',
        'zh-tw': '關閉',
        'en-us': 'Close',
        'ko-kr': '닫기',
    }),
]

LOCALES = ['zh-cn', 'zh-tw', 'en-us', 'ko-kr']


def insert(locale):
    path = os.path.join(HERE, locale + '.json')
    with io.open(path, encoding='utf-8') as handle:
        text = handle.read()

    existing = json.loads(text)
    # Idempotent: running this twice must not insert the block twice. Adding a key later means
    # editing KEYS and re-running, which is the only reason this is not a one-shot migration.
    pending = [(key, values) for key, values in KEYS if key not in existing]
    if not pending:
        return existing, 0

    lines = text.split('\n')
    anchor = max(index for index, line in enumerate(lines) if line.lstrip().startswith('"ai_lyric__'))

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
missing = [key for key, values in KEYS if not values]
empty = [key for key, values in KEYS for locale in LOCALES if not str(values[locale]).strip()]
print('empty values:', empty)
if empty or missing:
    sys.exit(1)
print('OK')

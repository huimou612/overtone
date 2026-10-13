# -*- coding: utf-8 -*-
"""
造一个「人声 + 伴奏」的混合测试音频，给界面的端到端验收用。

为什么需要它：本机这个应用实例**没有导入任何音源**（`user_api.json` 是空的 `{}`），
所以在线歌曲一律拿不到 URL，播放器只会报「换源失败」。而分离链路要验的恰恰是
「拿到音频之后」的那一段（渲染层解码 → 写 mix.in → Python 推理 → 落盘），
所以只能喂本地文件 —— 本地音乐走 `pathToFileURL`，是唯一不依赖音源的入口。

素材固定比例混音，于是分离结果还能**客观打分**：人声轨应当与源人声高度相关，
伴奏轨应当与源 BGM 高度相关。只证明「出了两个文件」是不够的。

用法：python build-config/make-test-audio.py [秒数] [输出目录]
"""
import glob
import io
import os
import subprocess
import sys

# WinGet 会在 `WinGet\Links` 下放一个 ffmpeg.exe，但那是 shim，
# Python 直接 CreateProcess 它会报 WinError 193（不是有效的 Win32 应用程序），
# 所以这里探测 Packages 下的真实 exe。
FFMPEG_CANDIDATES = [
    r'C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe',
    r'C:\Users\HP\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe',
]
VOICE_DIR = r'F:\workbuddy\2026-09-08-20-57-05\voice_999'
BGM = r'F:\workbuddy\2026-09-08-20-57-05\bgm_full.wav'
DEFAULT_OUT = r'F:\workbuddy\2026-10-12-13-28-07\fusion-music\test-media'


def find_ffmpeg():
    for item in FFMPEG_CANDIDATES:
        if os.path.exists(item):
            return item
    for item in glob.glob(r'C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\**\bin\ffmpeg.exe', recursive=True):
        return item
    return None


def run(args, label):
    result = subprocess.run(args, capture_output=True, encoding='utf-8', errors='replace')
    if result.returncode != 0:
        print('[FAIL] %s' % label)
        print((result.stderr or '')[-1500:])
        raise SystemExit(1)
    return result


def main():
    seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    out_dir = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT
    os.makedirs(out_dir, exist_ok=True)

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print('[FAIL] 找不到 ffmpeg')
        raise SystemExit(1)
    print('ffmpeg：%s' % ffmpeg)
    voices = sorted(glob.glob(os.path.join(VOICE_DIR, '*.mp3')))
    if not voices or not os.path.exists(BGM):
        print('[FAIL] 素材缺失：voice=%d bgm=%s' % (len(voices), os.path.exists(BGM)))
        raise SystemExit(1)

    # 1) 几段短 TTS 拼成一条足够长的音轨，再用 -stream_loop 循环到目标时长
    list_file = os.path.join(out_dir, 'voice-list.txt')
    with io.open(list_file, 'w', encoding='utf-8') as handle:
        for item in voices:
            # concat demuxer 要的是正斜杠，且单引号要转义
            handle.write("file '%s'\n" % item.replace('\\', '/').replace("'", "'\\''"))

    voice_all = os.path.join(out_dir, 'voice_all.mp3')
    run([ffmpeg, '-y', '-f', 'concat', '-safe', '0', '-i', list_file, '-c', 'copy', voice_all], 'concat 人声')

    # 2) 人声与 BGM 按固定比例混合。比例固定 = 结果可复现 = 相关系数可比。
    #    人声给 1.6、BGM 给 0.28，是为了让分离后的两轨都有足够的能量可供比对。
    target = os.path.join(out_dir, 'overtone-test.wav')
    graph = (
        '[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=1.6[v];'
        '[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.28[b];'
        '[v][b]amix=inputs=2:duration=shortest:normalize=0[o]'
    )
    run([
        ffmpeg, '-y',
        '-stream_loop', '-1', '-i', voice_all,
        '-stream_loop', '-1', '-i', BGM,
        '-t', str(seconds),
        '-filter_complex', graph,
        '-map', '[o]', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le',
        target,
    ], '混音')

    print('产物：%s  %s B  (%.1f 秒)' % (target, format(os.path.getsize(target), ','), seconds))


if __name__ == '__main__':
    main()

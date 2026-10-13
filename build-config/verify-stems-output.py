# -*- coding: utf-8 -*-
"""
给分离产物客观打分 —— 只证明「导出了两个文件」是不够的。

判据：把产物与**已知的源轨**做相关。
  · 人声轨 应当与源人声高度相关，与源伴奏几乎不相关
  · 伴奏轨 应当与源伴奏高度相关，与源人声几乎不相关
即「真配对 ≫ 错配对」。只看相关系数的绝对值会被「两轨都接近原混音」骗过去，
所以两个方向都要算，并且要比较。

只用标准库（wave + array + math）：这台机器上能跑 numpy 的解释器是应用自带的
那份 36MB 运行时，不该让一个校验脚本依赖它。

用法：
  python build-config/verify-stems-output.py [导出目录] [素材目录]
默认导出目录是桌面上的「泛音分离」，素材目录是 fusion-music/test-media。
"""
import array
import math
import os
import subprocess
import sys

DEFAULT_OUT = os.path.join(os.path.expanduser('~'), 'Desktop', '泛音分离')
DEFAULT_MEDIA = r'F:\workbuddy\2026-10-12-13-28-07\fusion-music\test-media'
SECONDS = 20      # 只比对开头这些秒：够代表，又不必读整轨
STRIDE = 50       # 每 50 个采样取一个点；相关系数对这一点下采样不敏感
FFMPEG_CANDIDATES = [
    r'C:\Users\HP\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe',
    r'C:\Users\HP\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe',
]


def find_ffmpeg():
    for item in FFMPEG_CANDIDATES:
        if os.path.exists(item):
            return item
    return None


def read_mono(path, max_seconds=SECONDS, stride=STRIDE):
    """读成单声道采样列表（左右平均），并按 stride 抽点。返回 (samples, sample_rate, seconds)。"""
    import wave
    with wave.open(path, 'rb') as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        total = handle.getnframes()
        want = min(total, int(rate * max_seconds))
        raw = handle.readframes(want)
    if width != 2:
        raise ValueError('%s 不是 16bit PCM（sampwidth=%d）' % (path, width))

    flat = array.array('h')
    flat.frombytes(raw)
    if sys.byteorder == 'big':
        flat.byteswap()

    samples = []
    for index in range(0, want, stride):
        base = index * channels
        if base + channels > len(flat):
            break
        acc = 0
        for channel in range(channels):
            acc += flat[base + channel]
        samples.append(acc / channels)
    return samples, rate, total / float(rate)


def corr(x, y):
    """皮尔逊相关系数。"""
    count = min(len(x), len(y))
    if count < 2:
        return 0.0
    x = x[:count]
    y = y[:count]
    mx = sum(x) / count
    my = sum(y) / count
    num = 0.0
    dx = 0.0
    dy = 0.0
    for a, b in zip(x, y):
        da = a - mx
        db = b - my
        num += da * db
        dx += da * da
        dy += db * db
    if dx <= 0 or dy <= 0:
        return 0.0
    return num / math.sqrt(dx * dy)


def rms(samples):
    if not samples:
        return 0.0
    return math.sqrt(sum(v * v for v in samples) / len(samples))


def short(path):
    return os.path.basename(path)


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    media_dir = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_MEDIA

    if not os.path.isdir(out_dir):
        print('[FAIL] 导出目录不存在：%s' % out_dir)
        raise SystemExit(1)

    vocals_out = None
    accomp_out = None
    for name in os.listdir(out_dir):
        if not name.lower().endswith('.wav'):
            continue
        if '人声' in name:
            vocals_out = os.path.join(out_dir, name)
        elif '伴奏' in name:
            accomp_out = os.path.join(out_dir, name)
    if not vocals_out or not accomp_out:
        print('[FAIL] 导出目录里找不到「人声 / 伴奏」两条 WAV：%s' % out_dir)
        print('       实际内容：%s' % os.listdir(out_dir))
        raise SystemExit(1)

    print('产物：')
    print('  人声 %s' % short(vocals_out))
    print('  伴奏 %s' % short(accomp_out))

    # 参考轨：与造素材时同一套参数，只是各自单独输出，用来当「标准答案」。
    # 音量与混音时不同没关系 —— 皮尔逊相关系数对线性缩放免疫。
    voice_src = os.path.join(media_dir, 'voice_all.mp3')
    ref_voice = os.path.join(media_dir, 'ref-voice.wav')
    ref_bgm = os.path.join(media_dir, 'ref-bgm.wav')

    if not (os.path.exists(ref_voice) and os.path.exists(ref_bgm)):
        ffmpeg = find_ffmpeg()
        if not ffmpeg:
            print('[FAIL] 需要生成参考轨但找不到 ffmpeg')
            raise SystemExit(1)
        bgm_original = r'F:\workbuddy\2026-09-08-20-57-05\bgm_full.wav'
        if not os.path.exists(voice_src) or not os.path.exists(bgm_original):
            print('[FAIL] 素材缺失，无法生成参考轨')
            raise SystemExit(1)
        for src, dst, loop in ((voice_src, ref_voice, True), (bgm_original, ref_bgm, True)):
            args = [ffmpeg, '-y']
            if loop:
                args += ['-stream_loop', '-1']
            args += ['-i', src, '-t', '90', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', dst]
            result = subprocess.run(args, capture_output=True, encoding='utf-8', errors='replace')
            if result.returncode != 0:
                print('[FAIL] 生成参考轨失败：%s' % dst)
                print((result.stderr or '')[-800:])
                raise SystemExit(1)

    print('\n读取采样（前 %d 秒，每 %d 个取一个点）…' % (SECONDS, STRIDE))
    v_out, rate_v, dur_v = read_mono(vocals_out)
    a_out, rate_a, dur_a = read_mono(accomp_out)
    v_ref, rate_rv, _ = read_mono(ref_voice)
    b_ref, rate_rb, _ = read_mono(ref_bgm)

    print('  产物 人声 %d 点 / %.1f 秒（%d Hz）' % (len(v_out), dur_v, rate_v))
    print('  产物 伴奏 %d 点 / %.1f 秒（%d Hz）' % (len(a_out), dur_a, rate_a))

    rv_v = corr(v_out, v_ref)
    rv_b = corr(v_out, b_ref)
    ra_b = corr(a_out, b_ref)
    ra_v = corr(a_out, v_ref)

    print('\n相关系数：')
    print('  人声 ↔ 源人声   %.4f' % rv_v)
    print('  人声 ↔ 源伴奏   %.4f   （越低越好）' % rv_b)
    print('  伴奏 ↔ 源伴奏   %.4f' % ra_b)
    print('  伴奏 ↔ 源人声   %.4f   （越低越好）' % ra_v)

    print('\n能量（RMS，非零才算真出了声音）：')
    print('  人声 %.1f   伴奏 %.1f' % (rms(v_out), rms(a_out)))

    problems = []
    if dur_v < 80 or dur_a < 80:
        problems.append('时长明显偏短：人声 %.1fs / 伴奏 %.1fs' % (dur_v, dur_a))
    if abs(dur_v - dur_a) > 0.5:
        problems.append('两条产物时长不一致：%.2fs vs %.2fs' % (dur_v, dur_a))
    if rms(v_out) <= 0 or rms(a_out) <= 0:
        problems.append('有产物是静音的')
    if rv_v < 0.80:
        problems.append('人声轨与源人声相关过低（%.4f）' % rv_v)
    if ra_b < 0.80:
        problems.append('伴奏轨与源伴奏相关过低（%.4f）' % ra_b)
    if rv_v - rv_b < 0.40:
        problems.append('人声轨与两个源轨拉不开差距（真 %.4f vs 错 %.4f）' % (rv_v, rv_b))
    if ra_b - ra_v < 0.40:
        problems.append('伴奏轨与两个源轨拉不开差距（真 %.4f vs 错 %.4f）' % (ra_b, ra_v))

    print('')
    if problems:
        print('VERDICT: FAIL')
        for item in problems:
            print('  - %s' % item)
        raise SystemExit(1)

    print('VERDICT: PASS —— 人声/伴奏各自对上了源轨，且与另一轨明显区分')


if __name__ == '__main__':
    main()

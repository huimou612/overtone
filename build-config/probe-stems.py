"""End-to-end probe for the htdemucs path: real voice + real music in, two WAVs out, measured.

WHY THERE IS A PROBE AND NOT ONLY A UNIT TEST: the thing that can go wrong here is not a branch,
it is arithmetic on 10 million samples. A chunk boundary at the wrong stride, a window summed
instead of averaged, a channel swap, a gain that only applied to one of the two files - all of
them produce a file that opens, plays, and is wrong. None of them are visible to an assertion on
a return value. So this mixes a KNOWN voice over a KNOWN backing track and then measures which
output each source landed in, with the mismatched pair as its own control.

It is deliberately not part of `npm test`: it needs the 109MB weights, the 36MB runtime, and about
a minute of CPU. `npm test` stays fast and this stays honest.

    python build-config/probe-stems.py [--seconds 60] [--keep]

Everything it writes goes to a temp directory and is deleted unless --keep.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

# Real material, borrowed from another project on this machine: a TTS voice and a backing track.
# Using real speech and real music rather than synthesized tones matters - htdemucs is trained on
# music, and a synthetic mixture tells you about the pipeline while saying nothing about the model.
VOICE_DIR = r'F:\workbuddy\2026-09-08-20-57-05\voice_999'
BGM = r'F:\workbuddy\2026-09-08-20-57-05\bgm_full.wav'
FFMPEG = os.path.join(
    os.environ.get('LOCALAPPDATA', ''),
    r'Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe'
    r'\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe',
)

SAMPLE_RATE = 44100


def runtime_python():
    """The interpreter the app downloaded. It is the one with numpy, and the one under test.

    Two candidate profiles, because the app's userData differs by how it was started: a packaged
    build resolves productName (`%APPDATA%/overtone`), while `npm run dev` launches Electron without
    a product name and lands in `%APPDATA%/Electron`. Checking both beats documenting "move the
    folder first" - that difference is invisible until it wastes an afternoon.
    """
    home = os.environ['APPDATA']
    for profile in ('Electron', 'overtone'):
        base = os.path.join(home, profile, 'stems')
        exe = os.path.join(base, 'runtime', 'python.exe' if os.name == 'nt' else os.path.join('bin', 'python3'))
        model = os.path.join(base, 'htdemucs.onnx')
        if os.path.exists(exe) and os.path.exists(model):
            return exe, model
    # Nothing found: return the packaged layout so the error message names a real path.
    base = os.path.join(home, 'overtone', 'stems')
    return (os.path.join(base, 'runtime', 'python.exe'),
            os.path.join(base, 'htdemucs.onnx'))


def require(path, what):
    if not os.path.exists(path):
        raise SystemExit(f'missing {what}: {path}')
    return path


def run(argv):
    result = subprocess.run(argv, capture_output=True)
    if result.returncode != 0:
        sys.stderr.write(result.stdout.decode('utf-8', 'replace'))
        sys.stderr.write(result.stderr.decode('utf-8', 'replace'))
        raise SystemExit(f'failed: {argv[0]} exited {result.returncode}')
    return result


def decode(src, dst, seconds, channels):
    """Anything -> 44100 stereo s16 wav. Chromium decodes the same way the app will see it."""
    run([
        require(FFMPEG, 'ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
        '-i', src, '-t', str(seconds), '-ac', str(channels), '-ar', str(SAMPLE_RATE),
        '-c:a', 'pcm_s16le', dst,
    ])
    return dst


def read_wav(path):
    with wave.open(path, 'rb') as handle:
        channels = handle.getnchannels()
        frames = handle.readframes(handle.getnframes())
    data = np.frombuffer(frames, dtype='<i2').astype(np.float32) / 32768.0
    return data.reshape(-1, channels)


def write_raw_floats(path, left, right):
    """htdemucs' input layout: one flat float32 file, the whole left channel then the whole right."""
    flat = np.concatenate([left, right]).astype('<f4')
    with open(path, 'wb') as handle:
        handle.write(flat.tobytes())


def correlation(a, b):
    """Scale-invariant, so it does not matter that the model picks its own levels."""
    a = a - a.mean()
    b = b - b.mean()
    denominator = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / denominator) if denominator else 0.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=float, default=60.0)
    parser.add_argument('--keep', action='store_true')
    parser.add_argument('--out', default=None)
    args = parser.parse_args()

    python_exe, model = runtime_python()
    require(python_exe, 'the downloaded runtime (open the app and download it first)')
    require(model, 'the htdemucs weights')
    require(BGM, 'the backing track')
    require(FFMPEG, 'ffmpeg')

    work = args.out or tempfile.mkdtemp(prefix='overtone-stems-probe-')
    os.makedirs(work, exist_ok=True)
    print(f'work dir: {work}')

    # A voice long enough to cover the clip: the TTS clips are ~5s each, so they are joined.
    voices = sorted(
        os.path.join(VOICE_DIR, name) for name in os.listdir(VOICE_DIR) if name.endswith('.mp3')
    )
    print(f'voice clips available: {len(voices)}')

    listfile = os.path.join(work, 'voices.txt')
    # The clips total about 30s, so a longer clip means the list repeats. Repeating the list is
    # how the concat demuxer loops; `-stream_loop` is an input option of the file protocol and
    # does nothing here.
    per_round = 5.0 * max(1, len(voices))
    rounds = int(args.seconds / per_round) + 2
    with open(listfile, 'w', encoding='utf-8') as handle:
        for _ in range(rounds):
            for path in voices:
                handle.write(f"file '{path.replace(chr(92), '/')}'\n")

    voice_wav = os.path.join(work, 'voice.wav')
    run([
        require(FFMPEG, 'ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'concat', '-safe', '0', '-i', listfile,
        '-t', str(args.seconds), '-ac', '1', '-ar', str(SAMPLE_RATE), '-c:a', 'pcm_s16le', voice_wav,
    ])

    bgm_wav = decode(BGM, os.path.join(work, 'bgm.wav'), args.seconds, 1)

    voice = read_wav(voice_wav).mean(axis=1)
    bgm = read_wav(bgm_wav).mean(axis=1)
    length = min(len(voice), len(bgm), int(args.seconds * SAMPLE_RATE))
    voice, bgm = voice[:length], bgm[:length]
    total = length

    # The voice at roughly the level a lead vocal sits at over a master. Both sources are peak
    # normalised first, so the ratio between them is chosen here and not inherited from whatever
    # loudness the two files happened to be.
    voice = voice / max(1e-9, np.abs(voice).max()) * 0.85
    bgm = bgm / max(1e-9, np.abs(bgm).max()) * 0.55
    mix = voice + bgm

    # The reference pair, as the model will be judged against them: the SAME mix, split into the
    # two parts it was built from. Written as wav so a human can listen to the ground truth too.
    for name, mono in (('ref_voice.wav', voice), ('ref_bgm.wav', bgm), ('ref_mix.wav', mix)):
        stereo = np.stack([mono, mono], axis=1)
        with wave.open(os.path.join(work, name), 'wb') as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(SAMPLE_RATE)
            handle.writeframes((np.clip(stereo, -1, 1) * 32767).astype('<i2').tobytes())

    mix_in = os.path.join(work, 'mix.in')
    write_raw_floats(mix_in, mix, mix)
    print(f'mix: {total} samples/ch ({total / SAMPLE_RATE:.1f}s), {os.path.getsize(mix_in) / 1048576:.1f}MB')

    vocals_wav = os.path.join(work, 'vocals.wav')
    accomp_wav = os.path.join(work, 'accompaniment.wav')
    print('running the sidecar runner...')
    import time
    started = time.time()
    result = run([
        python_exe,
        os.path.join(APP, 'src', 'main', 'modules', 'analysis', 'stems_runner.py'),
        mix_in, vocals_wav, accomp_wav, str(total), model,
    ])
    elapsed = time.time() - started
    print(f'inference wall clock: {elapsed:.1f}s ({total / SAMPLE_RATE / elapsed:.2f}x realtime)')

    # The runner's own summary: peak working set is the number that decides whether a long song
    # fits in memory at all, and it is measured by the OS rather than guessed at from here.
    runner_stats = {}
    for line in result.stdout.decode('utf-8', 'replace').splitlines():
        line = line.strip()
        if not line.startswith('{'):
            continue
        try:
            parsed = json.loads(line)
        except ValueError:
            continue
        if parsed.get('done'):
            runner_stats = parsed
    print('runner stats:', json.dumps(runner_stats, ensure_ascii=False))

    # ---------------------------------------------------------------------------------------
    # What landed where. The mismatched pair is the control: if the separation did nothing at all,
    # all four numbers would sit at the same value and the "correct" ones would not stand out.
    vocals = read_wav(vocals_wav).mean(axis=1)
    accomp = read_wav(accomp_wav).mean(axis=1)
    if len(vocals) != total or len(accomp) != total:
        raise SystemExit(f'length mismatch: {len(vocals)}/{len(accomp)} vs {total}')

    report = {
        'seconds': round(total / SAMPLE_RATE, 1),
        'wall_clock_s': round(elapsed, 1),
        'realtime_factor': round(total / SAMPLE_RATE / elapsed, 3),
        'peak_ws_mb': runner_stats.get('peak_ws_mb'),
        'infer_s': runner_stats.get('infer_s'),
        'load_s': runner_stats.get('load_s'),
        'segments': runner_stats.get('segments'),
        'gain': runner_stats.get('gain'),
        'vocals_vs_voice': round(correlation(vocals, voice), 4),
        'vocals_vs_bgm': round(correlation(vocals, bgm), 4),
        'accomp_vs_bgm': round(correlation(accomp, bgm), 4),
        'accomp_vs_voice': round(correlation(accomp, voice), 4),
        'vocals_rms': round(float(np.sqrt((vocals ** 2).mean())), 5),
        'accomp_rms': round(float(np.sqrt((accomp ** 2).mean())), 5),
        'vocals_peak': round(float(np.abs(vocals).max()), 5),
        'accomp_peak': round(float(np.abs(accomp).max()), 5),
        'files': {
            'vocals': f'{os.path.getsize(vocals_wav) / 1048576:.1f}MB',
            'accompaniment': f'{os.path.getsize(accomp_wav) / 1048576:.1f}MB',
        },
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))

    ok = (
        report['vocals_vs_voice'] > report['vocals_vs_bgm']
        and report['accomp_vs_bgm'] > report['accomp_vs_voice']
        and report['vocals_peak'] > 0.01 and report['accomp_peak'] > 0.01
    )
    print('\nVERDICT:', 'PASS' if ok else 'FAIL')
    if not args.keep:
        shutil.rmtree(work, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()

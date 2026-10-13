"""泛音音源分离：htdemucs，跑在一个 Python 进程里，只因为一个开关。

为什么要 Python：onnxruntime 的 `enable_mem_reuse` 能把这张图的峰值内存从 ~2.5GB 压到
0.5GB 以下，输出逐位相同 —— 而这个开关**只有 ORT 的 Python 绑定能设**。onnxruntime-node
没有对应字段（`extra` 只对 WASM 生效），C API 也从不暴露它。所以内存收益需要一个
Python 解释器，由应用下载成「可选运行时」再指过去。

本文件与 Folia 的 electron/analysis/htdemucs_runner.py（AGPL-3.0）的关系：
  - `segment_of` / `build_window` / `make_session` / `prefer_fast_cores` / `peak_mb`
    逐字照搬，未改一字 —— 那部分是 DSP 与资源约束，任何改动都不该出自我们；
  - `separate` 保持同一套分块与重叠相加窗口，只把累加器从「四条轨各一份」换成
    「人声 + 伴奏各一份」。这在代数上是等价的（见该函数注释），但把整曲的累加缓冲
    从 4×2×N 减到 2×2×N —— 四分钟的歌省掉约 170MB，而我们的产物本来就只有两条；
  - `run_job` 与入口是**重写的**。上游把三条轨以裸 float32 交回 JS，由 JS 侧再处理；
    我们是「整曲分离并导出文件」，所以直接在这里写 WAV 落盘，避免 254MB 走一圈回传。
    契约因此变成：
        argv:  in_path vocals_wav accompaniment_wav total [model_path]
        in:    一个裸 float32 文件，[ left(total), right(total) ]
        out:   两个 16bit/44100 立体声 WAV
        stdout: 每块一行 JSON 进度，最后一行 JSON 汇总（sidecar.cjs 解析它）

分块长度、轨顺序与窗口取自参考实现（demucs_onnx 0.3.4 的 `_chunked_separate_single`）。
"""
import json
import os
import sys
import time
import wave

import numpy as np
import onnxruntime as ort

SOURCES = ["drums", "bass", "other", "vocals"]   # 模型自己的行顺序
SAMPLE_RATE = 44100                              # 模型写死的采样率，不是偏好
PCM_FULL_SCALE = 32767


def segment_of(sess):
    """Samples per inference, asked of the model rather than repeated here.

    The length is welded into the exported graph - the shapes, the position tables and the
    overlap-add normaliser are each cut for one particular window - so the model is the only
    thing that can say what it is. A constant beside it would just be a second answer, and the
    two disagreeing is a silent wrong-audio bug rather than a crash.
    """
    return sess.get_inputs()[0].shape[2]


def build_window(segment):
    """The reference's triangular overlap-add window: chunks step by 3/4 of a
    segment, each faded across the quarter it shares with its neighbour, and the
    sum divided by total weight. A chunk boundary without it is an audible seam."""
    overlap = segment // 4
    win = np.ones(segment, dtype=np.float32)
    ramp = np.arange(overlap, dtype=np.float32) / (overlap - 1)
    win[:overlap] = ramp
    win[segment - overlap:] = ramp[::-1]
    return win


def make_session(model_path):
    """One CPU session, and nothing clever around it.

    There used to be a graph cache here - optimize once into a `.opt` beside the weights, load
    THAT afterwards - plus a `--warmup` entry point and a whole IPC path for building it when a
    download landed. All of it existed for one number: ORT's graph optimizer took 4594MB and
    3.9s on the old 24917-node export, against 909MB and 0.35s for the run itself.

    This export has 1556 nodes and no such peak. Optimizing it costs 353MB and 0.65s, and the
    cache bought 783MB against 792MB without - inside the noise. So the cache is gone.
    """
    so = ort.SessionOptions()
    so.enable_cpu_mem_arena = False      # the arena alone is ~5GB peak
    so.enable_mem_reuse = False          # the flag this whole Python process exists for, see the top
    so.intra_op_num_threads = 4          # a quarter of a typical machine
    return ort.InferenceSession(model_path, sess_options=so, providers=["CPUExecutionProvider"])


def separate(sess, left, right, on_progress=None):
    """left/right: 1-D float32, equal length.

    返回 `(vocals, accompaniment)`，各是 `(L, R)` 两个 1-D float32。

    与上游唯一的差别是累加器：上游把四个源分别累加进 `(4, 2, total)` 再按权重归一，
    我们累加人声与「其余三源之和」两桶。除法是线性的，所以在同一权重下
    `sum(stems)/w == sum(stems/w)`，结果与上游逐位一致 —— 但整曲的缓冲小一半，
    而我们的产物本来就只有这两条。（上游留四桶是因为它只分离 30 秒窗口，我们分离整曲。）
    """
    total = left.shape[0]
    segment = segment_of(sess)
    win = build_window(segment)
    overlap = segment // 4
    stride = segment - overlap
    chunks = max(1, -(-total // stride))          # ceil
    index = {name: SOURCES.index(name) for name in SOURCES}

    vocals = np.zeros((2, total), dtype=np.float32)
    accomp = np.zeros((2, total), dtype=np.float32)
    weight = np.zeros(total, dtype=np.float32)
    inp = np.zeros((1, 2, segment), dtype=np.float32)
    mix = sess.get_inputs()[0].name

    for c in range(chunks):
        start = c * stride
        end = min(start + segment, total)
        if end <= start:
            break
        n = end - start
        inp[:] = 0.0
        inp[0, 0, :n] = left[start:end]
        inp[0, 1, :n] = right[start:end]
        stems = sess.run(None, {mix: inp})[0]     # [1, 4, 2, segment]
        chunk = stems[0, :, :, :n] * win[:n]
        vocals[:, start:end] += chunk[index["vocals"]]
        accomp[:, start:end] += (chunk[index["drums"]]
                                 + chunk[index["bass"]]
                                 + chunk[index["other"]])
        weight[start:end] += win[:n]
        if on_progress:
            on_progress(c + 1, chunks)

    np.divide(vocals, np.maximum(weight, 1e-8), out=vocals)
    np.divide(accomp, np.maximum(weight, 1e-8), out=accomp)
    return vocals, accomp


def prefer_fast_cores():
    """Ask Windows to schedule this process on the machine's fast cores. Returns how many.

    Nothing to do with speed in the foreground: measured there, pinning changes NOTHING - 12.7s
    either way - because Thread Director already reads a saturating float workload as P-core work
    without being asked. This is about the background. Windows puts a minimised app's process tree
    into EcoQoS, and the same 30s window that takes 12.7s takes 28.1s under it. That is 2.2x, and
    for a music player "minimised" is the normal state, not the corner case.

    Three different calls cancel that penalty to within noise (12.6s, 12.4s, 12.8s): a hard
    affinity mask, clearing the throttle flag, and this one. This one is the soft version - a
    PREFERENCE, so a machine whose fast cores are busy with the listener's actual work can still
    overflow onto the rest instead of queueing behind it.

    Every failure is silent - a scheduling hint that cannot be applied is not a reason to fail.
    """
    if sys.platform != "win32":
        return 0

    import ctypes
    from ctypes import wintypes

    class CPU_SET_INFO(ctypes.Structure):
        _fields_ = [("Size", wintypes.DWORD), ("Type", wintypes.DWORD), ("Id", wintypes.DWORD),
                    ("Group", wintypes.WORD), ("LogicalProcessorIndex", ctypes.c_ubyte),
                    ("CoreIndex", ctypes.c_ubyte), ("LastLevelCacheIndex", ctypes.c_ubyte),
                    ("NumaNodeIndex", ctypes.c_ubyte), ("EfficiencyClass", ctypes.c_ubyte),
                    ("AllFlags", ctypes.c_ubyte), ("Reserved", ctypes.c_ubyte * 2),
                    ("AllocationTag", ctypes.c_ulonglong)]

    try:
        k32 = ctypes.windll.kernel32
        # Same pseudo-handle trap as peak_mb: without an explicit restype ctypes truncates it to
        # int32 and every call below silently does nothing.
        k32.GetCurrentProcess.restype = ctypes.c_void_p
        handle = ctypes.c_void_p(k32.GetCurrentProcess())

        size = wintypes.ULONG(0)
        # The first call is the size query and reports failure by design, so it is not checked.
        k32.GetSystemCpuSetInformation(None, 0, ctypes.byref(size), handle, 0)
        buf = ctypes.create_string_buffer(size.value)
        if not k32.GetSystemCpuSetInformation(buf, size.value, ctypes.byref(size), handle, 0):
            return 0

        sets, offset = [], 0
        while offset < size.value:
            entry = CPU_SET_INFO.from_buffer(buf, offset)
            sets.append((entry.Id, entry.EfficiencyClass))
            offset += entry.Size

        best = max(klass for _, klass in sets)
        fast = [cpu_id for cpu_id, klass in sets if klass == best]
        if len(fast) == len(sets):
            return 0                      # every core is the same core

        ids = (wintypes.ULONG * len(fast))(*fast)
        return len(fast) if k32.SetProcessDefaultCpuSets(handle, ids, len(fast)) else 0
    except Exception:
        return 0


def peak_mb():
    """(peak working set, peak commit) in MB, as the OS itself tracked them.

    Windows keeps both high-water marks per process, so this is exact and catches a spike
    between two samples of any external monitor - which is how a 4GB transient stayed
    invisible while an 8ms sampler inside the process reported 973MB.
    """
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                        ("PrivateUsage", ctypes.c_size_t)]

        # The handle is a pseudo-handle (-1); without an explicit restype ctypes truncates it to
        # int32 and the call silently returns 0 for every field.
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = ctypes.c_void_p
        fn = ctypes.windll.psapi.GetProcessMemoryInfo
        fn.argtypes = [ctypes.c_void_p, ctypes.POINTER(PMC), wintypes.DWORD]
        fn.restype = wintypes.BOOL
        pmc = PMC()
        pmc.cb = ctypes.sizeof(pmc)
        if fn(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb):
            return pmc.PeakWorkingSetSize / 1048576.0, pmc.PeakPagefileUsage / 1048576.0
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 0.0
    except Exception:
        return 0.0, 0.0


def peak_of(*arrays):
    """两声道里的最大绝对值。整轨统一增益，避免两条产物各自被归一化后失去相对音量。"""
    peak = 0.0
    for arr in arrays:
        if arr.size:
            local = float(np.abs(arr).max())
            if local > peak:
                peak = local
    return peak


def write_wav(path, channels, gain):
    """写 16bit 立体声 WAV。先写 `.part` 再改名，与 JS 侧同一个理由：
    中途崩掉不能留下一个「看起来是成品」的半截文件。"""
    left, right = channels
    frames = np.empty((left.shape[0], 2), dtype=np.int16)
    scaled = np.clip(left * gain, -1.0, 1.0) * PCM_FULL_SCALE
    frames[:, 0] = np.round(scaled).astype(np.int16)
    scaled = np.clip(right * gain, -1.0, 1.0) * PCM_FULL_SCALE
    frames[:, 1] = np.round(scaled).astype(np.int16)

    part = path + ".part"
    with wave.open(part, "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(frames.tobytes())
    os.replace(part, path)


def emit(payload):
    """stdout 是 sidecar 的进度通道，所以每行都必须是可解析的 JSON。"""
    print(json.dumps(payload), flush=True)


def run_job(model_path, in_path, vocals_path, accompaniment_path, total):
    raw = np.fromfile(in_path, dtype=np.float32)
    if raw.size < 2 * total:
        raise SystemExit(f"input too short: {raw.size} floats for {total} samples per channel")
    left, right = raw[:total], raw[total:2 * total]

    fast_cores = prefer_fast_cores()

    t0 = time.time()
    sess = make_session(model_path)
    load_sec = time.time() - t0
    load_peak, _ = peak_mb()

    t1 = time.time()
    vocals, accomp = separate(
        sess, left, right,
        on_progress=lambda done, chunks: emit({"progress": done / chunks, "chunk": done, "chunks": chunks}),
    )
    infer_sec = time.time() - t1

    # One gain for BOTH files, so the exported pair stays mixable: normalising each stem on its
    # own would silently change how loud the voice sits against the backing track. It only ever
    # attenuates (gain <= 1) - amplifying a quiet master is not this feature's job.
    peak = peak_of(vocals, accomp)
    gain = 1.0 / peak if peak > 1.0 else 1.0
    write_wav(vocals_path, vocals, gain)
    write_wav(accompaniment_path, accomp, gain)

    ws, commit = peak_mb()
    seg = segment_of(sess)
    stride = seg - seg // 4
    emit({
        "done": True,
        "peak_ws_mb": round(ws, 1), "peak_commit_mb": round(commit, 1),
        "peak_after_load_mb": round(load_peak, 1),
        "total": total, "sec": round(total / float(SAMPLE_RATE), 1),
        "segment": seg, "segments": max(1, -(-total // stride)),
        "load_s": round(load_sec, 2), "infer_s": round(infer_sec, 2),
        "gain": round(gain, 6), "peak_sample": round(peak, 6),
        "threads": 4, "cpus": os.cpu_count(), "fast_cores": fast_cores,
    })


def selftest(model_path):
    """一段噪声跑完整窗口，采样整个多块过程的 RSS 峰值 —— 用于从应用内复测内存。"""
    import threading

    def rss_mb():
        import psutil
        return psutil.Process().memory_info().rss / 1048576.0

    total = int(float(os.environ.get("HTDEMUCS_SEC", "40")) * SAMPLE_RATE)
    rng = np.random.default_rng(7)
    left = (rng.standard_normal(total) * 0.1).astype(np.float32)
    right = (rng.standard_normal(total) * 0.1).astype(np.float32)
    sess = make_session(model_path)

    stop = threading.Event()
    peak = [rss_mb()]

    def sampler():
        while not stop.is_set():
            r = rss_mb()
            if r > peak[0]:
                peak[0] = r
            time.sleep(0.008)

    t = threading.Thread(target=sampler)
    t.start()
    t0 = time.time()
    vocals, accomp = separate(sess, left, right)
    dt = time.time() - t0
    stop.set()
    t.join()

    seg = segment_of(sess)
    stride = seg - seg // 4
    emit({
        "total_samples": total,
        "chunks": max(1, -(-total // stride)),
        "rss_PEAK_during_full_window_mb": round(peak[0], 1),
        "window_sec": round(dt, 3),
        "vocals_absmax": float(abs(vocals[0]).max()),
        "accomp_absmax": float(abs(accomp[0]).max()),
    })


if __name__ == "__main__":
    model = os.environ.get("HTDEMUCS_MODEL", "")
    if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
        selftest(model)
    else:
        in_path, vocals_path, accompaniment_path, total = (
            sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]))
        if len(sys.argv) >= 6:
            model = sys.argv[5]
        if not model:
            raise SystemExit("no model path: pass argv[5] or set HTDEMUCS_MODEL")
        run_job(model, in_path, vocals_path, accompaniment_path, total)

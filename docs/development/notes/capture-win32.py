"""
用 Win32 PrintWindow 抓取本机某个窗口的画面（不依赖调试端口）。

用法：
    python notes/capture-win32.py <输出png> [窗口标题关键字] [等待秒数]

要点：
  - 必须先把进程设为 Per-Monitor DPI Aware，否则 GetWindowRect 拿到的是逻辑像素，
    在缩放显示器上会截出被裁剪的画面；
  - Chromium / Electron 的窗口要用 PW_RENDERFULLCONTENT (0x2)，
    普通 PrintWindow 会得到全黑（GPU 合成的内容不在 GDI 表面里）；
  - 抓的是窗口的客户区+边框，窗口被其他窗口遮挡也不影响。
"""

import ctypes
import ctypes.wintypes as wt
import os
import sys
import time

from PIL import Image

user32 = ctypes.WinDLL('user32', use_last_error=True)
gdi32 = ctypes.WinDLL('gdi32', use_last_error=True)

PW_RENDERFULLCONTENT = 0x00000002
DIB_RGB_COLORS = 0
WNDENUMPROC = ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ('biSize', wt.DWORD),
        ('biWidth', ctypes.c_long),
        ('biHeight', ctypes.c_long),
        ('biPlanes', wt.WORD),
        ('biBitCount', wt.WORD),
        ('biCompression', wt.DWORD),
        ('biSizeImage', wt.DWORD),
        ('biXPelsPerMeter', ctypes.c_long),
        ('biYPelsPerMeter', ctypes.c_long),
        ('biClrUsed', wt.DWORD),
        ('biClrImportant', wt.DWORD),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [('bmiHeader', BITMAPINFOHEADER), ('bmiColors', wt.DWORD * 3)]


def set_dpi_aware():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)      # PROCESS_PER_MONITOR_DPI_AWARE
    except Exception:                                        # noqa: BLE001
        try:
            user32.SetProcessDPIAware()
        except Exception:                                    # noqa: BLE001
            pass


def list_windows():
    """枚举全部顶层窗口（含隐藏的），隐藏的也要，否则窗口最小化到托盘就找不到了"""
    found = []

    def cb(hwnd, _lparam):
        try:
            n = user32.GetWindowTextLengthW(hwnd)
            buf = ctypes.create_unicode_buffer(n + 1)
            if n:
                user32.GetWindowTextW(hwnd, buf, n + 1)
            cls = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls, 256)
            rect = wt.RECT()
            user32.GetWindowRect(hwnd, ctypes.byref(rect))
            pid = wt.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            found.append({
                'hwnd': hwnd,
                'title': buf.value,
                'class': cls.value,
                'rect': (rect.left, rect.top, rect.right, rect.bottom),
                'pid': pid.value,
                'w': rect.right - rect.left,
                'h': rect.bottom - rect.top,
                'visible': bool(user32.IsWindowVisible(hwnd)),
                'iconic': bool(user32.IsIconic(hwnd)),
            })
        except Exception:                                    # noqa: BLE001
            pass
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return found


def capture(hwnd, w, h):
    hdc_win = user32.GetWindowDC(hwnd)
    if not hdc_win:
        raise OSError('GetWindowDC 失败')
    hdc_mem = gdi32.CreateCompatibleDC(hdc_win)
    hbmp = gdi32.CreateCompatibleBitmap(hdc_win, w, h)
    old = gdi32.SelectObject(hdc_mem, hbmp)

    ok = user32.PrintWindow(hwnd, hdc_mem, PW_RENDERFULLCONTENT)
    if not ok:
        # 退回无标志模式再试一次
        ok = user32.PrintWindow(hwnd, hdc_mem, 0)

    bmi = BITMAPINFO()
    bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.bmiHeader.biWidth = w
    bmi.bmiHeader.biHeight = -h          # 负数 = 自上而下
    bmi.bmiHeader.biPlanes = 1
    bmi.bmiHeader.biBitCount = 32
    bmi.bmiHeader.biCompression = 0      # BI_RGB

    buf = ctypes.create_string_buffer(w * h * 4)
    got = gdi32.GetDIBits(hdc_mem, hbmp, 0, h, buf, ctypes.byref(bmi), DIB_RGB_COLORS)

    gdi32.SelectObject(hdc_mem, old)
    gdi32.DeleteObject(hbmp)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(hwnd, hdc_win)

    if got == 0:
        raise OSError('GetDIBits 失败')

    # GetDIBits 出来的是 BGRX（第 4 字节是未使用的填充，且恒为 0），
    # 所以只能用 RGB 模式配 BGRX 解，直接用 RGBA 会被 PIL 判定为非法 raw 模式。
    img = Image.frombuffer('RGB', (w, h), buf, 'raw', 'BGRX', 0, 1)
    return img, ok


def electron_pids():
    """本机所有 electron.exe 的 PID（本项目与用户其它 Electron 应用都可能命中，
    所以还要靠标题/尺寸进一步筛选）"""
    import csv as _csv
    import io as _io
    import subprocess as _sp
    r = _sp.run(['tasklist', '/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV'],
                capture_output=True, encoding='gbk', errors='replace')
    return {row[1] for row in list(_csv.reader(_io.StringIO(r.stdout)))[1:] if row}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'window.png'
    keyword = sys.argv[2] if len(sys.argv) > 2 else '泛音'
    wait_s = float(sys.argv[3]) if len(sys.argv) > 3 else 180.0

    set_dpi_aware()

    deadline = time.time() + wait_s
    target = None
    while time.time() < deadline:
        pids = electron_pids()
        cands = [x for x in list_windows()
                 if str(x['pid']) in pids
                 and x['class'].startswith('Chrome_WidgetWin')
                 and x['w'] > 600 and x['h'] > 400]
        if cands:
            # 标题能匹配到关键字的最优先（主窗口标题是「泛音」），否则取最大的
            named = [x for x in cands if keyword in x['title']]
            pool = named or cands
            pool.sort(key=lambda x: -(x['w'] * x['h']))
            target = pool[0]
            break
        time.sleep(1.5)

    if target is None:
        print('候选窗口：')
        pids = electron_pids()
        for x in list_windows():
            if str(x['pid']) in pids:
                print('   pid=%-7s %-20s %-4dx%-4d 可见=%-5s %r' % (
                    x['pid'], x['class'][:20], x['w'], x['h'], x['visible'], x['title']))
        raise SystemExit('未找到本项目窗口（关键字 %r）' % keyword)

    print('目标窗口：pid=%s class=%s %dx%d title=%r 可见=%s' % (
        target['pid'], target['class'], target['w'], target['h'], target['title'], target['visible']))

    # 窗口若被隐藏（例如最小化到托盘），先恢复出来再抓
    if not target['visible']:
        SW_RESTORE = 9
        user32.ShowWindow(target['hwnd'], SW_RESTORE)
        user32.SetForegroundWindow(target['hwnd'])
        time.sleep(1.5)
        print('  窗口原本不可见，已调用 ShowWindow(SW_RESTORE) 恢复')

    # 等画面稳一稳（渲染首帧 / 字体加载）
    time.sleep(3.0)
    img, ok = capture(target['hwnd'], target['w'], target['h'])

    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print('PrintWindow ok=%s，已保存：%s (%d B)' % (ok, out, os.path.getsize(out)))


if __name__ == '__main__':
    main()

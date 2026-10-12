# 稳健版窗口抓图（针对 Chromium/Electron 的 PrintWindow 全黑问题）
#
# PrintWindow 常见坑：窗口被遮挡或未参与合成时，Chromium 不产出新帧，
# 调用仍返回 TRUE 但位图是全黑。capture-win32.py 的首版在「窗口刚创建、正在渲染」时能抓到，
# 但窗口静置一段时间后就会抓到全黑。
#
# 本脚本的加固手段：
#   1. 最小化 -> 还原（强制 Chromium 全量重绘一帧）
#   2. BringWindowToTop + SetForegroundWindow（解除遮挡，恢复合成）
#   3. PrintWindow(PW_RENDERFULLCONTENT)
#   4. 检测位图是否近乎单色，若是则回退用屏幕 DC BitBlt 抓取
#
# 用法：python notes/recapture.py <输出路径> [标题关键字]

import ctypes
import os
import sys
import time
from ctypes import wintypes

from PIL import Image

user32 = ctypes.WinDLL('user32', use_last_error=True)
gdi32 = ctypes.WinDLL('gdi32', use_last_error=True)

PW_RENDERFULLCONTENT = 0x00000002
SRCCOPY = 0x00CC0020
DIB_RGB_COLORS = 0
SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN = 76, 77
SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN = 78, 79


def set_dpi_aware():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            user32.SetProcessDPIAware()
        except Exception:
            pass


def list_windows():
    out = []
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

    def cb(hwnd, _):
        if not user32.IsWindow(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        r = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(r))
        out.append({
            'hwnd': hwnd,
            'title': buf.value,
            'class': cls.value,
            'w': r.right - r.left,
            'h': r.bottom - r.top,
            'visible': bool(user32.IsWindowVisible(hwnd)),
            'iconic': bool(user32.IsIconic(hwnd)),
            'pid': wintypes.DWORD(),
        })
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(out[-1]['pid']))
        out[-1]['pid'] = out[-1]['pid'].value
        return True

    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return out


def grab(hwnd, x, y, w, h, use_screen_dc):
    hdc_src = user32.GetDC(None) if use_screen_dc else user32.GetWindowDC(hwnd)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_src)
    bmp = gdi32.CreateCompatibleBitmap(hdc_src, w, h)
    gdi32.SelectObject(hdc_mem, bmp)

    if use_screen_dc:
        gdi32.BitBlt(hdc_mem, 0, 0, w, h, hdc_src, x, y, SRCCOPY)
    else:
        ok = user32.PrintWindow(hwnd, hdc_mem, PW_RENDERFULLCONTENT)
        if not ok:
            user32.PrintWindow(hwnd, hdc_mem, 0)

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ('biSize', wintypes.DWORD), ('biWidth', wintypes.LONG),
            ('biHeight', wintypes.LONG), ('biPlanes', wintypes.WORD),
            ('biBitCount', wintypes.WORD), ('biCompression', wintypes.DWORD),
            ('biSizeImage', wintypes.DWORD), ('biXPelsPerMeter', wintypes.LONG),
            ('biYPelsPerMeter', wintypes.LONG), ('biClrUsed', wintypes.DWORD),
            ('biClrImportant', wintypes.DWORD),
        ]

    bi = BITMAPINFOHEADER()
    bi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bi.biWidth = w
    bi.biHeight = -h          # 负高度 = 自上而下
    bi.biPlanes = 1
    bi.biBitCount = 32
    bi.biCompression = 0

    buf = ctypes.create_string_buffer(w * h * 4)
    gdi32.GetDIBits(hdc_mem, bmp, 0, h, buf, ctypes.byref(bi), DIB_RGB_COLORS)

    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(hdc_mem)
    if use_screen_dc:
        user32.ReleaseDC(None, hdc_src)
    else:
        user32.ReleaseDC(hwnd, hdc_src)

    # GetDIBits 出来是 BGRX，第 4 字节是未使用填充且恒为 0，
    # 只能用 RGB 模式配 BGRX 解，用 RGBA 会被 PIL 判为非法 raw 模式。
    return Image.frombuffer('RGB', (w, h), buf, 'raw', 'BGRX', 0, 1)


def is_blank(img):
    """近乎单色即判定为抓取失败（PrintWindow 全黑/全白的典型特征）"""
    lo, hi = img.convert('L').getextrema()
    return (hi - lo) < 6


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'window.png'
    keyword = sys.argv[2] if len(sys.argv) > 2 else '泛音'

    set_dpi_aware()

    cands = [x for x in list_windows() if x['class'].startswith('Chrome_WidgetWin')
             and x['w'] > 600 and x['h'] > 400]
    named = [x for x in cands if keyword in x['title']]
    pool = sorted(named or cands, key=lambda x: -(x['w'] * x['h']))
    if not pool:
        raise SystemExit('未找到候选窗口')

    t = pool[0]
    hwnd = t['hwnd']
    print('目标：pid=%s %s %dx%d title=%r 可见=%s 最小化=%s'
          % (t['pid'], t['class'], t['w'], t['h'], t['title'], t['visible'], t['iconic']))

    SW_MINIMIZE, SW_RESTORE, SW_SHOW = 6, 9, 5
    if t['iconic']:
        user32.ShowWindow(hwnd, SW_RESTORE)
    # 最小化 -> 还原：强制 Chromium 丢弃旧帧并全量重绘
    user32.ShowWindow(hwnd, SW_MINIMIZE)
    time.sleep(0.6)
    user32.ShowWindow(hwnd, SW_RESTORE)
    user32.ShowWindow(hwnd, SW_SHOW)
    user32.BringWindowToTop(hwnd)
    user32.SetForegroundWindow(hwnd)
    time.sleep(3.0)   # 等重绘与字体加载

    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    w, h = r.right - r.left, r.bottom - r.top
    print('重绘后尺寸 %dx%d' % (w, h))

    img = grab(hwnd, r.left, r.top, w, h, use_screen_dc=False)
    method = 'PrintWindow'
    if is_blank(img):
        print('  PrintWindow 结果疑似空白 -> 回退屏幕 BitBlt')
        img2 = grab(hwnd, r.left, r.top, w, h, use_screen_dc=True)
        if not is_blank(img2):
            img, method = img2, '屏幕 BitBlt'
        else:
            print('  屏幕 BitBlt 也为空白（窗口可能被完全遮挡）')

    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    lo, hi = img.convert('L').getextrema()
    print('方式=%s 灰度范围=%d~%d 已保存：%s (%d B)'
          % (method, lo, hi, out, os.path.getsize(out)))


if __name__ == '__main__':
    main()

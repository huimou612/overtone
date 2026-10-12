"""
泛音 / Overtone —— 应用图标生成器

设计意象：一道粗壮的基频正弦波，上方叠一道频率更高、更细的泛音波。
「泛音」即 overtone，指基频之上的谐波分量，正是这个项目的名字。

实现要点：
  - 先在 MASTER 分辨率下把母版画一次，再 LANCZOS 降采样到各目标尺寸，
    避免「每个尺寸各画一遍」带来的锯齿与不一致；
  - 渐变只在 256 分辨率下逐像素算一次，再放大 —— 线性渐变放大是精确的。

依赖：Pillow
运行：python build-config/make_icons.py
"""

import math
import os
from PIL import Image, ImageDraw

MASTER = 2048               # 母版边长
GRAD = 256                  # 渐变计算分辨率

INDIGO = (79, 70, 229)      # #4F46E5
VIOLET = (147, 51, 234)     # #9333EA
WHITE = (255, 255, 255)


# ---------------------------------------------------------------- 基础工具

def _gradient(size, c0, c1):
    """左上 → 右下的两色线性渐变"""
    g = Image.new('RGB', (GRAD, GRAD))
    px = g.load()
    denom = 2 * (GRAD - 1)
    for y in range(GRAD):
        for x in range(GRAD):
            t = (x + y) / denom
            px[x, y] = (
                round(c0[0] + (c1[0] - c0[0]) * t),
                round(c0[1] + (c1[1] - c0[1]) * t),
                round(c0[2] + (c1[2] - c0[2]) * t),
            )
    return g.resize((size, size), Image.BILINEAR)


def _squircle(size, radius_ratio):
    """圆角矩形遮罩，MASTER 下直接绘制（母版本身足够大，无需再超采样）"""
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1],
                        radius=round(size * radius_ratio), fill=255)
    return m


def _wave_points(size, y_center, amplitude, periods, pad=0.0, samples=4000):
    """一条正弦折线的点列；pad 为左右内边距占比，使波有完整的圆头收尾"""
    x0, x1 = pad * size, (1.0 - pad) * size
    pts = []
    for i in range(samples + 1):
        t = i / samples
        x = x0 + (x1 - x0) * t
        y = (y_center - amplitude * math.sin(2 * math.pi * periods * t)) * size
        pts.append((x, y))
    return pts


def _stroke_wave(img, size, y_center, amplitude, periods, stroke, color,
                 alpha=255, pad=0.0):
    """在 RGBA 图上描一条粗正弦波，两端补圆头"""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pts = _wave_points(size, y_center, amplitude, periods, pad)
    w = max(1, round(stroke * size))
    d.line(pts, fill=color + (alpha,), width=w, joint='curve')
    r = w / 2.0
    for px, py in (pts[0], pts[-1]):
        d.ellipse([px - r, py - r, px + r, py + r], fill=color + (alpha,))
    img.alpha_composite(layer)


# ---------------------------------------------------------------- 图形本体

def render_app_master():
    """应用图标母版：靛紫渐变圆角底 + 泛音波（上）+ 基频波（下）"""
    base = Image.new('RGBA', (MASTER, MASTER), (0, 0, 0, 0))

    grad = _gradient(MASTER, INDIGO, VIOLET).convert('RGBA')
    grad.putalpha(_squircle(MASTER, 0.225))
    base.alpha_composite(grad)

    # 泛音波：高频、细、略透明
    _stroke_wave(base, MASTER, y_center=0.340, amplitude=0.062,
                 periods=4.0, stroke=0.038, color=WHITE, alpha=200, pad=0.150)
    # 基频波：低频、粗、实白
    _stroke_wave(base, MASTER, y_center=0.615, amplitude=0.132,
                 periods=2.0, stroke=0.090, color=WHITE, alpha=255, pad=0.130)
    return base


def render_mark_master(color, alpha=255):
    """托盘标记母版：透明底，只有两道波"""
    base = Image.new('RGBA', (MASTER, MASTER), (0, 0, 0, 0))
    _stroke_wave(base, MASTER, y_center=0.296, amplitude=0.072,
                 periods=4.0, stroke=0.044, color=color, alpha=round(alpha * 0.80), pad=0.105)
    _stroke_wave(base, MASTER, y_center=0.652, amplitude=0.145,
                 periods=2.0, stroke=0.102, color=color, alpha=alpha, pad=0.088)
    return base


def down(img, size):
    return img.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- 矢量版

# 与位图母版使用同一组参数，只是换算到目标坐标系
WAVE_SPEC = [
    # (y_center, amplitude, periods, stroke, pad, opacity)
    (0.340, 0.062, 4.0, 0.038, 0.150, 0.78),   # 泛音波（高频、细）
    (0.615, 0.132, 2.0, 0.090, 0.130, 1.00),   # 基频波（低频、粗）
]


def _wave_path(box_w, box_h, y_center, amplitude, periods, pad, samples=256):
    """把正弦波排成 SVG path 的 d 字符串，坐标落在 box_w × box_h 内"""
    x0, x1 = pad * box_w, (1.0 - pad) * box_w
    seg = []
    for i in range(samples + 1):
        t = i / samples
        x = x0 + (x1 - x0) * t
        y = (y_center - amplitude * math.sin(2 * math.pi * periods * t)) * box_h
        seg.append(('M' if i == 0 else 'L') + f'{x:.2f} {y:.2f}')
    return ''.join(seg)


def write_icon_svg(path, box=512):
    """独立的矢量 logo：渐变圆角底 + 两道波"""
    r = round(box * 0.225)
    layers = []
    for y_center, amp, periods, stroke, pad, opacity in WAVE_SPEC:
        layers.append(
            f'  <path d="{_wave_path(box, box, y_center, amp, periods, pad)}" '
            f'fill="none" stroke="#ffffff" stroke-opacity="{opacity}" '
            f'stroke-width="{round(stroke * box)}" stroke-linecap="round"/>'
        )
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{box}" height="{box}" '
        f'viewBox="0 0 {box} {box}">\n'
        f'  <title>泛音 Overtone</title>\n'
        f'  <defs>\n'
        f'    <linearGradient id="overtone-bg" x1="0" y1="0" x2="1" y2="1">\n'
        f'      <stop offset="0" stop-color="#4f46e5"/>\n'
        f'      <stop offset="1" stop-color="#9333ea"/>\n'
        f'    </linearGradient>\n'
        f'  </defs>\n'
        f'  <rect width="{box}" height="{box}" rx="{r}" fill="url(#overtone-bg)"/>\n'
        + '\n'.join(layers) + '\n'
        f'</svg>\n'
    )
    with open(path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(svg)
    return path


def patch_icons_vue(path, box_w=60.0, box_h=26.0):
    """把 Icons.vue 里内联的 icon-logo 字形换成同一套波形"""
    import re
    src = open(path, encoding='utf-8').read()
    paths = []
    for y_center, amp, periods, stroke, pad, opacity in WAVE_SPEC:
        paths.append(
            f'        <path d="{_wave_path(box_w, box_h, y_center, amp, periods, pad, samples=96)}" '
            f'fill="none" stroke="currentColor" stroke-opacity="{opacity}" '
            f'stroke-width="{stroke * box_w / 512 * 4:.2f}" stroke-linecap="round" />'
        )
    body = '\n'.join(paths)
    new, n = re.subn(r'(<g id="icon-logo"[^>]*>)(.*?)(</g>)',
                     lambda m: m.group(1) + '\n' + body + '\n      ' + m.group(3),
                     src, count=1, flags=re.S)
    if n:
        open(path, 'w', encoding='utf-8', newline='').write(new)
    return n


# ---------------------------------------------------------------- 落盘

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    os.chdir(os.path.dirname(here))     # 回到 app/ 根目录

    app_master = render_app_master()

    # ---- resources/icons ----
    sizes = [16, 32, 48, 64, 128, 256, 512]
    for s in sizes:
        down(app_master, s).save(f'resources/icons/{s}x{s}.png')

    down(app_master, 512).save('resources/icons/icon.png')
    down(app_master, 256).save(
        'resources/icons/icon.ico', format='ICO',
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (256, 256)])

    icns_ok = True
    try:
        # Pillow 的 ICNS 写出需要最大到 1024 的源图
        app_master.save('resources/icons/icon.icns', format='ICNS',
                        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
    except Exception as exc:                              # noqa: BLE001
        icns_ok = False
        print('  ! icns 生成失败：', exc)

    # ---- 文档用图 ----
    os.makedirs('doc/images', exist_ok=True)
    down(app_master, 256).save('doc/images/icon.png')

    # ---- 矢量版（与位图同一套参数）----
    write_icon_svg('src/renderer/assets/images/icon.svg')
    n_logo = patch_icons_vue('src/renderer/components/layout/Icons.vue')

    # ---- 托盘 ----
    tray_specs = [
        ('tray_origin', INDIGO, 255),      # 彩色托盘图标
        ('tray_black', (0, 0, 0), 255),    # 黑色单色托盘图标
        ('trayTemplate', (0, 0, 0), 255),  # macOS 模板图：必须纯黑 + alpha
    ]
    tray_sizes = [('', 16), ('@1.25x', 20), ('@1.5x', 24), ('@2x', 32)]
    for name, color, alpha in tray_specs:
        master = render_mark_master(color, alpha)
        for suffix, px in tray_sizes:
            down(master, px).save(f'src/static/images/tray/{name}{suffix}.png')
        down(master, 16).save(f'src/static/images/tray/{name}.ico',
                              format='ICO', sizes=[(16, 16)])
        down(master, 32).save(f'src/static/images/tray/{name}@2x.ico',
                              format='ICO', sizes=[(32, 32)])

    print('图标生成完成：')
    print('  resources/icons/  ' + ', '.join(f'{s}x{s}.png' for s in sizes)
          + ', icon.png, icon.ico' + (', icon.icns' if icns_ok else ''))
    print('  doc/images/icon.png')
    print('  src/renderer/assets/images/icon.svg （矢量版）')
    print('  src/renderer/components/layout/Icons.vue  icon-logo 替换 %d 处' % n_logo)
    print('  src/static/images/tray/  tray_origin | tray_black | trayTemplate × (16, 20, 24, 32) + .ico')


if __name__ == '__main__':
    main()

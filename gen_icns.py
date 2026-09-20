# -*- coding: utf-8 -*-
"""生成 macOS .icns 图标：深绿圆角方块 + 白色对勾（与各端一致）"""
from PIL import Image, ImageDraw
import struct, io, os

DARK = (6, 78, 59, 255)       # #064E3B 深绿
EMERALD = (16, 185, 129, 255) # #10B981 翡翠绿

def make_icon(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(size * 0.22)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=DARK)
    pad = int(size * 0.055)
    d.rounded_rectangle([pad, pad, size - 1 - pad, size - 1 - pad],
                        radius=int(radius * 0.85), outline=EMERALD, width=max(2, size // 64))
    lw = max(4, int(size * 0.11))
    p1 = (int(size * 0.24), int(size * 0.52))
    p2 = (int(size * 0.44), int(size * 0.72))
    p3 = (int(size * 0.78), int(size * 0.30))
    d.line([p1, p2], fill=(255, 255, 255, 255), width=lw)
    d.line([p2, p3], fill=(255, 255, 255, 255), width=lw)
    r = lw // 2
    for p in (p1, p2, p3):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))
    return img

# ICNS 条目：ostype -> 尺寸（PNG 负载，现代 macOS 全部支持 PNG 型 icns）
entries = [
    (b'icp4', 16), (b'icp5', 32), (b'icp6', 64),
    (b'ic07', 128), (b'ic08', 256), (b'ic09', 512), (b'ic10', 1024),
    (b'ic11', 32), (b'ic12', 64), (b'ic13', 256), (b'ic14', 512),
]

blocks = []
for ostype, size in entries:
    png = io.BytesIO()
    make_icon(size).save(png, format='PNG')
    data = png.getvalue()
    blocks.append(ostype + struct.pack('>I', len(data) + 8) + data)

total = sum(len(b) for b in blocks)
icns = b'icns' + struct.pack('>I', total + 8) + b''.join(blocks)

out = r'D:\Android\PmsDesktop\assets\icon.icns'
with open(out, 'wb') as f:
    f.write(icns)
print('OK ->', out, len(icns), 'bytes')

# 顺带存一份 1024 png 备用
make_icon(1024).save(r'D:\Android\PmsDesktop\assets\app-icon-1024.png')
print('1024 png OK')

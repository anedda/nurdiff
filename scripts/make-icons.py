"""Generates the NurDiff icons from app-icon.png: the original (>= 64 px) and simplified variants for the small sizes.

Usage: python3 scripts/make-icons.py   (needs Pillow and ImageMagick, command "convert")
Writes to src-tauri/icons: png, icon.ico (one variant per size) and icon.icns (rounded corners).
"""
import os, subprocess, tempfile
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "app-icon.png")
OUT = os.path.join(ROOT, "src-tauri", "icons")
orig = Image.open(SRC).convert("RGBA")
TOP, BOT, XT, XB = 245, 805, (345, 680), (175, 850)
VARIANTS = {  # rows, joint thickness, vertical joints, small window, door width
    "xs": dict(n=3, g=60, joints=False, window=False, door=190),
    "s": dict(n=4, g=44, joints=True, window=False, door=190),
    "m": dict(n=6, g=34, joints=True, window=True, door=170),
}
def edge(y):
    f = (y - TOP) / (BOT - TOP)
    return XT[0] + (XB[0] - XT[0]) * f, XT[1] + (XB[1] - XT[1]) * f
def shapes(v):
    """White and blue polygons (blue above the white ones), in 1024 coordinates."""
    n, g = v["n"], v["g"]
    h = (BOT - TOP - (n - 1) * g) / n
    white, blue = [], []
    for i in range(n):
        y0 = TOP + i * (h + g); y1 = y0 + h
        (l0, r0), (l1, r1) = edge(y0), edge(y1)
        white.append([(l0, y0), (r0, y0), (r1, y1), (l1, y1)])
        if v["joints"] and 0 < i < n - 1 or (v["joints"] and i == 0):
            # one vertical joint per row, to the right or left of the centre in alternation
            w = r0 - l0; cx = l0 + w * (0.34 if i % 2 else 0.66)
            blue.append([(cx - g / 2, y0 - 1), (cx + g / 2, y0 - 1), (cx + g / 2, y1 + 1), (cx - g / 2, y1 + 1)])
    # door: it takes the last row
    y0 = TOP + (n - 1) * (h + g); dw = v["door"]
    blue.append([(512 - dw * 0.4, y0 - g * 0.3), (512 + dw * 0.4, y0 - g * 0.3), (512 + dw / 2, BOT + 2), (512 - dw / 2, BOT + 2)])
    if v["window"]:
        wy = TOP + 1 * (h + g) + h * 0.1
        blue.append([(484, wy), (540, wy), (540, wy + h * 0.8 + g / 2), (484, wy + h * 0.8 + g / 2)])
    return white, blue
GRAD = ((77, 166, 240), (34, 108, 209))
def render(name, size, rounded=False):
    if name == "orig":
        im = orig.resize((size, size), Image.LANCZOS)
    else:
        k = 8; N = size * k
        bg = Image.new("RGBA", (N, N))
        px = ImageDraw.Draw(bg)
        for y in range(N):
            t = y / (N - 1); px.line([(0, y), (N, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(*GRAD)) + (255,))
        white, blue = shapes(VARIANTS[name]); d = ImageDraw.Draw(bg); s = N / 1024
        for p in white: d.polygon([(x * s, y * s) for x, y in p], fill=(255, 255, 255, 255))
        gy = lambda y: tuple(round(a + (b - a) * y / 1024) for a, b in zip(*GRAD)) + (255,)
        for p in blue: d.polygon([(x * s, y * s) for x, y in p], fill=gy(sum(y for _, y in p) / 4))
        im = bg.resize((size, size), Image.LANCZOS)
    if rounded:
        m = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=int(size * 4 * 0.225), fill=255)
        im.putalpha(m.resize((size, size), Image.LANCZOS))
    return im
def pick(size):
    return "xs" if size <= 16 else "s" if size <= 32 else "m" if size <= 50 else "orig"
def make(size, **kw): return render(pick(size), size, **kw)
if __name__ == "__main__":
    for f, s in [("32x32.png", 32), ("64x64.png", 64), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512),
                 ("StoreLogo.png", 50)] + [(f"Square{n}x{n}Logo.png", n) for n in (30, 44, 71, 89, 107, 142, 150, 284, 310)]:
        make(s).save(f"{OUT}/{f}")
    # .ico: each size with its own variant
    sizes = [16, 24, 32, 48, 64, 128, 256]
    with tempfile.TemporaryDirectory() as tmp:
        for s in sizes: make(s).save(f"{tmp}/i{s}.png")
        subprocess.run(["convert"] + [f"{tmp}/i{s}.png" for s in sizes] + [f"{OUT}/icon.ico"], check=True)
    # .icns for macOS: rounded corners (the system does not apply them on its own to non-Xcode apps)
    big = [make(s, rounded=True) for s in (1024, 512, 256, 128, 64, 32, 16)]
    big[0].save(f"{OUT}/icon.icns", append_images=big[1:])

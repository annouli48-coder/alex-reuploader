"""Produce custom ALEX macOS .icns and Windows .ico icons on GitHub runners."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math

SIZE = 1024
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "build"
DEST.mkdir(parents=True, exist_ok=True)
im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((28, 28, 995, 995), radius=220, fill=255)
base = Image.new("RGBA", (SIZE, SIZE))
px = base.load()
for y in range(SIZE):
    for x in range(SIZE):
        d = math.hypot((x - 520) / 650, (y - 440) / 650)
        glow = max(0, 1 - d)
        edge = 0.5 + 0.5 * (x - y) / SIZE
        px[x, y] = (
            int(15 + 25 * glow + 8 * edge),
            int(9 + 8 * glow),
            int(28 + 40 * glow + 10 * edge),
            255,
        )
im.paste(base, (0, 0), mask)

def a_strokes(draw, fill, width, inset=0):
    draw.line(((270+inset, 773), (499, 243), (754-inset, 773)), fill=fill, width=width, joint="curve")
    draw.line(((353+inset, 608), (668-inset, 608)), fill=fill, width=width-10, joint="curve")

glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
a_strokes(ImageDraw.Draw(glow_layer), (148, 55, 255, 255), 80)
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(38))
im = Image.alpha_composite(im, glow_layer)
lines = ImageDraw.Draw(im)
lines.rounded_rectangle((30, 30, 993, 993), radius=219, outline=(128, 66, 195, 145), width=8)
a_strokes(lines, (108, 43, 210, 255), 74)
a_strokes(lines, (205, 125, 255, 255), 42)
a_strokes(lines, (244, 227, 255, 255), 14)
lines.ellipse((479, 221, 518, 260), fill=(247, 244, 255, 255))

im.save(DEST / "icon.png", optimize=True)
im.save(DEST / "icon.icns")
im.save(DEST / "icon.ico", sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
for suffix in ("png", "icns", "ico"):
    output = DEST / f"icon.{suffix}"
    with Image.open(output) as icon:
        assert icon.size[0] >= 256, (suffix, icon.size)
    assert output.stat().st_size > 1000
    print(f"Generated {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")

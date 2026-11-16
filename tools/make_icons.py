"""Generate Liftbook's app icons (a dumbbell on the theme colour). Run: python tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

BG = (17, 21, 28)
FG = (76, 141, 255)
OUT = Path(__file__).parent.parent / "app" / "icons"


def icon(size: int) -> Image.Image:
    s = 4  # supersample
    n = size * s
    im = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(im)
    u = n / 100
    r = 3 * u
    d.rounded_rectangle([22 * u, 46 * u, 78 * u, 54 * u], r, fill=FG)          # bar
    for x0 in (14, 74):                                                         # outer plates
        d.rounded_rectangle([x0 * u, 33 * u, (x0 + 12) * u, 67 * u], r, fill=FG)
    for x0 in (26, 64):                                                         # inner plates
        d.rounded_rectangle([x0 * u, 26 * u, (x0 + 10) * u, 74 * u], r, fill=FG)
    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        icon(size).save(OUT / f"icon-{size}.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()

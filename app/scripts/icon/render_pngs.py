"""Render the flat PNG icons (fallback icon, Android adaptive icon, favicon)
from the Icon Composer bundle's SVG layers.

iOS uses assets/HealthTracker.icon directly; everything else needs PNGs, which
have no Liquid Glass effects. Re-run after changing the .icon bundle:

    pip install cairosvg pillow
    python3 scripts/icon/render_pngs.py      (from app/)

The background colours are the bundle's display-p3 fill, converted to sRGB.
"""

import io
from pathlib import Path

import cairosvg
from PIL import Image

ASSETS = Path(__file__).resolve().parents[2] / "assets"
LAYERS = ASSETS / "HealthTracker.icon" / "Assets"
ORDER = ["2-bandage-back", "3-bandage-band", "4-bow-tails", "5-bow-loops", "6-bow-knot", "7-face", "8-ow"]
TOP, BOTTOM = "#ffe8b1", "#e6b972"  # icon.json fill, display-p3 -> sRGB


def body(name):
    s = (LAYERS / f"{name}.svg").read_text()
    return s[s.index(">") + 1 : s.rindex("</svg>")]


def extend_bandage(svg):
    # The bandage strips stop just past the 1024 canvas. Android's adaptive
    # icon shows a wider area, so stretch them along their own lines.
    svg = svg.replace("M-40 330 L1064 120 L1064 330 L-40 540 Z", "M-400 398.5 L1424 51.5 L1424 261.5 L-400 608.5 Z")
    return svg.replace("M250 -40 L440 -40 L210 420 L20 420 Z", "M430 -400 L620 -400 L210 420 L20 420 Z")


def art(extended=False):
    s = "".join(body(n) for n in ORDER)
    return extend_bandage(s) if extended else s


def ink_only(im):
    # Monochrome icon: keep only the dark ink lines (with occlusion intact),
    # as white on transparent; the paper and fold lines drop out.
    flat = Image.new("RGBA", im.size, "white")
    flat.alpha_composite(im)
    lum = flat.convert("L")
    alpha = lum.point(lambda v: max(0, min(255, int((200 - v) * 255 / 150))))
    out = Image.new("RGBA", im.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def gradient(y1=0, y2=1024):
    return (
        f'<defs><linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="{y1}" x2="0" y2="{y2}">'
        f'<stop offset="0" stop-color="{TOP}"/><stop offset="1" stop-color="{BOTTOM}"/></linearGradient></defs>'
    )


def render(content, view="0 0 1024 1024", size=1024):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="{size}" height="{size}">{content}</svg>'
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).convert("RGBA")


# Full-bleed square; the OS applies its own mask.
icon = render(gradient() + '<rect width="1024" height="1024" fill="url(#bg)"/>' + art()).convert("RGB")
icon.save(ASSETS / "icon.png")
icon.resize((48, 48), Image.LANCZOS).save(ASSETS / "favicon.png")

# Adaptive icon: a 108dp canvas of which the middle 72dp is visible, so the
# 1024 artwork fills the middle two thirds of a 1536 view.
WIDE = "-256 -256 1536 1536"
render(gradient() + '<rect x="-256" y="-256" width="1536" height="1536" fill="url(#bg)"/>', WIDE, 512).save(
    ASSETS / "android-icon-background.png"
)
fg = render(art(extended=True), WIDE, 512)
fg.save(ASSETS / "android-icon-foreground.png")
ink_only(fg).save(ASSETS / "android-icon-monochrome.png")
print("wrote icon.png, favicon.png and the android-icon-*.png files to", ASSETS)

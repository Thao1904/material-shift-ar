#!/usr/bin/env python3
"""
Generate the six face markers for the Material Shift cube and a printable PDF.

Outputs
  tools/markers/face-<name>.png   3:4 marker image (input for the 8th Wall image target CLI)
  print/faces/face-<name>.png     full square face artwork (marker + side strips)
  print/material-shift-cube.pdf   page 1: 6 cm cube net (A4 landscape, fits US Letter)
                                  pages 2-4: 10 cm faces to glue on a cardboard cube

Rule that the app relies on: the marker's HEIGHT equals the cube's EDGE LENGTH,
and the marker is centered on its face, upright as drawn in the net.

Run:  python3 tools/make-markers.py
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for cand in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf']:
    if not os.path.exists(FONT_BOLD) and os.path.exists(cand):
        FONT_BOLD = FONT_REG = cand

# name, letter, seed, accent color
FACES = [
    ('front', 'F', 101, (226, 85, 75)),
    ('right', 'R', 202, (47, 111, 208)),
    ('back', 'B', 303, (46, 160, 110)),
    ('left', 'L', 404, (231, 163, 33)),
    ('top', 'T', 505, (155, 107, 255)),
    ('bottom', 'D', 606, (20, 150, 170)),
]

MW, MH = 960, 1280          # marker 3:4
FACE = MH                   # square face side in px (marker height == face edge)
STRIP = (FACE - MW) // 2    # side strips


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def make_marker(letter, seed, accent):
    """Dense, non-repeating, high-contrast artwork. Different seed per face."""
    rnd = random.Random(seed)
    img = Image.new('RGB', (MW, MH), (238, 234, 226))
    d = ImageDraw.Draw(img)
    dark = [(18, 18, 20), (40, 40, 46), accent, tuple(int(c * 0.55) for c in accent)]
    light = [(250, 250, 248), (205, 200, 190), tuple(min(255, int(c * 0.4 + 160)) for c in accent)]

    # large blocks first, then progressively smaller detail
    for layer, (count, smin, smax) in enumerate([(14, 220, 420), (60, 70, 200), (220, 14, 70), (420, 4, 18)]):
        for _ in range(count):
            x, y = rnd.uniform(-40, MW + 40), rnd.uniform(-40, MH + 40)
            s = rnd.uniform(smin, smax)
            col = rnd.choice(dark if rnd.random() < 0.6 else light)
            kind = rnd.random()
            if kind < 0.3:
                a = rnd.uniform(0, math.pi)
                pts = [(x + math.cos(a + k * math.pi / 2) * s * rnd.uniform(.5, 1),
                        y + math.sin(a + k * math.pi / 2) * s * rnd.uniform(.5, 1)) for k in range(4)]
                d.polygon(pts, fill=col)
            elif kind < 0.55:
                d.ellipse([x - s / 2, y - s / 2, x + s / 2, y + s / 2], fill=col)
            elif kind < 0.75:
                pts = [(x + rnd.uniform(-s, s), y + rnd.uniform(-s, s)) for _ in range(3)]
                d.polygon(pts, fill=col)
            elif kind < 0.9:
                w = max(2, int(s / 6))
                pts = [(x, y)]
                for _ in range(rnd.randint(2, 5)):
                    pts.append((pts[-1][0] + rnd.uniform(-s, s), pts[-1][1] + rnd.uniform(-s, s)))
                d.line(pts, fill=col, width=w)
            else:
                d.ellipse([x - s / 2, y - s / 2, x + s / 2, y + s / 2], outline=col, width=max(2, int(s / 8)))

    # scattered text adds corners and edges the tracker likes
    words = ['MATERIAL', 'SHIFT', 'CITY', 'SCOPE', 'WOOD', 'MARBLE', 'METAL', 'WHITE', letter * 3]
    for _ in range(26):
        txt = rnd.choice(words) + str(rnd.randint(0, 99))
        f = font(FONT_BOLD, rnd.randint(26, 70))
        tile = Image.new('RGBA', (900, 140), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((10, 10), txt, font=f, fill=rnd.choice(dark + light) + (255,))
        tile = tile.rotate(rnd.uniform(0, 360), expand=True)
        img.paste(tile, (int(rnd.uniform(-200, MW - 100)), int(rnd.uniform(-100, MH - 50))), tile)

    # big face letter in a badge (for humans), off-center so the art stays asymmetric
    bx, by = int(MW * rnd.uniform(.18, .32)), int(MH * rnd.uniform(.12, .22))
    d.rounded_rectangle([bx - 110, by - 110, bx + 110, by + 110], radius=34, fill=(18, 18, 20), outline=(250, 250, 248), width=8)
    f = font(FONT_BOLD, 170)
    tw = d.textlength(letter, font=f)
    d.text((bx - tw / 2, by - 105), letter, font=f, fill=accent)
    d.rectangle([0, 0, MW - 1, MH - 1], outline=(18, 18, 20), width=10)
    return img


def make_face(marker, name, accent):
    """Square face: marker in the middle, dark strips left/right with an UP arrow."""
    face = Image.new('RGB', (FACE, FACE), (24, 24, 26))
    face.paste(marker, (STRIP, 0))
    d = ImageDraw.Draw(face)
    for x0 in (0, FACE - STRIP):
        cx = x0 + STRIP / 2
        d.polygon([(cx, 40), (cx - 46, 110), (cx + 46, 110)], fill=(250, 250, 248))
        d.rectangle([cx - 14, 108, cx + 14, 190], fill=(250, 250, 248))
        f = font(FONT_BOLD, 54)
        tile = Image.new('RGBA', (900, 90), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((0, 6), name.upper() + '  ·  UP ↑', font=f, fill=accent + (255,))
        tile = tile.rotate(90, expand=True)
        face.paste(tile, (int(cx - 45), 260), tile)
    return face


# ---------------------------------------------------------------- PDF

DPI = 300
MM = DPI / 25.4


def mm(v):
    return int(round(v * MM))


def dashed(d, a, b, dash=mm(2.2), gap=mm(1.6), fill=(120, 120, 120), width=3):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0)
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    t = 0
    while t < L:
        e = min(L, t + dash)
        d.line([(x0 + ux * t, y0 + uy * t), (x0 + ux * e, y0 + uy * e)], fill=fill, width=width)
        t = e + gap


def tab(d, a, b, outward, depth=mm(8)):
    """Trapezoid glue tab on edge a-b, pushed along unit vector `outward`."""
    (x0, y0), (x1, y1) = a, b
    ox, oy = outward
    ux, uy = (x1 - x0), (y1 - y0)
    L = math.hypot(ux, uy)
    ux, uy = ux / L, uy / L
    ins = depth
    pts = [a, (x0 + ox * depth + ux * ins, y0 + oy * depth + uy * ins),
           (x1 + ox * depth - ux * ins, y1 + oy * depth - uy * ins), b]
    d.polygon(pts, fill=(228, 228, 228), outline=(20, 20, 20))
    d.line(pts, fill=(20, 20, 20), width=4)
    cx, cy = (pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2
    f = font(FONT_REG, mm(2.6))
    d.text((cx - d.textlength('glue', font=f) / 2 - ox * mm(3.5), cy - mm(1.6) - oy * mm(3.5)), 'glue', font=f, fill=(110, 110, 110))
    dashed(d, a, b)


def page_net(faces_img, s_mm=60):
    W, H = mm(297), mm(210)
    page = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(page)
    s = mm(s_mm)
    netw, neth = 4 * s, 3 * s
    ox, oy = (W - netw - mm(8)) // 2, (H - neth) // 2 + mm(4)
    cells = {'top': (1, 0), 'left': (0, 1), 'front': (1, 1), 'right': (2, 1), 'back': (3, 1), 'bottom': (1, 2)}
    for name, (c, r) in cells.items():
        im = faces_img[name].resize((s, s), Image.LANCZOS)
        page.paste(im, (ox + c * s, oy + r * s))

    def P(c, r):
        return (ox + c * s, oy + r * s)

    # glue tabs: 7 joints
    tab(d, P(1, 0), P(1, 1), (-1, 0)); tab(d, P(2, 1), P(2, 0), (1, 0)); tab(d, P(2, 0), P(1, 0), (0, -1))
    tab(d, P(1, 3), P(1, 2), (-1, 0)); tab(d, P(2, 2), P(2, 3), (1, 0)); tab(d, P(1, 3), P(2, 3), (0, 1))
    tab(d, P(4, 1), P(4, 2), (1, 0))
    # fold lines between faces
    for a, b in [((1, 1), (2, 1)), ((1, 2), (2, 2)), ((1, 1), (1, 2)), ((2, 1), (2, 2)), ((3, 1), (3, 2))]:
        dashed(d, P(*a), P(*b), fill=(255, 255, 255), width=5)
        dashed(d, P(*a), P(*b), fill=(90, 90, 90), width=2)
    # outer cut line
    outline = [P(1, 0), P(2, 0), P(2, 1), P(4, 1), P(4, 2), P(2, 2), P(2, 3), P(1, 3), P(1, 2), P(0, 2), P(0, 1), P(1, 1), P(1, 0)]
    d.line(outline, fill=(10, 10, 10), width=5)

    ft, fb = font(FONT_BOLD, mm(5)), font(FONT_REG, mm(3))
    tx, ty = P(2, 0)[0] + mm(16), P(2, 0)[1] + mm(4)
    d.text((tx, ty), 'Material Shift cube · 6 cm', font=ft, fill=(20, 20, 20))
    lines = ['1. Print at 100% / Actual size (not "Fit to page").',
             '2. Cut along the solid outline.',
             '3. Fold every dashed line inward.',
             '4. Glue the grey tabs inside. Matte paper works best.',
             '5. Keep faces flat and corners sharp.']
    for i, ln in enumerate(lines):
        d.text((tx, ty + mm(9) + i * mm(5.2)), ln, font=fb, fill=(60, 60, 60))
    # 50 mm scale bar to check the print scale
    x0, y0 = P(2, 2)[0] + mm(16), P(2, 2)[1] + mm(30)
    d.rectangle([x0, y0, x0 + mm(50), y0 + mm(2)], fill=(20, 20, 20))
    d.text((x0, y0 - mm(5)), 'This bar must measure 50 mm', font=font(FONT_REG, mm(2.6)), fill=(60, 60, 60))
    return page


def page_big(faces_img, names, s_mm=100):
    W, H = mm(210), mm(297)
    page = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(page)
    s = mm(s_mm)
    gap = mm(18)
    y = (H - 2 * s - gap) // 2
    x = (W - s) // 2
    for name in names:
        page.paste(faces_img[name].resize((s, s), Image.LANCZOS), (x, y))
        d.rectangle([x, y, x + s, y + s], outline=(10, 10, 10), width=4)
        for cx, cy in [(x, y), (x + s, y), (x, y + s), (x + s, y + s)]:   # crop marks
            d.line([(cx - mm(6), cy), (cx + mm(6), cy)], fill=(10, 10, 10), width=2)
            d.line([(cx, cy - mm(6)), (cx, cy + mm(6))], fill=(10, 10, 10), width=2)
        d.text((x, y - mm(6)), f'{name.upper()} · 10 cm · arrow points to the TOP of the cube'
               if name not in ('top', 'bottom') else
               f'{name.upper()} · 10 cm · arrow points toward the ' + ('BACK' if name == 'top' else 'FRONT') + ' face',
               font=font(FONT_BOLD, mm(3.2)), fill=(30, 30, 30))
        y += s + gap
    d.text((mm(12), H - mm(14)), 'For a 10 cm cardboard cube. Print at 100%. Glue each face centered and upright.', font=font(FONT_REG, mm(3)), fill=(70, 70, 70))
    return page


def main():
    mdir = os.path.join(ROOT, 'tools', 'markers')
    fdir = os.path.join(ROOT, 'print', 'faces')
    os.makedirs(mdir, exist_ok=True)
    os.makedirs(fdir, exist_ok=True)
    faces_img = {}
    for name, letter, seed, accent in FACES:
        marker = make_marker(letter, seed, accent)
        marker.save(os.path.join(mdir, f'face-{name}.png'))
        face = make_face(marker, name, accent)
        face.save(os.path.join(fdir, f'face-{name}.png'))
        faces_img[name] = face
    pages = [page_net(faces_img), page_big(faces_img, ['front', 'right']),
             page_big(faces_img, ['back', 'left']), page_big(faces_img, ['top', 'bottom'])]
    out = os.path.join(ROOT, 'print', 'material-shift-cube.pdf')
    pages[0].save(out, 'PDF', resolution=DPI, save_all=True, append_images=pages[1:])
    print('wrote', out)


if __name__ == '__main__':
    main()

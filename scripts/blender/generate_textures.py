"""Generate crisp, high-resolution procedural PBR textures (albedo, bump, roughness) for Hanukkah 3D."""

import math
import os
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

TEXTURES_DIR = "/workspace/assets/textures"
os.makedirs(TEXTURES_DIR, exist_ok=True)


def save_height_as_normal_map(height_img, filename, strength=3.0):
    """Convert a grayscale PIL height image into a genuine RGB tangent-space normal map (valid for glTF 2.0!)."""
    h_arr = np.array(height_img.convert("L"), dtype=np.float32) / 255.0
    dx = (np.roll(h_arr, -1, axis=1) - np.roll(h_arr, 1, axis=1)) * 0.5
    dy = (np.roll(h_arr, -1, axis=0) - np.roll(h_arr, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(h_arr)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nr = np.clip((nx / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    ng = np.clip((ny / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    nb = np.clip((nz / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    return save_img(Image.fromarray(np.stack([nr, ng, nb], axis=-1)), filename)


def save_img(img, filename, quality=90):
    path = os.path.join(TEXTURES_DIR, filename)
    if filename.lower().endswith(".jpg") or filename.lower().endswith(".jpeg"):
        img.convert("RGB").save(path, "JPEG", quality=quality, optimize=True)
    else:
        img.save(path, "PNG", optimize=True)
    print(f"[tex] wrote {path} ({os.path.getsize(path) / 1024:.1f} KB)")
    return path


def draw_star_of_david(draw, cx, cy, r, outline, width=4, fill=None):
    pts1 = []
    pts2 = []
    for k in range(3):
        a1 = -math.pi / 2.0 + k * 2 * math.pi / 3.0
        a2 = math.pi / 2.0 + k * 2 * math.pi / 3.0
        pts1.append((cx + r * math.cos(a1), cy + r * math.sin(a1)))
        pts2.append((cx + r * math.cos(a2), cy + r * math.sin(a2)))
    if fill:
        draw.polygon(pts1, fill=fill)
        draw.polygon(pts2, fill=fill)
    for k in range(3):
        draw.line([pts1[k], pts1[(k + 1) % 3]], fill=outline, width=width)
        draw.line([pts2[k], pts2[(k + 1) % 3]], fill=outline, width=width)


def draw_hebrew_letter_vector(draw, letter, cx, cy, size, color, stroke=14):
    """Draw bold, unmistakable traditional serif Hebrew letters (Nun, Gimel, Hey, Shin) cleanly via vector paths."""
    s = size * 0.5
    # Helper for crisp serifed strokes
    def seg(p0, p1, w=stroke):
        draw.line([(cx + p0[0] * s, cy + p0[1] * s), (cx + p1[0] * s, cy + p1[1] * s)], fill=color, width=w, joint="curve")
        r = w * 0.48
        for p in (p0, p1):
            x, y = cx + p[0] * s, cy + p[1] * s
            draw.ellipse([x - r, y - r, x + r, y + r], fill=color)

    if letter == "NUN":  # נ
        # Top short horizontal crown
        seg((-0.18, -0.72), (0.28, -0.72), int(stroke * 1.15))
        # Vertical right stem slightly curved
        seg((0.22, -0.72), (0.26, 0.70), stroke)
        # Wide bottom foot extending left
        seg((-0.52, 0.72), (0.30, 0.72), int(stroke * 1.2))
        # Subtle serif crown tag on top-left
        seg((-0.20, -0.82), (-0.14, -0.64), int(stroke * 0.75))

    elif letter == "GIMEL":  # ג
        # Top horizontal crown
        seg((-0.25, -0.72), (0.26, -0.72), int(stroke * 1.15))
        # Main vertical stem
        seg((0.18, -0.72), (0.22, 0.42), stroke)
        # Right foot kicking out bottom-right
        seg((0.20, 0.36), (0.44, 0.74), int(stroke * 1.05))
        # Left foot kicking out bottom-left from lower mid-stem
        seg((0.18, 0.24), (-0.42, 0.74), int(stroke * 1.0))

    elif letter == "HEY":  # ה
        # Top horizontal bar
        seg((-0.56, -0.70), (0.52, -0.70), int(stroke * 1.2))
        # Right vertical leg all the way down
        seg((0.46, -0.70), (0.46, 0.74), stroke)
        # Left vertical leg with classic open gap at top!
        seg((-0.46, -0.22), (-0.46, 0.74), stroke)
        # Tiny serif flourish on top-left
        seg((-0.58, -0.78), (-0.50, -0.62), int(stroke * 0.7))

    elif letter == "SHIN":  # ש
        # Bottom rounded U base
        seg((-0.52, 0.68), (0.52, 0.68), int(stroke * 1.15))
        # Left arm curving up
        seg((-0.58, -0.68), (-0.48, 0.68), stroke)
        # Right arm curving up
        seg((0.58, -0.68), (0.48, 0.68), stroke)
        # Center arm meeting lower-right/center
        seg((0.02, -0.66), (-0.06, 0.62), int(stroke * 0.95))
        # Decorative crowns at tips of the 3 prongs
        for px in (-0.60, 0.02, 0.60):
            seg((px - 0.08, -0.72), (px + 0.08, -0.66), int(stroke * 0.85))


def generate_wood_textures():
    """Rich warm dark walnut tabletop + honey-oak hardwood floor plank textures."""
    rng = np.random.default_rng(42)

    # 1. Walnut tabletop (1024x1024)
    w, h = 1024, 1024
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]

    # Multi-frequency wood grain rings stretched horizontally along X
    n1 = np.sin(y * 95.0 + 2.8 * np.sin(x * 7.5 + y * 5.0) + 1.2 * np.sin(x * 19.0 - y * 3.0))
    n2 = np.sin(y * 230.0 + 4.5 * np.sin(x * 11.0 + y * 9.0))
    n3 = np.sin(y * 42.0 + 1.5 * np.cos(x * 4.0))
    grain = 0.55 * n1 + 0.25 * n2 + 0.20 * n3
    grain = (grain - grain.min()) / (grain.max() - grain.min())

    # Subtle plank joints across Y (5 wide walnut boards)
    plank_idx = np.floor(y * 5.0)
    plank_tone = 0.92 + 0.14 * np.sin(plank_idx * 2.3 + 0.7)
    seam = np.abs((y * 5.0) - np.round(y * 5.0))
    seam_mask = np.clip(seam / 0.008, 0.25, 1.0)

    # Fine pores
    pores = rng.normal(0.0, 0.035, (h, w))
    # Smooth pores slightly along X for wood vessels
    pores = (pores + np.roll(pores, 1, axis=1) + np.roll(pores, -1, axis=1)) / 3.0

    val = np.clip((0.28 + 0.42 * grain) * plank_tone * seam_mask + pores, 0.0, 1.0)
    r = np.clip(val * 138 + 26, 0, 255).astype(np.uint8)
    g = np.clip(val * 82 + 14, 0, 255).astype(np.uint8)
    b = np.clip(val * 46 + 8, 0, 255).astype(np.uint8)
    walnut_col = Image.fromarray(np.stack([r, g, b], axis=-1))
    save_img(walnut_col, "walnut_albedo.jpg", quality=92)

    rough = np.clip((0.30 + 0.24 * (1.0 - grain) + 0.15 * (1.0 - seam_mask)) * 255, 45, 220).astype(np.uint8)
    save_img(Image.fromarray(rough), "walnut_rough.jpg", quality=88)

    bump = np.clip((0.5 + 0.35 * grain + 2.0 * pores) * seam_mask * 255, 0, 255).astype(np.uint8)
    save_height_as_normal_map(Image.fromarray(bump), "walnut_normal.png", strength=1.8)

    # 2. Hardwood floor planks (1024x1024, warm oak)
    f_grain = 0.5 + 0.5 * np.sin(y * 160.0 + 3.0 * np.sin(x * 9.0 + y * 6.0))
    plank_rows = np.floor(y * 10.0)
    stagger = ((plank_rows % 2) * 0.5 + x * 2.0) % 1.0
    plank_id = plank_rows * 3.1 + np.floor(((plank_rows % 2) * 0.5 + x * 2.0))
    tone = 0.85 + 0.24 * (0.5 + 0.5 * np.sin(plank_id * 1.93))
    y_seam = np.clip(np.abs(y * 10.0 - np.round(y * 10.0)) / 0.014, 0.22, 1.0)
    x_seam = np.clip(np.minimum(stagger, 1.0 - stagger) / 0.008, 0.28, 1.0)
    f_val = np.clip((0.36 + 0.34 * f_grain) * tone * y_seam * x_seam + pores * 0.7, 0.0, 1.0)
    fr = np.clip(f_val * 162 + 32, 0, 255).astype(np.uint8)
    fg = np.clip(f_val * 106 + 18, 0, 255).astype(np.uint8)
    fb = np.clip(f_val * 62 + 10, 0, 255).astype(np.uint8)
    save_img(Image.fromarray(np.stack([fr, fg, fb], axis=-1)), "floor_albedo.jpg", quality=90)
    f_rough = np.clip((0.38 + 0.20 * (1.0 - f_grain)) * 255, 65, 220).astype(np.uint8)
    save_img(Image.fromarray(f_rough), "floor_rough.jpg", quality=86)


def generate_textile_textures():
    """Generate aspect-ratio-matched blue/white/silver woven rug, embroidered table runner, and challah cover."""
    # 1. Blue, Ivory & Silver Woven Area Rug (1408x1024 -> exact 1.375:1 ratio matching 3.10m x 2.25m rug!)
    w, h = 1408, 1024
    img = Image.new("RGB", (w, h), (22, 42, 86))
    draw = ImageDraw.Draw(img)

    # Borders (uniform pixel margin so border thickness is identical on all 4 sides!)
    draw.rectangle([26, 26, w - 26, h - 26], outline=(232, 236, 244), width=18)
    draw.rectangle([58, 58, w - 58, h - 58], outline=(168, 182, 206), width=8)
    draw.rectangle([82, 82, w - 82, h - 82], fill=(238, 240, 245), outline=(34, 62, 122), width=10)
    draw.rectangle([128, 128, w - 128, h - 128], fill=(26, 50, 98), outline=(185, 198, 220), width=6)

    # Geometric diamond border motifs evenly spaced along horizontal & vertical edges
    for cx in range(160, w - 140, 92):
        for cy in (105, h - 105):
            draw.polygon([(cx, cy - 12), (cx + 12, cy), (cx, cy + 12), (cx - 12, cy)], fill=(36, 68, 134))
    for cy in range(160, h - 140, 92):
        for cx in (105, w - 105):
            draw.polygon([(cx, cy - 12), (cx + 12, cy), (cx, cy + 12), (cx - 12, cy)], fill=(36, 68, 134))

    # Central medallion & corner medallions with true 1:1 undistorted Stars of David!
    draw_star_of_david(draw, w // 2, h // 2, 210, outline=(228, 234, 244), width=10, fill=(38, 70, 136))
    draw_star_of_david(draw, w // 2, h // 2, 138, outline=(176, 192, 218), width=6, fill=(24, 46, 92))
    draw_star_of_david(draw, w // 2, h // 2, 66, outline=(240, 242, 246), width=5)

    for cx, cy in [(265, 255), (w - 265, 255), (265, h - 255), (w - 265, h - 255)]:
        draw_star_of_david(draw, cx, cy, 62, outline=(196, 208, 228), width=5, fill=(34, 64, 124))

    # Add fine woven cloth grain
    arr = np.array(img, dtype=np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    weave = 1.0 + 0.06 * np.sin(xx * 1.4) * np.sin(yy * 1.4) + 0.03 * np.sin(yy * 0.7)
    arr = np.clip(arr * weave[:, :, None], 0, 255).astype(np.uint8)
    save_img(Image.fromarray(arr), "rug_albedo.jpg", quality=90)

    # 2. Embroidered Blue/White/Silver Table Runner (2048x372 -> exact 5.505:1 ratio matching 2.04m x 0.37m runner!)
    rw, rh = 2048, 372
    runner = Image.new("RGB", (rw, rh), (241, 243, 248))
    dr = ImageDraw.Draw(runner)
    # Royal blue side stripes & silver thread trim
    dr.rectangle([0, 0, rw, 34], fill=(22, 48, 108))
    dr.rectangle([0, rh - 34, rw, rh], fill=(22, 48, 108))
    dr.rectangle([0, 38, rw, 48], fill=(176, 190, 214))
    dr.rectangle([0, rh - 48, rw, rh - 38], fill=(176, 190, 214))
    dr.rectangle([0, 54, rw, 59], fill=(38, 72, 148))
    dr.rectangle([0, rh - 59, rw, rh - 54], fill=(38, 72, 148))

    # Perfectly proportioned 1:1 repeating silver & cobalt Star of David damask down the runner!
    step_x = 186
    for cx in range(110, rw - 60, step_x):
        draw_star_of_david(dr, cx, rh // 2, 54, outline=(156, 174, 206), width=5)
        draw_star_of_david(dr, cx, rh // 2, 28, outline=(46, 82, 158), width=3)
        if cx + step_x // 2 < rw - 60:
            mx = cx + step_x // 2
            draw_star_of_david(dr, mx, 102, 20, outline=(168, 184, 212), width=3)
            draw_star_of_david(dr, mx, rh - 102, 20, outline=(168, 184, 212), width=3)

    rarr = np.array(runner, dtype=np.float32)
    yy, xx = np.mgrid[0:rh, 0:rw]
    linen = 1.0 + 0.042 * np.sin(xx * 2.1) + 0.042 * np.sin(yy * 2.1)
    rarr = np.clip(rarr * linen[:, :, None], 0, 255).astype(np.uint8)
    save_img(Image.fromarray(rarr), "runner_albedo.jpg", quality=92)

    # 3. Embroidered White, Royal Blue & Silver Challah Cover (1024x1024)
    cw, ch = 1024, 1024
    challah_cov = Image.new("RGB", (cw, ch), (245, 245, 242))
    dc = ImageDraw.Draw(challah_cov)

    # Ornate cobalt velvet border + silver satin stitching
    dc.rectangle([28, 28, cw - 28, ch - 28], outline=(24, 52, 118), width=36)
    dc.rectangle([68, 68, cw - 68, ch - 68], outline=(188, 198, 214), width=10)
    dc.rectangle([94, 94, cw - 94, ch - 94], outline=(38, 76, 158), width=6)

    # Decorative corner scrolls/diamonds
    for cx, cy in [(142, 142), (cw - 142, 142), (142, ch - 142), (cw - 142, ch - 142)]:
        draw_star_of_david(dc, cx, cy, 38, outline=(36, 72, 152), width=5)

    # Central embroidered oval wreath & Star of David emblem
    dc.ellipse([230, 260, cw - 230, ch - 260], outline=(180, 192, 212), width=12)
    dc.ellipse([255, 285, cw - 255, ch - 285], outline=(28, 60, 134), width=7)
    draw_star_of_david(dc, cw // 2, ch // 2, 155, outline=(28, 60, 134), width=12, fill=(235, 240, 248))
    draw_star_of_david(dc, cw // 2, ch // 2, 95, outline=(176, 188, 208), width=7)

    # Embossed embroidery bump map
    carr = np.array(challah_cov, dtype=np.float32)
    yy, xx = np.mgrid[0:ch, 0:cw]
    silk = 1.0 + 0.03 * np.sin(xx * 2.5) + 0.03 * np.sin(yy * 2.5)
    carr = np.clip(carr * silk[:, :, None], 0, 255).astype(np.uint8)
    save_img(Image.fromarray(carr), "challah_cover_albedo.jpg", quality=92)

    # Normal map highlights the blue/silver embroidery stitching
    diff = np.abs(245.0 - carr.mean(axis=-1))
    cbump = np.clip(110 + diff * 1.4, 0, 255).astype(np.uint8)
    save_height_as_normal_map(Image.fromarray(cbump).filter(ImageFilter.GaussianBlur(1.2)), "challah_cover_normal.png", strength=2.2)


def generate_dreidel_and_gelt_textures():
    """Generate crisp Hebrew letter face panels for dreidels (Nun, Gimel, Hey, Shin) and embossed gold gelt coin."""
    # 1. 2x2 atlas of the 4 Hebrew letters for both heirloom silver/cobalt & painted wooden dreidels
    # Layout: TL=NUN (נ), TR=GIMEL (ג), BL=HEY (ה), BR=SHIN (ש)
    letters = [("NUN", 0, 0), ("GIMEL", 1, 0), ("HEY", 0, 1), ("SHIN", 1, 1)]
    cell = 512
    size = cell * 2

    # Variant A: Royal Blue Enamel & Polished Silver Heirloom Dreidel Atlas
    img_heir = Image.new("RGB", (size, size), (18, 42, 108))
    dh = ImageDraw.Draw(img_heir)
    bump_heir = Image.new("L", (size, size), 90)
    dbh = ImageDraw.Draw(bump_heir)

    for letter, gx, gy in letters:
        x0, y0 = gx * cell, gy * cell
        cx, cy = x0 + cell // 2, y0 + cell // 2
        # Ornate silver filigree frame
        dh.rectangle([x0 + 26, y0 + 26, x0 + cell - 26, y0 + cell - 26], outline=(218, 224, 236), width=16)
        dh.rectangle([x0 + 54, y0 + 54, x0 + cell - 54, y0 + cell - 54], outline=(170, 186, 214), width=6)
        dbh.rectangle([x0 + 26, y0 + 26, x0 + cell - 26, y0 + cell - 26], outline=225, width=16)
        dbh.rectangle([x0 + 54, y0 + 54, x0 + cell - 54, y0 + cell - 54], outline=195, width=6)
        # Corner filigree dots
        for dx, dy in [(76, 76), (cell - 76, 76), (76, cell - 76), (cell - 76, cell - 76)]:
            dh.ellipse([x0 + dx - 10, y0 + dy - 10, x0 + dx + 10, y0 + dy + 10], fill=(224, 230, 240))
            dbh.ellipse([x0 + dx - 10, y0 + dy - 10, x0 + dx + 10, y0 + dy + 10], fill=240)
        # Raised silver/gold Hebrew letter
        draw_hebrew_letter_vector(dh, letter, cx, cy, 240, color=(234, 238, 246), stroke=28)
        draw_hebrew_letter_vector(dbh, letter, cx, cy, 240, color=250, stroke=28)

    save_img(img_heir, "dreidel_heirloom_albedo.jpg", quality=92)
    save_height_as_normal_map(bump_heir.filter(ImageFilter.GaussianBlur(1.6)), "dreidel_heirloom_normal.png", strength=4.2)

    # Variant B: Classic Painted Blue & White / Wood Playable Dreidel Atlas
    img_play = Image.new("RGB", (size, size), (34, 72, 152))
    dp = ImageDraw.Draw(img_play)
    for letter, gx, gy in letters:
        x0, y0 = gx * cell, gy * cell
        cx, cy = x0 + cell // 2, y0 + cell // 2
        dp.rectangle([x0 + 22, y0 + 22, x0 + cell - 22, y0 + cell - 22], outline=(238, 242, 248), width=12)
        draw_hebrew_letter_vector(dp, letter, cx, cy, 250, color=(246, 244, 234), stroke=30)
    save_img(img_play, "dreidel_blue_albedo.jpg", quality=90)

    # Variant C: Warm Natural Birch/Gold Wood Dreidel Atlas
    img_wood = Image.new("RGB", (size, size), (214, 174, 118))
    dw = ImageDraw.Draw(img_wood)
    for letter, gx, gy in letters:
        x0, y0 = gx * cell, gy * cell
        cx, cy = x0 + cell // 2, y0 + cell // 2
        dw.rectangle([x0 + 22, y0 + 22, x0 + cell - 22, y0 + cell - 22], outline=(28, 56, 128), width=10)
        draw_hebrew_letter_vector(dw, letter, cx, cy, 250, color=(24, 52, 122), stroke=30)
    save_img(img_wood, "dreidel_wood_albedo.jpg", quality=90)

    # 2. Embossed Chocolate Gelt Coin Bump & Albedo (512x512)
    gs = 512
    gelt_bump = Image.new("L", (gs, gs), 115)
    dg = ImageDraw.Draw(gelt_bump)
    cx = cy = gs // 2
    # Outer milled rim & beaded ring
    dg.ellipse([16, 16, gs - 16, gs - 16], outline=245, width=18)
    dg.ellipse([44, 44, gs - 44, gs - 44], outline=210, width=6)
    for i in range(44):
        a = 2 * math.pi * i / 44
        bx = cx + 206 * math.cos(a)
        by = cy + 206 * math.sin(a)
        dg.ellipse([bx - 5, by - 5, bx + 5, by + 5], fill=240)
    # Embossed Star of David + miniature menorah emblem
    draw_star_of_david(dg, cx, cy, 138, outline=240, width=14)
    # Subtle foil crinkle noise
    rng = np.random.default_rng(7)
    garr = np.array(gelt_bump.filter(ImageFilter.GaussianBlur(1.4)), dtype=np.float32)
    crinkle = rng.normal(0, 12, (gs, gs))
    crinkle_img = Image.fromarray(np.clip(128 + crinkle, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))
    garr = np.clip(garr + (np.array(crinkle_img, dtype=np.float32) - 128.0) * 0.7, 0, 255).astype(np.uint8)
    save_height_as_normal_map(Image.fromarray(garr), "gelt_normal.png", strength=5.0)

    # 3. Hanukkah Candle Box Artwork (512x512)
    bw, bh = 512, 512
    box = Image.new("RGB", (bw, bh), (242, 245, 250))
    db = ImageDraw.Draw(box)
    db.rectangle([0, 0, bw, 92], fill=(22, 54, 128))
    db.rectangle([0, bh - 76, bw, bh], fill=(22, 54, 128))
    db.rectangle([20, 108, bw - 20, bh - 92], outline=(174, 190, 218), width=6)
    # Decorative menorah graphic + Star of David on candle box
    draw_star_of_david(db, bw // 2, 240, 86, outline=(28, 64, 144), width=10, fill=(228, 236, 248))
    # Stripes
    for k in range(9):
        sx = 86 + k * 42
        col = (30, 68, 152) if k % 2 == 0 else (188, 200, 222)
        db.rectangle([sx, 360, sx + 22, 405], fill=col)
    save_img(box, "candle_box_albedo.jpg", quality=90)


def generate_food_and_ceramic_textures():
    """Blue-and-white ceramic platter, braided egg-washed challah crust, sufganiyah powdered-sugar top."""
    # 1. Blue-and-white porcelain platter (512x512)
    s = 512
    plate = Image.new("RGB", (s, s), (244, 246, 250))
    dp = ImageDraw.Draw(plate)
    c = s // 2
    dp.ellipse([14, 14, s - 14, s - 14], outline=(24, 58, 136), width=14)
    dp.ellipse([42, 42, s - 42, s - 42], outline=(168, 186, 216), width=6)
    dp.ellipse([64, 64, s - 64, s - 64], outline=(36, 76, 158), width=4)
    for i in range(24):
        a = 2 * math.pi * i / 24
        px, py = c + 206 * math.cos(a), c + 206 * math.sin(a)
        dp.ellipse([px - 8, py - 8, px + 8, py + 8], fill=(32, 70, 152))
    draw_star_of_david(dp, c, c, 90, outline=(196, 210, 234), width=6)
    save_img(plate, "platter_albedo.jpg", quality=90)

    # 2. Braided Golden Challah Crust Albedo & Bump (512x512)
    rng = np.random.default_rng(101)
    yy, xx = np.mgrid[0:s, 0:s] / float(s)
    crust_var = 0.5 + 0.3 * np.sin(xx * 24.0) * np.cos(yy * 18.0) + 0.2 * rng.normal(0, 0.25, (s, s))
    crust_var = np.clip(crust_var, 0.0, 1.0)
    cr = np.clip(182 + crust_var * 52, 0, 255).astype(np.uint8)
    cg = np.clip(112 + crust_var * 48, 0, 255).astype(np.uint8)
    cb = np.clip(42 + crust_var * 26, 0, 255).astype(np.uint8)
    challah_img = Image.fromarray(np.stack([cr, cg, cb], axis=-1)).filter(ImageFilter.GaussianBlur(1.2))
    # Sprinkle realistic sesame seeds!
    dc = ImageDraw.Draw(challah_img)
    for _ in range(380):
        sx = random.randint(8, s - 8)
        sy = random.randint(8, s - 8)
        dc.ellipse([sx - 3, sy - 2, sx + 3, sy + 2], fill=(244, 232, 198))
    save_img(challah_img, "challah_albedo.jpg", quality=90)

    # 3. Sufganiyah (fried doughnut with pale fry ring & powdered sugar dusting, mapped by V = 0 bottom -> 1 top!)
    sw, sh = 512, 512
    arr = np.zeros((sh, sw, 3), dtype=np.float32)
    v = np.linspace(0.0, 1.0, sh)[:, None]  # row 0 = top (v=1 in Blender UV), row sh-1 = bottom
    v_height = 1.0 - v  # 1 at top of doughnut, 0 at bottom
    noise = rng.normal(0, 1.0, (sh, sw))
    noise_smooth = np.array(Image.fromarray(np.clip(128 + noise * 40, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.0)), dtype=np.float32) / 255.0

    # Golden fried brown base
    r = np.full((sh, sw), 186.0) + (noise_smooth - 0.5) * 28.0
    g = np.full((sh, sw), 118.0) + (noise_smooth - 0.5) * 22.0
    b = np.full((sh, sw), 52.0) + (noise_smooth - 0.5) * 14.0

    # Pale golden equatorial fry-line around v_height = 0.50
    fry_band = np.exp(-((v_height - 0.48) / 0.085) ** 2)
    r = r * (1 - 0.45 * fry_band) + 236.0 * (0.45 * fry_band)
    g = g * (1 - 0.45 * fry_band) + 198.0 * (0.45 * fry_band)
    b = b * (1 - 0.45 * fry_band) + 128.0 * (0.45 * fry_band)

    # Generous snowy powdered sugar dusting on upper dome (v_height > 0.62)
    sugar_mask = np.clip((v_height - 0.58 + (noise_smooth - 0.5) * 0.22) / 0.22, 0.0, 1.0) ** 1.3
    speckle = np.clip(rng.normal(0.88, 0.14, (sh, sw)), 0.45, 1.0)
    sugar_w = np.clip(sugar_mask * speckle * 0.92, 0.0, 0.94)
    r = r * (1 - sugar_w) + 250.0 * sugar_w
    g = g * (1 - sugar_w) + 249.0 * sugar_w
    b = b * (1 - sugar_w) + 246.0 * sugar_w

    suf_img = Image.fromarray(np.stack([np.clip(r, 0, 255), np.clip(g, 0, 255), np.clip(b, 0, 255)], axis=-1).astype(np.uint8))
    save_img(suf_img, "sufganiyah_albedo.jpg", quality=90)

    # Organic fried dough pores + granular powdered sugar micro-bump normal map
    dough_h = np.clip(128.0 + (noise_smooth - 0.5) * 90.0 + rng.normal(0, 14.0, (sh, sw)) * (0.4 + 0.6 * sugar_w), 0, 255).astype(np.uint8)
    save_height_as_normal_map(Image.fromarray(dough_h).filter(ImageFilter.GaussianBlur(0.8)), "sufganiyah_normal.png", strength=2.6)


def generate_carved_silver_textures():
    """Generate 1024x1024 Hazorfim-style baroque chased, repousse & engraved sterling silver PBR maps:
    - silver_carved_albedo.jpg  (bright 925 silver ridges + authentic dark-oxidized patina inside carved valleys)
    - silver_carved_rough.jpg   (mirror-polished highlights 0.09..0.15 + satin/oxidized recesses 0.42..0.58 + micro-wear)
    - silver_carved_normal.png  (deep crisp Sobel tangent-space normal map for rich 3D carved relief!)
    """
    s = 1024
    # Build an intricate tileable baroque floral/acanthus/vine/beadwork heightfield (float 0..1)
    height_img = Image.new("L", (s, s), 68)
    d = ImageDraw.Draw(height_img)

    # 1. Fine hammered / stippled jeweler's background (chasing punch texture)
    rng = np.random.default_rng(925)
    yy, xx = np.mgrid[0:s, 0:s]
    stipple = 12.0 * np.sin(xx * 0.42) * np.sin(yy * 0.42) + rng.normal(0, 6.0, (s, s))
    base_arr = np.clip(64.0 + stipple, 35, 95).astype(np.uint8)
    height_img = Image.fromarray(base_arr)
    d = ImageDraw.Draw(height_img)

    # 2. Horizontal braided rope & pearl beadwork bands (top, mid, bottom borders)
    for by in (64, 512, 960):
        # Twin raised fillet lines
        d.rectangle([0, by - 26, s, by - 18], fill=215)
        d.rectangle([0, by + 18, s, by + 26], fill=215)
        # Beaded pearl chain
        for bx in range(0, s + 32, 32):
            d.ellipse([bx - 12, by - 12, bx + 12, by + 12], fill=248, outline=130, width=2)

    # 3. Flowing Baroque Acanthus & Grapevine S-Scrolls in upper & lower frieze zones
    def draw_scroll_vine(y_center, amp, phase_shift=0.0):
        # Main undulating repousse vine stem (2 full tileable cycles across 1024px)
        pts = []
        for x in range(0, s + 8, 8):
            ang = 2.0 * math.pi * (x / s) * 4.0 + phase_shift
            y = y_center + amp * math.sin(ang)
            pts.append((x, y))
        d.line(pts, fill=232, width=14, joint="curve")

        # Curling acanthus leaf volutes, grape clusters & floral rosettes at every wave crest/trough
        for k in range(8):
            cx = int((k + 0.5) * (s / 8.0))
            sgn = 1 if k % 2 == 0 else -1
            cy = int(y_center + sgn * amp * 0.78)

            # Sculpted curled scroll volute
            for r_step, val in [(46, 175), (34, 215), (22, 245)]:
                d.arc([cx - r_step, cy - r_step, cx + r_step, cy + r_step], start=20, end=295, fill=val, width=9)

            # Radiating carved acanthus leaves fanning off the scroll
            for leaf_ang in (-0.95, -0.45, 0.0, 0.45, 0.95):
                a = (math.pi / 2.0 if sgn > 0 else -math.pi / 2.0) + leaf_ang
                lx = cx + int(math.cos(a) * 58)
                ly = cy - int(math.sin(a) * 58)
                mx = cx + int(math.cos(a) * 32)
                my = cy - int(math.sin(a) * 32)
                d.line([(cx, cy), (lx, ly)], fill=238, width=10)
                d.ellipse([mx - 11, my - 11, mx + 11, my + 11], fill=225)
                d.ellipse([lx - 7, ly - 7, lx + 7, ly + 7], fill=248)

            # Miniature 6-petal rosette flowerette nestled in the scroll heart
            d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=252)
            for p_i in range(6):
                pa = p_i * math.pi / 3.0
                px = cx + int(18 * math.cos(pa))
                py = cy + int(18 * math.sin(pa))
                d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=236)

            # Tiny grapevine cluster tucked opposite the scroll
            gx = cx + 44
            gy = int(y_center - sgn * amp * 0.32)
            for drx, dry in [(0, 0), (-10, 8), (10, 8), (-5, 18), (5, 18), (0, 27)]:
                d.ellipse([gx + drx - 6, gy + dry - 6, gx + drx + 6, gy + dry + 6], fill=235)

    draw_scroll_vine(288, 72, phase_shift=0.0)
    draw_scroll_vine(736, 72, phase_shift=math.pi / 2.0)

    # 4. Delicate engraved gadrooning flutes / vertical leaf ribs between scrolls
    for x in range(0, s, 64):
        for y0, y1 in [(112, 178), (398, 464), (560, 626), (846, 912)]:
            d.rounded_rectangle([x + 12, y0, x + 50, y1], radius=18, fill=210, outline=95, width=4)
            d.line([(x + 31, y0 + 10), (x + 31, y1 - 10)], fill=248, width=5)

    # Soften heightfield slightly to emulate cast & hand-chased beveled sterling silver metal!
    h_smooth = height_img.filter(ImageFilter.GaussianBlur(1.4))
    h_arr = np.array(h_smooth, dtype=np.float32) / 255.0

    # Subtle micro-polishing hairline brush wear across the silver
    micro_wear = rng.normal(0.0, 0.018, (s, s))
    micro_wear = (micro_wear + np.roll(micro_wear, 1, axis=1) + np.roll(micro_wear, -1, axis=1)) / 3.0

    # A. Albedo Map: bright sterling silver on raised carvings, rich dark oxidized tarnish in recessed crevices!
    # Height < 0.35 -> antique oxidized dark silver (~0.34..0.52); Height > 0.65 -> brilliant sterling (~0.92..0.97)
    occ = np.clip((h_arr - 0.20) / 0.68, 0.0, 1.0) ** 0.72
    sr = np.clip((0.32 + 0.65 * occ + micro_wear) * 255, 58, 252).astype(np.uint8)
    sg = np.clip((0.33 + 0.64 * occ + micro_wear) * 255, 60, 250).astype(np.uint8)
    sb = np.clip((0.37 + 0.61 * occ + micro_wear) * 255, 68, 254).astype(np.uint8)
    save_img(Image.fromarray(np.stack([sr, sg, sb], axis=-1)), "silver_carved_albedo.jpg", quality=92)

    # B. Roughness Map: mirror-polished raised silver ridges (0.09..0.15), rougher tarnished recesses (0.46..0.58)
    rough = np.clip(0.54 - 0.43 * occ + micro_wear * 2.2, 0.08, 0.62)
    save_img(Image.fromarray((rough * 255).astype(np.uint8)), "silver_carved_rough.jpg", quality=90)

    # C. Crisp Sobel Tangent-Space Normal Map (lossless PNG for sharp specular carving glints!)
    # Tileable wrap-around central differences
    dx = (np.roll(h_arr, -1, axis=1) - np.roll(h_arr, 1, axis=1)) * 0.5
    dy = (np.roll(h_arr, -1, axis=0) - np.roll(h_arr, 1, axis=0)) * 0.5
    strength = 7.5
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(h_arr)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nr = np.clip((nx / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    ng = np.clip((ny / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    nb = np.clip((nz / norm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    save_img(Image.fromarray(np.stack([nr, ng, nb], axis=-1)), "silver_carved_normal.png")


def generate_winter_night_backdrop():
    """Crisp, atmospheric 2048x1360 winter night panorama seen through the window:
    deep twilight sapphire sky, crisp stars & seamless crescent moon, layered snow-dusted conifer forest,
    and detailed distant snowy cottages with warm glowing multi-pane windows."""
    w, h = 2048, 1360
    yy, xx = np.mgrid[0:h, 0:w]
    t = yy / float(h)
    u = xx / float(w)

    # Deep midnight sapphire sky with subtle moonlit winter clouds
    cloud = (
        0.5
        + 0.25 * np.sin(u * 9.5 + t * 4.0) * np.cos(u * 4.2 - t * 6.5)
        + 0.25 * np.sin(u * 18.0 - t * 11.0)
    )
    cloud_band = np.exp(-((t - 0.34) / 0.20) ** 2) * np.clip(cloud, 0.0, 1.0)

    r = 4 + 13 * (t ** 1.8) + 12 * cloud_band + 16 * np.exp(-((t - 0.63) / 0.14) ** 2)
    g = 10 + 25 * (t ** 1.6) + 20 * cloud_band + 24 * np.exp(-((t - 0.63) / 0.14) ** 2)
    b = 28 + 56 * (t ** 1.35) + 38 * cloud_band + 42 * np.exp(-((t - 0.63) / 0.14) ** 2)
    sky = Image.fromarray(np.stack([np.clip(r, 0, 255), np.clip(g, 0, 255), np.clip(b, 0, 255)], axis=-1).astype(np.uint8))

    # Crisp stars with varied magnitudes
    draw = ImageDraw.Draw(sky)
    rng = random.Random(2026)
    for _ in range(360):
        sx = rng.randint(12, w - 12)
        sy = rng.randint(12, int(h * 0.54))
        rad = rng.choice([1, 1, 1, 2, 2])
        br = rng.randint(145, 255)
        draw.ellipse([sx - rad, sy - rad, sx + rad, sy + rad], fill=(br - 10, br - 3, 255))

    # Luminous moon halo & seamless alpha-composited crescent moon
    mx, my = int(w * 0.30), int(h * 0.24)
    mglow = Image.new("RGB", (w, h), (0, 0, 0))
    dmg = ImageDraw.Draw(mglow)
    dmg.ellipse([mx - 240, my - 240, mx + 240, my + 240], fill=(28, 48, 86))
    dmg.ellipse([mx - 105, my - 105, mx + 105, my + 105], fill=(58, 84, 134))
    mglow = mglow.filter(ImageFilter.GaussianBlur(72))
    sky = Image.fromarray(np.clip(np.array(sky, dtype=np.int16) + np.array(mglow, dtype=np.int16), 0, 255).astype(np.uint8))

    moon_mask = Image.new("L", (w, h), 0)
    dmm = ImageDraw.Draw(moon_mask)
    dmm.ellipse([mx - 36, my - 36, mx + 36, my + 36], fill=255)
    dmm.ellipse([mx - 20, my - 42, mx + 50, my + 28], fill=0)
    moon_mask = moon_mask.filter(ImageFilter.GaussianBlur(1.0))
    sky.paste(Image.new("RGB", (w, h), (244, 248, 255)), (0, 0), moon_mask)
    draw = ImageDraw.Draw(sky)

    # Layered distant winter mountain ridges
    mtn1 = [(0, h)] + [
        (x, int(h * 0.62 - 58 * math.sin(x * 0.0024 + 0.5) - 28 * math.sin(x * 0.0065) - 12 * math.cos(x * 0.014)))
        for x in range(0, w + 12, 12)
    ] + [(w, h)]
    draw.polygon(mtn1, fill=(20, 32, 60))

    hill = [(0, h)] + [
        (x, int(h * 0.72 + 24 * math.sin(x * 0.0036 + 1.4) - 14 * math.cos(x * 0.009)))
        for x in range(0, w + 12, 12)
    ] + [(w, h)]
    draw.polygon(hill, fill=(62, 82, 116))

    # Realistic varied conifer forest with fine snow-laden pine needles/boughs
    def draw_organic_pine(dr_obj, bx, by, height_p, col_dark, col_snow):
        tiers = 11
        for tier in range(tiers):
            ft = tier / (tiers - 1)
            ty = by - int(height_p * (1.0 - ft * 0.93))
            half_w = int(height_p * (0.045 + 0.22 * (ft ** 0.88)) * rng.uniform(0.84, 1.16))
            droop = int(12 + 20 * ft)
            poly = [
                (bx, ty - 11),
                (bx - int(half_w * 0.55), ty + int(droop * 0.38)),
                (bx - half_w, ty + droop),
                (bx - int(half_w * 0.30), ty + int(droop * 0.80)),
                (bx + int(half_w * 0.30), ty + int(droop * 0.80)),
                (bx + half_w, ty + droop),
                (bx + int(half_w * 0.55), ty + int(droop * 0.38)),
            ]
            dr_obj.polygon(poly, fill=col_dark)
            if tier < tiers - 1:
                spoly = [
                    (bx, ty - 8),
                    (bx - int(half_w * 0.76), ty + int(droop * 0.48)),
                    (bx - int(half_w * 0.24), ty + int(droop * 0.22)),
                    (bx + int(half_w * 0.24), ty + int(droop * 0.22)),
                    (bx + int(half_w * 0.76), ty + int(droop * 0.48)),
                ]
                dr_obj.polygon(spoly, fill=col_snow)

    for tx in range(18, w - 18, 38):
        jx = tx + rng.randint(-14, 14)
        by = int(h * 0.74 + 20 * math.sin(jx * 0.0036 + 1.4))
        draw_organic_pine(draw, jx, by, rng.randint(85, 195), (12, 21, 42), (122, 146, 184))

    # Crisp dark-slate distant winter cottages with pitched snowy roofs, chimneys, and warm multi-pane windows!
    bokeh = Image.new("RGB", (w, h), (0, 0, 0))
    dbk = ImageDraw.Draw(bokeh)
    for hx in [310, 560, 810, 1140, 1430, 1710]:
        hy = int(h * 0.77 + 16 * math.sin(hx * 0.004))
        hw = rng.randint(68, 98)
        hh = rng.randint(36, 54)
        # Chimney
        draw.rectangle([hx + hw // 4, hy - hh - 32, hx + hw // 4 + 10, hy - hh - 6], fill=(22, 32, 54))
        # Cottage wall
        draw.rectangle([hx - hw // 2, hy - hh, hx + hw // 2, hy], fill=(16, 25, 46))
        # Pitched snowy gable roof
        draw.polygon([(hx - hw // 2 - 10, hy - hh + 2), (hx, hy - hh - 28), (hx + hw // 2 + 10, hy - hh + 2)], fill=(176, 196, 224))
        # Warm glowing multi-pane golden windows!
        for wx_off in (-hw // 4, hw // 5):
            wx = hx + wx_off
            wy = hy - int(hh * 0.50)
            draw.rectangle([wx - 8, wy - 9, wx + 8, wy + 9], fill=(255, 214, 132))
            draw.line([(wx, wy - 9), (wx, wy + 9)], fill=(30, 26, 24), width=2)
            draw.line([(wx - 8, wy), (wx + 8, wy)], fill=(30, 26, 24), width=2)
            dbk.ellipse([wx - 22, wy - 22, wx + 22, wy + 22], fill=(95, 58, 18))

    # Subtle realistic photographic depth-of-field (1.4 px instead of mushy 4.2 px!)
    sky = sky.filter(ImageFilter.GaussianBlur(1.4))
    bokeh = bokeh.filter(ImageFilter.GaussianBlur(12.0))
    sky = Image.fromarray(np.clip(np.array(sky, dtype=np.int16) + np.array(bokeh, dtype=np.int16), 0, 255).astype(np.uint8))

    # Foreground snow-covered yard softly sloping below window
    draw = ImageDraw.Draw(sky)
    yard = [(0, h)] + [(x, int(h * 0.84 + 16 * math.sin(x * 0.0045))) for x in range(0, w + 16, 16)] + [(w, h)]
    draw.polygon(yard, fill=(142, 166, 200))

    save_img(sky, "winter_night_backdrop.jpg", quality=92)


def main():
    generate_wood_textures()
    generate_textile_textures()
    generate_dreidel_and_gelt_textures()
    generate_food_and_ceramic_textures()
    generate_carved_silver_textures()
    # Preserve the photorealistic winter_night_backdrop.jpg if already installed
    if not os.path.exists(os.path.join(TEXTURES_DIR, "winter_night_backdrop.jpg")):
        generate_winter_night_backdrop()
    print("[tex] All procedural PBR textures generated successfully.")


if __name__ == "__main__":
    main()

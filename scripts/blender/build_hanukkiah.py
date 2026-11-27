"""Build a museum-grade, deeply carved & chased 925 sterling silver 9-branch Hanukkiah (Menorah) in Blender.

Craftsmanship upgrades (inspired by Hazorfim & 19th-century European/Yemenite heirloom sterling silver):
- Rich repousse & hand-chased floral acanthus/grapevine normal, roughness, and oxidized-crevice albedo maps
- Four sculpted baroque scrolled acanthus feet supporting an ornate 16-gadroon fluted domed pedestal
- Turned baroque baluster central stem with deeply carved urn knops, beaded collars, & sapphire enamel accents
- Unobstructed 3D interlaced Star of David filigree crown crest with cobalt enamel cabochon
- Eight symmetrical spiral-roped/fluted sterling silver branches rising to an exact equal horizontal height
- Double-tiered baroque filigree openwork scrollwork, leaf collars & granulation rosettes weaving between branches
- Sculpted floral petal bobeches (drip saucers) & chased tulip candle cups
- Distinctly raised central Shamash branch crowned with filigree volutes & beaded gallery
- Nine hand-dipped blue & ivory tapered Hanukkah candles with subtle melted tops & charred wicks
"""

import json
import math
import os
import sys
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import (
    MODELS_DIR,
    TEXTURES_DIR,
    reset_scene,
    set_smooth,
    make_pbr_material,
    create_lathe_mesh,
    create_tube_along_points,
    add_bead_ring,
    join_objects,
    export_glb,
    render_previews,
)


def bezier_cubic(p0, p1, p2, p3, steps=30):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1.0 - t
        p = (u**3) * p0 + 3 * (u**2) * t * p1 + 3 * u * (t**2) * p2 + (t**3) * p3
        pts.append(p)
    return pts


def create_uv_lathe(
    name,
    profile_rz,
    segments=64,
    cap_bottom=True,
    cap_top=True,
    flute_amp=0.0,
    flute_count=0,
    flute_z_range=None,
    uv_repeat_u=2.0,
    uv_repeat_v=1.0,
    mat=None,
):
    """Lathe mesh with clean continuous cylindrical UVs so chased silver normal/roughness/albedo maps wrap seamlessly."""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rings = []

    z_min = min(z for _, z in profile_rz)
    z_max = max(z for _, z in profile_rz)
    z_span = max(1e-5, z_max - z_min)

    for r, z in profile_rz:
        ring = []
        vt = ((z - z_min) / z_span) * uv_repeat_v
        for i in range(segments):
            ang = 2.0 * math.pi * i / segments
            rr = r
            if flute_count > 0 and flute_amp != 0.0:
                in_range = True
                if flute_z_range is not None:
                    z0, z1 = flute_z_range
                    if z < z0 or z > z1:
                        in_range = False
                    else:
                        t = (z - z0) / max(1e-6, (z1 - z0))
                        env = math.sin(math.pi * t)
                        rr += flute_amp * env * (0.5 + 0.5 * math.cos(flute_count * ang))
                if in_range and flute_z_range is None:
                    rr += flute_amp * (0.5 + 0.5 * math.cos(flute_count * ang))
            v = bm.verts.new((rr * math.cos(ang), rr * math.sin(ang), z))
            ring.append(v)
        rings.append((vt, ring))

    for j in range(len(rings) - 1):
        vt0, r0 = rings[j]
        vt1, r1 = rings[j + 1]
        for i in range(segments):
            inext = (i + 1) % segments
            f = bm.faces.new((r0[i], r0[inext], r1[inext], r1[i]))
            u0 = (i / segments) * uv_repeat_u
            u1 = ((i + 1) / segments) * uv_repeat_u
            for loop, uv in zip(f.loops, [(u0, vt0), (u1, vt0), (u1, vt1), (u0, vt1)]):
                loop[uv_layer].uv = uv

    if cap_bottom and profile_rz[0][0] > 1e-6:
        c = bm.verts.new((0.0, 0.0, profile_rz[0][1]))
        _, r0 = rings[0]
        for i in range(segments):
            inext = (i + 1) % segments
            f = bm.faces.new((c, r0[inext], r0[i]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.5)

    if cap_top and profile_rz[-1][0] > 1e-6:
        c = bm.verts.new((0.0, 0.0, profile_rz[-1][1]))
        _, rt = rings[-1]
        for i in range(segments):
            inext = (i + 1) % segments
            f = bm.faces.new((c, rt[i], rt[inext]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.5)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 42.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def create_carved_roped_branch(name, points, radii, radial_segs=24, rope_flutes=6, rope_twist=5.5, rope_amp=0.14, mat=None):
    """Build a sculpted spiral-roped & fluted sterling silver branch with continuous UVs for chased normal detail!"""
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    pts = [Vector(p) for p in points]
    n = len(pts)
    rings = []

    prev_normal = None
    for idx in range(n):
        u_along = idx / max(1, n - 1)
        if idx == 0:
            tangent = (pts[1] - pts[0]).normalized()
        elif idx == n - 1:
            tangent = (pts[-1] - pts[-2]).normalized()
        else:
            tangent = (pts[idx + 1] - pts[idx - 1]).normalized()

        if prev_normal is None:
            up = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((1, 0, 0))
            normal = tangent.cross(up).normalized()
        else:
            normal = prev_normal - tangent * prev_normal.dot(tangent)
            normal = normal.normalized() if normal.length > 1e-6 else tangent.cross(Vector((0, 1, 0))).normalized()
        binormal = tangent.cross(normal).normalized()
        prev_normal = normal

        r_base = radii[idx] if isinstance(radii, (list, tuple)) else radii
        # Fade rope relief smoothly at very start/end attachment collars
        env = math.sin(math.pi * min(1.0, max(0.0, u_along))) ** 0.45
        ring = []
        for s in range(radial_segs):
            ang = 2.0 * math.pi * s / radial_segs
            # Spiral carved cable/rope fluting along the entire branch!
            rope = 1.0 + rope_amp * env * math.cos(rope_flutes * ang + u_along * rope_twist * 2.0 * math.pi)
            r = r_base * rope
            offset = (normal * math.cos(ang) + binormal * (math.sin(ang) * 0.88)) * r
            ring.append(bm.verts.new(pts[idx] + offset))
        rings.append((u_along, ring))

    for j in range(n - 1):
        u0, r0 = rings[j]
        u1, r1 = rings[j + 1]
        for s in range(radial_segs):
            sn = (s + 1) % radial_segs
            f = bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))
            v0 = s / radial_segs
            v1 = (s + 1) / radial_segs
            for loop, uv in zip(f.loops, [(v0, u0 * 2.5), (v1, u0 * 2.5), (v1, u1 * 2.5), (v0, u1 * 2.5)]):
                loop[uv_layer].uv = uv

    bm.faces.new(list(reversed(rings[0][1])))
    bm.faces.new(rings[-1][1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 46.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def build_acanthus_foot(name, angle_rad, radius, mat_carved, mat_polished):
    """Build one sculpted baroque scrolled acanthus bracket foot beneath the pedestal base."""
    objs = []
    # Curved baroque scroll bracket resting flush at Z = 0.000
    c = math.cos(angle_rad)
    s = math.sin(angle_rad)

    def pt(r_dist, z_h):
        return Vector((r_dist * c, r_dist * s, z_h))

    pts = bezier_cubic(
        pt(radius - 0.010, 0.016),
        pt(radius + 0.011, 0.018),
        pt(radius + 0.014, 0.006),
        pt(radius + 0.005, 0.004),
        steps=14,
    )
    radii = [0.0068, 0.0062, 0.0058, 0.0055, 0.0052, 0.0050, 0.0048, 0.0048, 0.0052, 0.0056, 0.0058, 0.0054, 0.0048, 0.0040, 0.0038]
    foot = create_tube_along_points(name, pts, radii=radii, radial_segs=14, cap_ends=True, mat=mat_carved, aspect_y=1.4)
    objs.append(foot)

    # Claw/scroll paw pad resting cleanly on Z = 0.0
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.0052)
    for v in bm.verts:
        v.co.z = max(0.0, (v.co.z + 0.0052) * 0.55)
        v.co.x += (radius + 0.006) * c
        v.co.y += (radius + 0.006) * s
    m = bpy.data.meshes.new(name + "_Pad")
    bm.to_mesh(m)
    bm.free()
    pad = bpy.data.objects.new(name + "_Pad", m)
    bpy.context.collection.objects.link(pad)
    set_smooth(pad, 60.0)
    pad.data.materials.append(mat_polished)
    objs.append(pad)
    return objs


def build_bobeche_and_cup(prefix, cx, cy, base_z, mat_carved, mat_polished, mat_antique, mat_enamel, is_shamash=False):
    """Build a deeply carved floral scalloped bobeche (drip pan) and chased tulip candle cup."""
    scale = 1.14 if is_shamash else 1.0
    objs = []

    # Sculpted acanthus calyx + 12-petal scalloped bobeche dish with chased floral normal detail
    bobeche_profile = [
        (0.0045 * scale, 0.000),
        (0.0074 * scale, 0.004),
        (0.0056 * scale, 0.007),
        (0.0108 * scale, 0.011),
        (0.0168 * scale, 0.0155),
        (0.0196 * scale, 0.0200),
        (0.0188 * scale, 0.0216),
        (0.0145 * scale, 0.0180),
        (0.0088 * scale, 0.0150),
    ]
    bob = create_uv_lathe(
        f"{prefix}_Bobeche",
        bobeche_profile,
        segments=56,
        cap_bottom=True,
        cap_top=False,
        flute_amp=0.0018 * scale,
        flute_count=12,
        flute_z_range=(0.010, 0.022),
        uv_repeat_u=2.0,
        uv_repeat_v=0.45,
        mat=mat_carved,
    )
    bob.location = (cx, cy, base_z)
    objs.append(bob)

    # Double beaded silver pearl collars (under calyx AND around scalloped bobeche rim!)
    objs.append(add_bead_ring(f"{prefix}_BeadsLow", base_z + 0.0075, 0.0072 * scale, 0.0015 * scale, 16, mat_polished, (cx, cy)))
    objs.append(add_bead_ring(f"{prefix}_BeadsRim", base_z + 0.0205, 0.0192 * scale, 0.0012 * scale, 24, mat_polished, (cx, cy)))

    # Chased & gadrooned tulip candle cup (hollow interior)
    cup_z0 = base_z + 0.0150
    cup_h = 0.026 * scale
    cup_profile = [
        (0.0072 * scale, 0.000),
        (0.0104 * scale, 0.0055 * scale),
        (0.0108 * scale, 0.0125 * scale),
        (0.0094 * scale, 0.0195 * scale),
        (0.0120 * scale, cup_h - 0.0015),
        (0.0114 * scale, cup_h),
        (0.0094 * scale, cup_h),
        (0.0073 * scale, cup_h - 0.003),
        (0.0067 * scale, 0.004 * scale),
        (0.0005, 0.004 * scale),
    ]
    cup = create_uv_lathe(
        f"{prefix}_Cup",
        cup_profile,
        segments=48,
        cap_bottom=True,
        cap_top=False,
        flute_amp=0.00085 * scale,
        flute_count=12,
        flute_z_range=(0.002 * scale, 0.020 * scale),
        uv_repeat_u=1.5,
        uv_repeat_v=0.5,
        mat=mat_carved,
    )
    cup.location = (cx, cy, cup_z0)
    objs.append(cup)

    # Decorative waist molding ring on cup
    ring = create_uv_lathe(
        f"{prefix}_Ring",
        [(0.0096 * scale, 0.0110 * scale), (0.0112 * scale, 0.0124 * scale), (0.0096 * scale, 0.0138 * scale)],
        segments=36,
        cap_bottom=False,
        cap_top=False,
        mat=mat_enamel if is_shamash else mat_antique,
    )
    ring.location = (cx, cy, cup_z0)
    objs.append(ring)

    cup_rim_z = cup_z0 + cup_h
    candle_seat_z = cup_z0 + 0.0045 * scale
    return objs, cup_rim_z, candle_seat_z


def build_star_of_david_medallion(cx, cy, cz, radius, thickness, mat_polished, mat_carved, mat_enamel):
    """Build an ornate 3D interlaced Magen David crest framed by beaded filigree halo & cobalt sapphire gem."""
    objs = []
    for tri_idx, rot_offset in enumerate([math.pi / 2.0, -math.pi / 2.0]):
        verts_outer = []
        for k in range(3):
            a = rot_offset + k * 2.0 * math.pi / 3.0
            verts_outer.append(Vector((cx + radius * math.cos(a), cy + (0.0009 if tri_idx == 0 else -0.0009), cz + radius * math.sin(a))))
        for k in range(3):
            p0 = verts_outer[k]
            p1 = verts_outer[(k + 1) % 3]
            pts = [p0.lerp(p1, t / 6.0) for t in range(7)]
            objs.append(create_tube_along_points(f"StarBar_{tri_idx}_{k}", pts, radii=thickness, radial_segs=12, mat=mat_polished))

    # Double filigree halo ring with tiny granulation beads around circumference
    r_halo = radius * 1.14
    ring_pts = [Vector((cx + r_halo * math.cos(2 * math.pi * i / 48), cy, cz + r_halo * math.sin(2 * math.pi * i / 48))) for i in range(49)]
    objs.append(create_tube_along_points("StarHalo", ring_pts, radii=thickness * 0.92, radial_segs=12, cap_ends=False, mat=mat_carved))

    bm_b = bmesh.new()
    for i in range(24):
        a = 2 * math.pi * i / 24
        pos = Vector((cx + (r_halo + 0.0022) * math.cos(a), cy, cz + (r_halo + 0.0022) * math.sin(a)))
        bmesh.ops.create_uvsphere(bm_b, u_segments=8, v_segments=6, radius=0.0012, matrix=Matrix.Translation(pos))
    mb = bpy.data.meshes.new("StarHaloBeads")
    bm_b.to_mesh(mb)
    bm_b.free()
    bo = bpy.data.objects.new("StarHaloBeads", mb)
    bpy.context.collection.objects.link(bo)
    set_smooth(bo, 60.0)
    bo.data.materials.append(mat_polished)
    objs.append(bo)

    # Central royal-blue enamel cabochon jewel framed by silver bezel
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=radius * 0.28)
    for v in bm.verts:
        v.co.y = v.co.y * 0.45 + cy
        v.co.x += cx
        v.co.z += cz
    mesh = bpy.data.meshes.new("StarGem")
    bm.to_mesh(mesh)
    bm.free()
    gem = bpy.data.objects.new("StarGem", mesh)
    bpy.context.collection.objects.link(gem)
    set_smooth(gem, 60.0)
    gem.data.materials.append(mat_enamel)
    objs.append(gem)

    return objs


def build_filigree_scroll(name, p_start, p_ctrl1, p_ctrl2, p_end, r_start, r_end, mat_silver, curl_ball=True):
    pts = bezier_cubic(Vector(p_start), Vector(p_ctrl1), Vector(p_ctrl2), Vector(p_end), steps=22)
    radii = [r_start + (r_end - r_start) * (i / (len(pts) - 1)) for i in range(len(pts))]
    objs = [create_tube_along_points(name, pts, radii, radial_segs=12, cap_ends=True, mat=mat_silver)]
    if curl_ball:
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r_end * 1.75, matrix=Matrix.Translation(Vector(p_end)))
        m = bpy.data.meshes.new(name + "_Ball")
        bm.to_mesh(m)
        bm.free()
        bobj = bpy.data.objects.new(name + "_Ball", m)
        bpy.context.collection.objects.link(bobj)
        set_smooth(bobj, 60.0)
        bobj.data.materials.append(mat_silver)
        objs.append(bobj)
    return objs


def build_rosette_flower(name, center, radius, mat_silver):
    """Small sculpted 6-petal sterling silver filigree rosette ornament."""
    bm = bmesh.new()
    c = Vector(center)
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=radius * 0.45, matrix=Matrix.Translation(c))
    for k in range(6):
        a = k * math.pi / 3.0
        p = c + Vector((radius * 0.72 * math.cos(a), 0.0, radius * 0.72 * math.sin(a)))
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=radius * 0.36, matrix=Matrix.Translation(p))
    m = bpy.data.meshes.new(name)
    bm.to_mesh(m)
    bm.free()
    obj = bpy.data.objects.new(name, m)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 60.0)
    obj.data.materials.append(mat_silver)
    return obj


def build_candle(name, cx, cy, seat_z, height, radius, wax_mat, wick_mat, spiral_twist=True):
    """Build a tapered Hanukkah candle with hand-twisted flutes, concave melted top, wax drip streaks, and charred wick."""
    segs = 32
    rings_n = 28
    bm = bmesh.new()
    rings = []

    for j in range(rings_n + 1):
        t = j / rings_n
        z = seat_z + t * height
        r_base = radius * (1.0 - 0.14 * t)
        if t > 0.94:
            top_u = (t - 0.94) / 0.06
            r_base *= (1.0 - 0.12 * (top_u ** 2))
        ring = []
        for i in range(segs):
            ang = 2.0 * math.pi * i / segs
            rr = r_base
            if spiral_twist and 0.05 < t < 0.95:
                twist = math.sin(6.0 * ang + t * 14.0)
                rr += 0.00028 * twist * math.sin(math.pi * t)
            ring.append(bm.verts.new((cx + rr * math.cos(ang), cy + rr * math.sin(ang), z)))
        rings.append(ring)

    dish_ring = []
    r_inner = radius * 0.42
    z_dish = seat_z + height - 0.0024
    for i in range(segs):
        ang = 2.0 * math.pi * i / segs
        dish_ring.append(bm.verts.new((cx + r_inner * math.cos(ang), cy + r_inner * math.sin(ang), z_dish)))
    rings.append(dish_ring)

    for j in range(len(rings) - 1):
        r0 = rings[j]
        r1 = rings[j + 1]
        for i in range(segs):
            inext = (i + 1) % segs
            bm.faces.new((r0[i], r0[inext], r1[inext], r1[i]))

    c_bot = bm.verts.new((cx, cy, seat_z))
    for i in range(segs):
        inext = (i + 1) % segs
        bm.faces.new((c_bot, rings[0][inext], rings[0][i]))

    c_top = bm.verts.new((cx, cy, z_dish - 0.0006))
    for i in range(segs):
        inext = (i + 1) % segs
        bm.faces.new((c_top, dish_ring[i], dish_ring[inext]))

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    candle_obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(candle_obj)
    set_smooth(candle_obj, 50.0)
    candle_obj.data.materials.append(wax_mat)

    wick_base = Vector((cx, cy, z_dish - 0.0005))
    wick_pts = [
        wick_base,
        wick_base + Vector((0.0, 0.0, 0.0048)),
        wick_base + Vector((0.0007, -0.0004, 0.0095)),
        wick_base + Vector((0.0014, -0.0008, 0.0120)),
    ]
    wick_obj = create_tube_along_points(
        name.replace("Candle_", "Wick_"),
        wick_pts,
        radii=[0.00075, 0.00065, 0.00055, 0.00042],
        radial_segs=8,
        cap_ends=True,
        mat=wick_mat,
    )
    return candle_obj, wick_obj, wick_pts[-1]


def main():
    reset_scene()

    # Materials:
    # 1. Deeply Carved/Chased 925 Sterling Silver (with floral acanthus normal, oxidized crevices, & variable polish roughness!)
    mat_silver_carved = make_pbr_material(
        "SterlingSilverCarved925",
        base_color=(0.94, 0.945, 0.96, 1.0),
        metallic=0.99,
        roughness=0.18,
        coat=0.18,
        coat_roughness=0.08,
        color_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_albedo.jpg"),
        rough_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_normal.png"),
        bump_strength=1.15,
    )
    # 2. Mirror-Polished Sterling Silver highlights (beads, filigree scrolls, Star of David bars)
    mat_silver_polished = make_pbr_material(
        "SterlingSilverPolished",
        base_color=(0.96, 0.965, 0.98, 1.0),
        metallic=0.99,
        roughness=0.11,
        coat=0.20,
        coat_roughness=0.06,
    )
    # 3. Dark Oxidized Antique Silver crevices & accent collars
    mat_antique = make_pbr_material(
        "AntiqueOxidizedSilver",
        base_color=(0.36, 0.38, 0.43, 1.0),
        metallic=0.94,
        roughness=0.38,
    )
    # 4. Deep Royal Cobalt Enamel accents
    mat_enamel = make_pbr_material(
        "CobaltBlueEnamel",
        base_color=(0.03, 0.11, 0.46, 1.0),
        metallic=0.15,
        roughness=0.11,
        coat=0.88,
        coat_roughness=0.04,
    )
    mat_wick = make_pbr_material("CharredWick", base_color=(0.05, 0.045, 0.04, 1.0), roughness=0.92)

    # Rich saturated traditional blue & ivory wax candle palette
    candle_colors = [
        ("Wax_RoyalBlue", (0.06, 0.18, 0.56, 1.0)),
        ("Wax_Ivory", (0.94, 0.91, 0.84, 1.0)),
        ("Wax_AzureBlue", (0.14, 0.38, 0.78, 1.0)),
        ("Wax_PearlWhite", (0.91, 0.93, 0.96, 1.0)),
        ("Wax_DeepCobalt", (0.05, 0.14, 0.44, 1.0)),
        ("Wax_SkyBlue", (0.24, 0.50, 0.84, 1.0)),
        ("Wax_Cream", (0.95, 0.92, 0.86, 1.0)),
        ("Wax_Sapphire", (0.09, 0.26, 0.68, 1.0)),
    ]
    candle_mats = [
        make_pbr_material(cname, base_color=col, metallic=0.0, roughness=0.36, specular=0.45, coat=0.14, coat_roughness=0.28)
        for cname, col in candle_colors
    ]
    mat_shamash_wax = make_pbr_material("Wax_Shamash", base_color=(0.97, 0.95, 0.89, 1.0), roughness=0.34, coat=0.15)

    metal_parts = []

    # 1. ORNATE CARVED & GADROONED DOMED PEDESTAL BASE ON 4 BAROQUE ACANTHUS FEET (Z = 0.000 .. 0.082)
    z_lift = 0.007  # subtle lift onto 4 sculpted baroque bracket feet!
    base_profile = [
        (0.075, z_lift + 0.000),
        (0.078, z_lift + 0.003),
        (0.074, z_lift + 0.007),
        (0.071, z_lift + 0.012),
        (0.068, z_lift + 0.018),
        (0.062, z_lift + 0.026),
        (0.052, z_lift + 0.034),
        (0.043, z_lift + 0.040),
        (0.046, z_lift + 0.044),
        (0.039, z_lift + 0.048),
        (0.031, z_lift + 0.054),
        (0.023, z_lift + 0.062),
        (0.019, z_lift + 0.068),
        (0.025, z_lift + 0.072),
        (0.016, z_lift + 0.078),
    ]
    pedestal = create_uv_lathe(
        "PedestalBase",
        base_profile,
        segments=72,
        cap_bottom=True,
        cap_top=True,
        flute_amp=0.0032,
        flute_count=16,
        flute_z_range=(z_lift + 0.010, z_lift + 0.039),
        uv_repeat_u=3.0,
        uv_repeat_v=1.0,
        mat=mat_silver_carved,
    )
    metal_parts.append(pedestal)

    # 4 sculpted baroque scrolled acanthus feet at 45°, 135°, 225°, 315° resting flush on Z = 0.000!
    for f_idx in range(4):
        ang = math.pi / 4.0 + f_idx * (math.pi / 2.0)
        metal_parts.extend(build_acanthus_foot(f"PedestalFoot_{f_idx}", ang, 0.073, mat_silver_carved, mat_silver_polished))

    # Triple beaded pearl trims + antique shadow moldings on pedestal
    metal_parts.append(add_bead_ring("BaseBeadsLower", z_lift + 0.006, 0.0765, 0.0022, 48, mat_silver_polished))
    metal_parts.append(add_bead_ring("BaseBeadsMid", z_lift + 0.044, 0.0465, 0.0019, 34, mat_silver_polished))
    metal_parts.append(add_bead_ring("BaseBeadsCollar", z_lift + 0.072, 0.0255, 0.0018, 22, mat_silver_polished))

    # Carved oxidized silver recessed band + sapphire enamel jewel collar
    metal_parts.append(
        create_uv_lathe(
            "BaseAntiqueChannel",
            [(0.070, z_lift + 0.008), (0.073, z_lift + 0.010), (0.070, z_lift + 0.012)],
            segments=56,
            cap_bottom=False,
            cap_top=False,
            mat=mat_antique,
        )
    )
    metal_parts.append(
        create_uv_lathe(
            "BaseEnamelBand",
            [(0.0395, z_lift + 0.0462), (0.0414, z_lift + 0.0478), (0.0372, z_lift + 0.0496)],
            segments=56,
            cap_bottom=False,
            cap_top=False,
            mat=mat_enamel,
        )
    )

    # 2. DEEPLY CARVED BAROQUE BALUSTER CENTRAL STEM (Z = 0.080 .. 0.290)
    stem_profile = [
        (0.0160, 0.080),
        (0.0122, 0.088),
        (0.0165, 0.096),
        (0.0255, 0.108),  # deeply fluted baroque urn knop
        (0.0268, 0.118),
        (0.0218, 0.130),
        (0.0132, 0.140),
        (0.0168, 0.146),  # carved collar
        (0.0115, 0.152),
        (0.0108, 0.172),  # central shaft where branches emerge
        (0.0155, 0.181),
        (0.0185, 0.191),  # upper chased knop
        (0.0132, 0.201),
        (0.0088, 0.211),
        (0.0078, 0.252),  # slender spire behind Star of David
        (0.0135, 0.262),
        (0.0165, 0.272),  # crown capital under shamash
        (0.0105, 0.282),
        (0.0068, 0.290),
    ]
    stem = create_uv_lathe(
        "CentralStem",
        stem_profile,
        segments=56,
        cap_bottom=True,
        cap_top=True,
        flute_amp=0.0022,
        flute_count=12,
        flute_z_range=(0.096, 0.136),
        uv_repeat_u=2.0,
        uv_repeat_v=2.0,
        mat=mat_silver_carved,
    )
    metal_parts.append(stem)

    # Upper knop secondary gadrooning ring & beaded collars
    metal_parts.append(add_bead_ring("StemBeads1", 0.146, 0.0174, 0.0016, 20, mat_silver_polished))
    metal_parts.append(add_bead_ring("StemBeads2", 0.191, 0.0192, 0.0016, 20, mat_silver_polished))
    metal_parts.append(add_bead_ring("StemBeadsCrown", 0.272, 0.0172, 0.0016, 20, mat_silver_polished))

    metal_parts.append(
        create_uv_lathe(
            "StemEnamelBand",
            [(0.0115, 0.2015), (0.0128, 0.2040), (0.0098, 0.2070)],
            segments=40,
            cap_bottom=False,
            cap_top=False,
            mat=mat_enamel,
        )
    )

    # 3. ORNATE 3D STAR OF DAVID MEDALLION CREST mounted proud in front of stem (Z = 0.234)
    metal_parts.extend(
        build_star_of_david_medallion(
            cx=0.0,
            cy=-0.0125,
            cz=0.234,
            radius=0.0235,
            thickness=0.0019,
            mat_polished=mat_silver_polished,
            mat_carved=mat_silver_carved,
            mat_enamel=mat_enamel,
        )
    )

    # 4. EIGHT SYMMETRICAL SPIRAL-ROPED & CARVED BRANCHES + DOUBLE-TIER FILIGREE TRACERY
    branch_x_abs = [0.038, 0.078, 0.118, 0.158]  # inner to outer
    stem_attach_z = [0.176, 0.156, 0.136, 0.116]
    bobeche_base_z = 0.230  # exact equal halachic height for all 8 branches!

    candle_seats = {}

    for side_sign in (1.0, -1.0):
        for rank in range(4):
            x_end = side_sign * branch_x_abs[rank]
            z_start = stem_attach_z[rank]
            night_idx = (4 - rank) if side_sign > 0 else (5 + rank)

            p0 = Vector((side_sign * 0.010, 0.0, z_start))
            p1 = Vector((x_end * 0.58, 0.0, z_start - 0.011 - 0.004 * rank))
            p2 = Vector((x_end * 1.03, 0.0, z_start + 0.025 + 0.012 * rank))
            p3 = Vector((x_end, 0.0, bobeche_base_z + 0.002))

            pts = bezier_cubic(p0, p1, p2, p3, steps=32)
            radii = [
                0.0052 * (1.0 - 0.24 * (i / (len(pts) - 1))) + 0.0009 * math.exp(-((i / (len(pts) - 1) - 0.48) / 0.16) ** 2)
                for i in range(len(pts))
            ]

            # Spiral-roped & chased sterling silver branch (NEVER plain smooth wire!)
            br_obj = create_carved_roped_branch(
                f"Branch_{night_idx}",
                pts,
                radii,
                radial_segs=22,
                rope_flutes=6,
                rope_twist=5.0 + rank * 1.2,
                rope_amp=0.14,
                mat=mat_silver_carved,
            )
            metal_parts.append(br_obj)

            # Carved floral collar rosette & beaded cuff mid-branch!
            mid_pt = pts[16]
            metal_parts.append(build_rosette_flower(f"BranchRosette_{night_idx}", mid_pt + Vector((0, -0.0038, 0)), 0.0058, mat_silver_polished))
            bm_k = bmesh.new()
            bmesh.ops.create_uvsphere(bm_k, u_segments=14, v_segments=10, radius=0.0064, matrix=Matrix.Translation(mid_pt))
            mk = bpy.data.meshes.new(f"BranchKnop_{night_idx}")
            bm_k.to_mesh(mk)
            bm_k.free()
            kobj = bpy.data.objects.new(f"BranchKnop_{night_idx}", mk)
            bpy.context.collection.objects.link(kobj)
            set_smooth(kobj, 60.0)
            kobj.data.materials.append(mat_silver_carved)
            metal_parts.append(kobj)

            # Rich Yemenite/European filigree S-scrolls & curling tendrils bridging between branches!
            if rank >= 1:
                elbow = pts[12]
                # Lower hanging baroque arabesque scroll
                metal_parts.extend(
                    build_filigree_scroll(
                        f"FiligreeLower_{night_idx}",
                        elbow + Vector((-side_sign * 0.002, 0.0, -0.002)),
                        elbow + Vector((-side_sign * 0.030, 0.0, -0.008)),
                        elbow + Vector((-side_sign * 0.026, 0.0, -0.038)),
                        elbow + Vector((-side_sign * 0.006, 0.0, -0.026)),
                        0.0025,
                        0.0014,
                        mat_silver_polished,
                    )
                )
                # Upper openwork filigree scroll nesting cleanly inside the crook between branches!
                inner_pt = pts[20]
                metal_parts.extend(
                    build_filigree_scroll(
                        f"FiligreeUpper_{night_idx}",
                        inner_pt + Vector((-side_sign * 0.003, 0.0, 0.002)),
                        inner_pt + Vector((-side_sign * 0.026, 0.0, 0.012)),
                        inner_pt + Vector((-side_sign * 0.030, 0.0, -0.014)),
                        inner_pt + Vector((-side_sign * 0.014, 0.0, -0.010)),
                        0.0022,
                        0.0013,
                        mat_silver_polished,
                    )
                )

            # Ornate crown S-filigree embracing the Star of David crest
            if rank == 0:
                metal_parts.extend(
                    build_filigree_scroll(
                        f"CrestVolute_{night_idx}",
                        (side_sign * 0.011, 0.0, 0.200),
                        (side_sign * 0.036, 0.0, 0.204),
                        (side_sign * 0.040, 0.0, 0.238),
                        (side_sign * 0.028, 0.0, 0.242),
                        0.0022,
                        0.0014,
                        mat_silver_polished,
                    )
                )

            # Carved Bobeche & Chased Tulip Candle Cup
            b_objs, cup_rim_z, seat_z = build_bobeche_and_cup(
                f"Cup_{night_idx}", x_end, 0.0, bobeche_base_z, mat_silver_carved, mat_silver_polished, mat_antique, mat_enamel, is_shamash=False
            )
            metal_parts.extend(b_objs)
            candle_seats[night_idx] = (x_end, 0.0, seat_z)

    # 5. RAISED CENTRAL SHAMASH WITH CROWN FILIGREE VOLUTES
    shamash_y = -0.014
    shamash_bobeche_z = 0.292
    shamash_neck_pts = bezier_cubic(
        Vector((0.0, 0.0, 0.278)),
        Vector((0.0, -0.005, 0.283)),
        Vector((0.0, shamash_y, 0.286)),
        Vector((0.0, shamash_y, shamash_bobeche_z + 0.003)),
        steps=14,
    )
    metal_parts.append(
        create_carved_roped_branch("ShamashArm", shamash_neck_pts, [0.0072 - 0.0014 * (i / 14) for i in range(15)], radial_segs=20, rope_flutes=6, rope_twist=2.0, mat=mat_silver_carved)
    )

    for sgn in (-1.0, 1.0):
        metal_parts.extend(
            build_filigree_scroll(
                f"ShamashVolute_{'R' if sgn > 0 else 'L'}",
                (sgn * 0.008, -0.002, 0.272),
                (sgn * 0.030, -0.006, 0.274),
                (sgn * 0.032, -0.010, 0.296),
                (sgn * 0.020, -0.012, 0.294),
                0.0023,
                0.0014,
                mat_silver_polished,
            )
        )

    sh_objs, sh_rim_z, sh_seat_z = build_bobeche_and_cup(
        "Cup_Shamash", 0.0, shamash_y, shamash_bobeche_z, mat_silver_carved, mat_silver_polished, mat_antique, mat_enamel, is_shamash=True
    )
    metal_parts.extend(sh_objs)

    join_objects(metal_parts, "Hanukkiah_Body")

    # 6. NINE HAND-DIPPED TAPERED HANUKKAH CANDLES + WICKS
    meta = {
        "convention": "Three.js right-handed Y-up coordinates relative to hanukkiah origin (base center on table).",
        "shamash": None,
        "candles": [],
    }

    def to_three(vec_b):
        return [round(float(vec_b.x), 5), round(float(vec_b.z), 5), round(float(-vec_b.y), 5)]

    sh_c, sh_w, sh_tip = build_candle(
        "Candle_Shamash", 0.0, shamash_y, sh_seat_z, height=0.104, radius=0.0058, wax_mat=mat_shamash_wax, wick_mat=mat_wick, spiral_twist=True
    )
    meta["shamash"] = {
        "candleMesh": "Candle_Shamash",
        "wickMesh": "Wick_Shamash",
        "wickTip": to_three(sh_tip),
        "cupCenter": to_three(Vector((0.0, shamash_y, sh_rim_z))),
    }

    height_jitter = [0.095, 0.093, 0.096, 0.094, 0.095, 0.092, 0.096, 0.094]
    for night_idx in range(1, 9):
        cx, cy, seat_z = candle_seats[night_idx]
        c_obj, w_obj, tip = build_candle(
            f"Candle_{night_idx}",
            cx,
            cy,
            seat_z,
            height=height_jitter[night_idx - 1],
            radius=0.0054,
            wax_mat=candle_mats[night_idx - 1],
            wick_mat=mat_wick,
            spiral_twist=True,
        )
        meta["candles"].append(
            {
                "night": night_idx,
                "candleMesh": f"Candle_{night_idx}",
                "wickMesh": f"Wick_{night_idx}",
                "wickTip": to_three(tip),
                "cupCenter": to_three(Vector((cx, cy, bobeche_base_z + 0.041))),
            }
        )

    export_glb(os.path.join(MODELS_DIR, "hanukkiah.glb"))

    meta_path = os.path.join(MODELS_DIR, "hanukkiah_meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"[hanukkiah] wrote metadata {meta_path}")

    render_previews(
        "hanukkiah_carved",
        views=[
            ("front", (0.0, -0.72, 0.24), 52.0),
            ("three_quarter", (0.48, -0.56, 0.34), 50.0),
            ("detail_carving", (0.10, -0.30, 0.22), 62.0),
            ("detail_base", (0.14, -0.26, 0.10), 60.0),
        ],
        target=(0.0, 0.0, 0.19),
        res=(800, 640),
        samples=40,
    )


if __name__ == "__main__":
    main()

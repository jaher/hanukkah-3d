"""Build an ornate, museum-grade carved antique-gold baroque framed portrait of the Lubavitcher Rebbe
(Rabbi Menachem Mendel Schneerson) in headless Blender.

Features:
- Multi-stepped mitered baroque gilded wood-and-gold frame with chased floral normal relief & antique patina
- Sculpted ornamental corner rosette cartouches & inner beaded pearl liner
- Warm archival cream museum mat board (passe-partout) with beveled 3:4 portrait aperture
- Crisp UV-mapped portrait canvas (assets/textures/rebbe_portrait.jpg)
- Thin subtle protective gallery glass pane
- Back sits flush at Y = 0 facing -Y (Three.js +Z toward the room).
"""

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
    join_objects,
    export_glb,
    render_previews,
)


def create_mitered_frame(name, inner_w, inner_h, profile_dy_dz, mat):
    """Sweep a 2D molding profile [(outward_offset, front_depth), ...] around a rectangle
    of aperture (inner_w x inner_h) in the XZ plane, projecting toward -Y (front in Blender -> +Z Three.js).
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    hw = inner_w * 0.5
    hh = inner_h * 0.5
    # 4 corner directions in XZ: BL(-,-), BR(+,-), TR(+,+), TL(-,+)
    signs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    rings = []

    for p_idx, (out_d, front_d) in enumerate(profile_dy_dz):
        ring = []
        for sx, sz in signs:
            x = sx * (hw + out_d)
            z = sz * (hh + out_d)
            y = -front_d  # front faces -Y
            ring.append(bm.verts.new((x, y, z)))
        rings.append((p_idx, ring))

    n_prof = len(rings)
    for j in range(n_prof):
        jn = (j + 1) % n_prof
        r0 = rings[j][1]
        r1 = rings[jn][1]
        v0 = j / float(n_prof)
        v1 = (j + 1) / float(n_prof)
        for c in range(4):
            cn = (c + 1) % 4
            f = bm.faces.new((r0[c], r0[cn], r1[cn], r1[c]))
            for loop, uv in zip(f.loops, [(0.0, v0), (2.2, v0), (2.2, v1), (0.0, v1)]):
                loop[uv_layer].uv = uv

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 36.0)
    obj.data.materials.append(mat)
    return obj


def add_frame_beads(name, hw, hh, front_y, bead_r, mat):
    """Add delicate gilded pearl beading running neatly along all 4 sides of the inner frame lip."""
    bm = bmesh.new()
    spacing = bead_r * 2.5
    nx = max(4, int((2 * hw) / spacing))
    nz = max(4, int((2 * hh) / spacing))

    for i in range(nx + 1):
        x = -hw + (2 * hw) * (i / nx)
        for z in (-hh, hh):
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=bead_r, matrix=Matrix.Translation((x, -front_y, z)))
    for j in range(1, nz):
        z = -hh + (2 * hh) * (j / nz)
        for x in (-hw, hw):
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=bead_r, matrix=Matrix.Translation((x, -front_y, z)))

    m = bpy.data.meshes.new(name)
    bm.to_mesh(m)
    bm.free()
    obj = bpy.data.objects.new(name, m)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 60.0)
    obj.data.materials.append(mat)
    return obj


def add_corner_ornaments(name, cx_abs, cz_abs, front_y, mat):
    """Sculpt baroque floral rosette medallions on all 4 corners of the gilded frame."""
    bm = bmesh.new()
    for sx in (-1, 1):
        for sz in (-1, 1):
            c = Vector((sx * cx_abs, -front_y, sz * cz_abs))
            # Central cabochon rosette + 8 carved radiating petals
            bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.0095, matrix=Matrix.Translation(c))
            for k in range(8):
                a = k * (math.pi / 4.0)
                p = c + Vector((0.0155 * math.cos(a), 0.0025, 0.0155 * math.sin(a)))
                bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.0062, matrix=Matrix.Translation(p))
    m = bpy.data.meshes.new(name)
    bm.to_mesh(m)
    bm.free()
    obj = bpy.data.objects.new(name, m)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 60.0)
    obj.data.materials.append(mat)
    return obj


def make_flat_rect(name, w, h, front_y, mat, uv_flip_x=False):
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    hw, hh = w * 0.5, h * 0.5
    v0 = bm.verts.new((-hw, -front_y, -hh))
    v1 = bm.verts.new((hw, -front_y, -hh))
    v2 = bm.verts.new((hw, -front_y, hh))
    v3 = bm.verts.new((-hw, -front_y, hh))
    f = bm.faces.new((v0, v1, v2, v3))
    uvs = [(1, 0), (0, 0), (0, 1), (1, 1)] if uv_flip_x else [(0, 0), (1, 0), (1, 1), (0, 1)]
    for loop, uv in zip(f.loops, uvs):
        loop[uv_layer].uv = uv
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    m = bpy.data.meshes.new(name)
    bm.to_mesh(m)
    bm.free()
    obj = bpy.data.objects.new(name, m)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def main():
    reset_scene()

    portrait_tex = os.path.join(TEXTURES_DIR, "rebbe_portrait.jpg")
    if not os.path.exists(portrait_tex):
        raise FileNotFoundError(f"Missing portrait texture: {portrait_tex}")

    # Materials: Heirloom Antique Baroque Gold Leaf (with chased floral relief!), Polished Gold Beads, Cream Museum Mat, Portrait, Glass
    mat_gold_carved = make_pbr_material(
        "BaroqueGoldCarved",
        base_color=(0.86, 0.67, 0.28, 1.0),
        metallic=0.92,
        roughness=0.26,
        coat=0.18,
        rough_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_normal.png"),
        bump_strength=1.10,
    )
    mat_gold_polished = make_pbr_material(
        "BaroqueGoldPolished",
        base_color=(0.94, 0.76, 0.34, 1.0),
        metallic=0.96,
        roughness=0.16,
    )
    mat_dark_wood = make_pbr_material(
        "FrameBackWalnut",
        base_color=(0.12, 0.07, 0.04, 1.0),
        metallic=0.0,
        roughness=0.65,
    )
    mat_matboard = make_pbr_material(
        "MuseumCreamMat",
        base_color=(0.94, 0.91, 0.85, 1.0),
        metallic=0.0,
        roughness=0.86,
    )
    mat_portrait = make_pbr_material(
        "RebbePortraitCanvas",
        metallic=0.0,
        roughness=0.58,
        specular=0.25,
        color_tex_path=portrait_tex,
    )
    mat_glass = make_pbr_material(
        "PortraitMuseumGlass",
        base_color=(0.95, 0.97, 1.0, 1.0),
        metallic=0.05,
        roughness=0.05,
        alpha=0.07,
    )

    parts = []

    # Aperture dimensions:
    # Inner portrait visible area: 0.285 m wide x 0.380 m tall (exact 3:4 aspect ratio!)
    # Cream archival museum mat border: +0.036 m all around -> inner frame opening 0.357 m x 0.452 m
    # Ornate carved gold baroque frame molding width: +0.058 m -> outer dimensions ~0.473 m x 0.568 m!
    art_w, art_h = 0.285, 0.380
    mat_w, mat_h = 0.358, 0.453

    # 1. Carved Baroque Gold Outer Molding Frame (swept with classical ogee + stepped filigree crest!)
    frame_prof = [
        (0.000, 0.018),  # inner rabbet meeting mat
        (0.008, 0.024),  # inner gold fillet step
        (0.014, 0.022),
        (0.022, 0.034),  # raised carved baroque ogee crest
        (0.036, 0.040),  # high carved floral crown
        (0.048, 0.035),
        (0.055, 0.025),  # outer stepped bevel
        (0.058, 0.018),
        (0.058, 0.000),  # flush back against room wall (Y = 0)
        (0.000, 0.000),
    ]
    parts.append(create_mitered_frame("OrnateGoldFrame", mat_w, mat_h, frame_prof, mat_gold_carved))

    # 2. Inner Polished Gold Fillet Lip framing the portrait inside the cream mat!
    fillet_prof = [
        (0.000, 0.014),
        (0.005, 0.019),
        (0.008, 0.017),
        (0.008, 0.012),
        (0.000, 0.012),
    ]
    parts.append(create_mitered_frame("InnerGoldFillet", art_w, art_h, fillet_prof, mat_gold_polished))

    # 3. Delicate Gilded Pearl Beading along inner frame lip & outer crest!
    parts.append(add_frame_beads("FrameInnerBeads", mat_w * 0.5 + 0.008, mat_h * 0.5 + 0.008, 0.0255, 0.0024, mat_gold_polished))
    parts.append(add_corner_ornaments("FrameCornerRosettes", mat_w * 0.5 + 0.034, mat_h * 0.5 + 0.034, 0.042, mat_gold_polished))

    # 4. Archival Cream Museum Mat Board (passe-partout) surrounding the 3:4 portrait aperture
    mat_prof = [
        (0.000, 0.013),
        (0.004, 0.0175),  # 45-degree beveled inner mat cut!
        ((mat_w - art_w) * 0.5 + 0.004, 0.0175),
        ((mat_w - art_w) * 0.5 + 0.004, 0.010),
        (0.000, 0.010),
    ]
    parts.append(create_mitered_frame("MuseumMatBoard", art_w, art_h, mat_prof, mat_matboard))

    # 5. Solid Dark Backing Board (Y = 0.001) + Portrait Canvas (Y = -0.0125)
    parts.append(make_flat_rect("FrameBacking", mat_w + 0.06, mat_h + 0.06, 0.002, mat_dark_wood))
    parts.append(make_flat_rect("RebbePortraitArt", art_w + 0.004, art_h + 0.004, 0.0128, mat_portrait))

    join_objects(parts, "Rebbe_Portrait_Framed")

    # Separate thin subtle gallery glass pane so Three.js gives it clean transparent reflection without blocking art
    make_flat_rect("Portrait_Glass", mat_w + 0.004, mat_h + 0.004, 0.0215, mat_glass)

    export_glb(os.path.join(MODELS_DIR, "rebbe_portrait.glb"))

    render_previews(
        "rebbe_portrait",
        views=[
            ("front", (0.0, -0.95, 0.0), 50.0),
            ("three_quarter", (0.45, -0.82, 0.12), 50.0),
        ],
        target=(0.0, 0.0, 0.0),
        res=(640, 800),
        samples=36,
    )


if __name__ == "__main__":
    main()

"""Build heirloom large decorative dreidel, playable dreidels (with Nun, Gimel, Hey, Shin), and chocolate gelt + pouch."""

import math
import os
import random
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


def create_dreidel_body_with_uvs(name, half_w, z_bot, z_top, mat_faces, mat_frame=None, bevel_w=0.0025):
    """Create a 4-sided dreidel body whose 4 vertical faces map cleanly to the 2x2 Hebrew letter atlas:
    Front (-Y) = NUN (TL), Right (+X) = GIMEL (TR), Back (+Y) = HEY (BL), Left (-X) = SHIN (BR).
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    # 8 corners of box
    hw = half_w
    v000 = bm.verts.new((-hw, -hw, z_bot))
    v100 = bm.verts.new((hw, -hw, z_bot))
    v110 = bm.verts.new((hw, hw, z_bot))
    v010 = bm.verts.new((-hw, hw, z_bot))

    v001 = bm.verts.new((-hw, -hw, z_top))
    v101 = bm.verts.new((hw, -hw, z_top))
    v111 = bm.verts.new((hw, hw, z_top))
    v011 = bm.verts.new((-hw, hw, z_top))

    # 4 side faces (counter-clockwise outward normal) + UV cell in 2x2 atlas
    # Pillow Y=0 is top -> Blender V=1 is top!
    # TL (NUN): u in [0, 0.5], v in [0.5, 1.0]
    # TR (GIMEL): u in [0.5, 1.0], v in [0.5, 1.0]
    # BL (HEY): u in [0, 0.5], v in [0.0, 0.5]
    # BR (SHIN): u in [0.5, 1.0], v in [0.0, 0.5]
    side_specs = [
        ((v000, v100, v101, v001), (0.02, 0.52, 0.48, 0.98)),  # Front (-Y): NUN
        ((v100, v110, v111, v101), (0.52, 0.52, 0.98, 0.98)),  # Right (+X): GIMEL
        ((v110, v010, v011, v111), (0.02, 0.02, 0.48, 0.48)),  # Back (+Y): HEY
        ((v010, v000, v001, v011), (0.52, 0.02, 0.98, 0.48)),  # Left (-X): SHIN
    ]
    for verts, (u0, v0, u1, v1) in side_specs:
        f = bm.faces.new(verts)
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        for loop, uv in zip(f.loops, uvs):
            loop[uv_layer].uv = uv
        f.material_index = 0

    # Top and bottom caps (use frame material if provided)
    f_top = bm.faces.new((v001, v101, v111, v011))
    f_bot = bm.faces.new((v010, v110, v100, v000))
    for f in (f_top, f_bot):
        for loop in f.loops:
            loop[uv_layer].uv = (0.05, 0.95)
        f.material_index = 1 if mat_frame else 0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat_faces)
    if mat_frame:
        obj.data.materials.append(mat_frame)
    set_smooth(obj, 30.0)
    return obj


def build_large_heirloom_dreidel():
    """Ornate 18 cm heirloom sterling-silver & royal-blue enamel dreidel on a footed silver stand."""
    reset_scene()

    mat_silver = make_pbr_material(
        "HeirloomSilver",
        base_color=(0.94, 0.95, 0.97, 1.0),
        metallic=0.98,
        roughness=0.14,
        coat=0.15,
    )
    mat_enamel = make_pbr_material(
        "HeirloomCobalt",
        base_color=(0.04, 0.14, 0.50, 1.0),
        metallic=0.18,
        roughness=0.14,
        coat=0.80,
    )
    mat_faces = make_pbr_material(
        "HeirloomDreidelFaces",
        metallic=0.35,
        roughness=0.22,
        coat=0.45,
        color_tex_path=os.path.join(TEXTURES_DIR, "dreidel_heirloom_albedo.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "dreidel_heirloom_normal.png"),
        bump_strength=0.85,
    )

    parts = []

    # 1. Ornate silver pedestal display stand (Z = 0.000 .. 0.044)
    stand_prof = [
        (0.042, 0.000),
        (0.043, 0.003),
        (0.039, 0.007),
        (0.032, 0.014),
        (0.022, 0.020),
        (0.015, 0.026),
        (0.022, 0.032),
        (0.028, 0.040),
        (0.026, 0.044),
        (0.020, 0.042),
        (0.012, 0.034),
        (0.003, 0.028),
    ]
    parts.append(
        create_lathe_mesh(
            "DreidelStand",
            stand_prof,
            segments=48,
            cap_bottom=True,
            cap_top=False,
            flute_amp=0.0012,
            flute_count=12,
            flute_z_range=(0.006, 0.022),
            mat=mat_silver,
        )
    )
    parts.append(add_bead_ring("StandBeads", 0.0045, 0.0415, 0.0014, 32, mat_silver))
    parts.append(add_bead_ring("StandRimBeads", 0.0430, 0.0270, 0.0012, 24, mat_silver))

    # 2. Dreidel spinning tip nestled into the stand (Z = 0.028 .. 0.068)
    tip_prof = [
        (0.0015, 0.028),
        (0.0055, 0.034),
        (0.0125, 0.043),
        (0.0240, 0.056),
        (0.0360, 0.066),
        (0.0375, 0.068),
    ]
    parts.append(
        create_lathe_mesh(
            "DreidelTip",
            tip_prof,
            segments=40,
            cap_bottom=True,
            cap_top=True,
            flute_amp=0.0008,
            flute_count=12,
            flute_z_range=(0.038, 0.064),
            mat=mat_silver,
        )
    )

    # 3. Four-sided enameled & silver-framed cube body (Z = 0.068 .. 0.130)
    hw = 0.031
    z0, z1 = 0.068, 0.130
    body = create_dreidel_body_with_uvs("DreidelBody", hw, z0, z1, mat_faces, mat_silver)
    parts.append(body)

    # Ornate silver corner pillars & top/bottom moldings framing the 4 Hebrew letter panels!
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts = [Vector((sx * hw, sy * hw, z0 - 0.002)), Vector((sx * hw, sy * hw, z1 + 0.002))]
            parts.append(create_tube_along_points(f"CornerPost_{sx}_{sy}", pts, radii=0.0032, radial_segs=12, mat=mat_silver))
            # Decorative corner finials at top shoulders
            bm_f = bmesh.new()
            bmesh.ops.create_uvsphere(bm_f, u_segments=10, v_segments=8, radius=0.0044, matrix=Matrix.Translation((sx * hw, sy * hw, z1 + 0.003)))
            mf = bpy.data.meshes.new(f"CornerBall_{sx}_{sy}")
            bm_f.to_mesh(mf)
            bm_f.free()
            fo = bpy.data.objects.new(f"CornerBall_{sx}_{sy}", mf)
            bpy.context.collection.objects.link(fo)
            set_smooth(fo, 60.0)
            fo.data.materials.append(mat_silver)
            parts.append(fo)

    # Silver shoulder bevel moldings around top & bottom of body
    for mz in (z0, z1):
        ring_pts = [
            Vector((-hw - 0.001, -hw - 0.001, mz)),
            Vector((hw + 0.001, -hw - 0.001, mz)),
            Vector((hw + 0.001, hw + 0.001, mz)),
            Vector((-hw - 0.001, hw + 0.001, mz)),
            Vector((-hw - 0.001, -hw - 0.001, mz)),
        ]
        parts.append(create_tube_along_points(f"BodyTrim_{mz:.3f}", ring_pts, radii=0.0028, radial_segs=10, cap_ends=False, mat=mat_silver))

    # 4. Domed silver shoulder cap & turned filigree crown spinning handle (Z = 0.130 .. 0.184)
    handle_prof = [
        (0.036, 0.130),
        (0.032, 0.136),
        (0.022, 0.142),
        (0.011, 0.147),
        (0.0072, 0.153),
        (0.0068, 0.165),
        (0.0115, 0.171),
        (0.0130, 0.176),
        (0.0085, 0.181),
        (0.0020, 0.185),
    ]
    parts.append(create_lathe_mesh("DreidelHandle", handle_prof, segments=40, cap_bottom=True, cap_top=True, mat=mat_silver))
    parts.append(add_bead_ring("HandleBeads", 0.142, 0.0225, 0.0013, 20, mat_silver))
    # Sapphire enamel jewel collar on handle knop
    parts.append(
        create_lathe_mesh(
            "HandleEnamel",
            [(0.0112, 0.172), (0.0134, 0.1755), (0.0108, 0.1785)],
            segments=32,
            cap_bottom=False,
            cap_top=False,
            mat=mat_enamel,
        )
    )

    join_objects(parts, "Dreidel_Large_Heirloom")
    export_glb(os.path.join(MODELS_DIR, "dreidel_large.glb"))

    render_previews(
        "dreidel_large",
        views=[
            ("three_quarter", (0.20, -0.24, 0.14), 52.0),
            ("front", (0.0, -0.28, 0.10), 52.0),
        ],
        target=(0.0, 0.0, 0.09),
        res=(640, 640),
        samples=32,
    )


def build_playable_dreidel(variant_name, tex_filename, accent_color, out_glb):
    """Build a crisp 6.4 cm playable dreidel centered at tip Z = 0 so Three.js can spin it interactively!"""
    reset_scene()

    mat_body = make_pbr_material(
        f"Dreidel_{variant_name}_Faces",
        metallic=0.05,
        roughness=0.28,
        coat=0.35,
        color_tex_path=os.path.join(TEXTURES_DIR, tex_filename),
    )
    mat_accent = make_pbr_material(
        f"Dreidel_{variant_name}_Accent",
        base_color=accent_color,
        metallic=0.12 if variant_name == "blue" else 0.02,
        roughness=0.26,
        coat=0.35,
    )

    parts = []
    # Smooth tapered spinning point (Z = 0.000 .. 0.018)
    tip_prof = [
        (0.0008, 0.000),
        (0.0038, 0.004),
        (0.0110, 0.012),
        (0.0175, 0.018),
    ]
    parts.append(create_lathe_mesh("PlayTip", tip_prof, segments=32, cap_bottom=True, cap_top=True, mat=mat_accent))

    # 4-sided Hebrew letter body (Z = 0.018 .. 0.044)
    hw = 0.0135
    parts.append(create_dreidel_body_with_uvs("PlayBody", hw, 0.018, 0.044, mat_body, mat_accent))

    # Rounded bevel corner strips so wooden/painted edges catch warm specular light
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts = [Vector((sx * hw, sy * hw, 0.018)), Vector((sx * hw, sy * hw, 0.044))]
            parts.append(create_tube_along_points(f"Edge_{sx}_{sy}", pts, radii=0.0014, radial_segs=8, mat=mat_accent))

    # Shoulder & turned finger stem (Z = 0.044 .. 0.066)
    stem_prof = [
        (0.0170, 0.044),
        (0.0135, 0.047),
        (0.0042, 0.050),
        (0.0038, 0.062),
        (0.0048, 0.065),
        (0.0022, 0.067),
    ]
    parts.append(create_lathe_mesh("PlayStem", stem_prof, segments=28, cap_bottom=True, cap_top=True, mat=mat_accent))

    join_objects(parts, f"Dreidel_{variant_name}")
    export_glb(os.path.join(MODELS_DIR, out_glb))


def build_gelt_and_pouch():
    """Build embossed gold & silver foil chocolate gelt coins (stacks & scattered) + royal-blue organza pouch."""
    reset_scene()

    bump_path = os.path.join(TEXTURES_DIR, "gelt_normal.png")
    mat_gold_foil = make_pbr_material(
        "GeltGoldFoil",
        base_color=(0.98, 0.78, 0.24, 1.0),
        metallic=0.96,
        roughness=0.20,
        coat=0.18,
        bump_tex_path=bump_path,
        bump_strength=0.85,
    )
    mat_silver_foil = make_pbr_material(
        "GeltSilverFoil",
        base_color=(0.90, 0.92, 0.96, 1.0),
        metallic=0.96,
        roughness=0.20,
        coat=0.15,
        bump_tex_path=bump_path,
        bump_strength=0.78,
    )
    mat_pouch = make_pbr_material(
        "GeltPouchVelvet",
        base_color=(0.06, 0.16, 0.44, 1.0),
        metallic=0.04,
        roughness=0.76,
    )
    mat_cord = make_pbr_material(
        "GeltGoldCord",
        base_color=(0.88, 0.68, 0.22, 1.0),
        metallic=0.75,
        roughness=0.32,
    )

    def make_coin(name, x, y, z, r, thick, mat, tilt_x=0.0, tilt_y=0.0, rot_z=0.0):
        segs = 32
        bm = bmesh.new()
        uv_layer = bm.loops.layers.uv.new("UVMap")

        bot_ring = []
        top_ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            # Subtle foil crimp along circumference
            rr = r * (1.0 + 0.012 * math.sin(24 * a))
            bot_ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), 0.0)))
            top_ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), thick)))

        # Side rim
        for i in range(segs):
            inext = (i + 1) % segs
            f = bm.faces.new((bot_ring[i], bot_ring[inext], top_ring[inext], top_ring[i]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.05, 0.5)

        # Top & bottom faces mapped cleanly onto circular embossed coin texture!
        f_top = bm.faces.new(top_ring)
        for i, loop in enumerate(f_top.loops):
            a = 2 * math.pi * i / segs
            loop[uv_layer].uv = (0.5 + 0.48 * math.cos(a), 0.5 + 0.48 * math.sin(a))

        f_bot = bm.faces.new(list(reversed(bot_ring)))
        for i, loop in enumerate(f_bot.loops):
            a = 2 * math.pi * i / segs
            loop[uv_layer].uv = (0.5 + 0.48 * math.cos(a), 0.5 + 0.48 * math.sin(a))

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = (x, y, z)
        obj.rotation_euler = (tilt_x, tilt_y, rot_z)
        set_smooth(obj, 35.0)
        obj.data.materials.append(mat)
        return obj

    rng = random.Random(18)
    parts = []

    # Stack 1: Tall neat stack of 6 large gold coins
    r_lg, th = 0.0195, 0.0044
    for k in range(6):
        jx = rng.uniform(-0.0018, 0.0018)
        jy = rng.uniform(-0.0018, 0.0018)
        parts.append(make_coin(f"CoinStackA_{k}", 0.035 + jx, 0.015 + jy, k * th, r_lg, th, mat_gold_foil, rot_z=rng.uniform(0, 6.28)))

    # Stack 2: 4 coins (mix gold & silver)
    for k in range(4):
        jx = rng.uniform(-0.0016, 0.0016)
        jy = rng.uniform(-0.0016, 0.0016)
        mat = mat_silver_foil if k % 2 == 1 else mat_gold_foil
        parts.append(make_coin(f"CoinStackB_{k}", 0.078 + jx, -0.012 + jy, k * th, 0.0175, th, mat, rot_z=rng.uniform(0, 6.28)))

    # Stack 3: 3 coins slightly forward
    for k in range(3):
        parts.append(make_coin(f"CoinStackC_{k}", 0.012 + k * 0.0015, -0.038, k * th, 0.0185, th, mat_gold_foil, rot_z=rng.uniform(0, 6.28)))

    # Scattered flat & leaning coins spilling from pouch!
    scattered = [
        (-0.018, -0.015, 0.0, 0.019, mat_gold_foil, 0.0, 0.0),
        (0.052, -0.042, 0.0, 0.017, mat_silver_foil, 0.0, 0.0),
        (0.105, 0.018, 0.0, 0.019, mat_gold_foil, 0.0, 0.0),
        (0.125, -0.025, 0.0, 0.016, mat_gold_foil, 0.0, 0.0),
        (0.004, 0.044, 0.0, 0.018, mat_silver_foil, 0.0, 0.0),
        (0.064, 0.046, 0.0, 0.019, mat_gold_foil, 0.0, 0.0),
        (-0.036, -0.044, 0.0, 0.017, mat_gold_foil, 0.0, 0.0),
        # Leaning coin resting cleanly against Stack 1
        (0.009, 0.008, 0.009, 0.0185, mat_gold_foil, 0.32, -0.52),
        # Flat silver coin near Stack 2 (zero overlap/z-fighting!)
        (0.092, -0.068, 0.0, 0.0175, mat_silver_foil, 0.0, 0.0),
    ]
    for idx, (cx, cy, cz, cr, cmat, tx, ty) in enumerate(scattered):
        parts.append(make_coin(f"CoinScat_{idx}", cx, cy, cz, cr, th, cmat, tilt_x=tx, tilt_y=ty, rot_z=rng.uniform(0, 6.28)))

    # Plush royal-blue velvet drawstring gelt pouch with high-res smooth cloth gathers & natural slumped belly!
    pouch_prof = [
        (0.004, 0.000),
        (0.022, 0.001),
        (0.034, 0.005),
        (0.042, 0.012),
        (0.046, 0.020),
        (0.048, 0.029),
        (0.046, 0.038),
        (0.041, 0.046),
        (0.034, 0.054),
        (0.025, 0.061),
        (0.018, 0.067),
        (0.016, 0.071),  # cinched drawstring waist
        (0.019, 0.077),
        (0.024, 0.084),  # soft ruffled velvet cuff
        (0.027, 0.090),
        (0.025, 0.092),
        (0.020, 0.086),
        (0.014, 0.072),
    ]
    pouch = create_lathe_mesh(
        "GeltPouch",
        pouch_prof,
        segments=64,
        cap_bottom=True,
        cap_top=False,
        flute_amp=0.0028,
        flute_count=11,
        flute_z_range=(0.018, 0.092),
        mat=mat_pouch,
    )
    pouch.location = (-0.082, 0.015, 0.0)
    parts.append(pouch)

    # Golden braided drawstring cord hugging the cinched waist with soft curved ribbon tails draping organically down the belly
    cord_pts = []
    for i in range(49):
        a = 2 * math.pi * i / 48
        cord_pts.append(Vector((-0.082 + 0.0192 * math.cos(a), 0.015 + 0.0192 * math.sin(a), 0.0705)))
    parts.append(create_tube_along_points("PouchCordRing", cord_pts, radii=0.0021, radial_segs=10, cap_ends=False, mat=mat_cord))

    # Central knot + 2 softly draped gold cord tails hugging the curved pouch contour cleanly
    bm_kn = bmesh.new()
    bmesh.ops.create_uvsphere(bm_kn, u_segments=10, v_segments=8, radius=0.0038, matrix=Matrix.Translation((-0.082, -0.005, 0.070)))
    mkn = bpy.data.meshes.new("PouchKnot")
    bm_kn.to_mesh(mkn)
    bm_kn.free()
    kno = bpy.data.objects.new("PouchKnot", mkn)
    bpy.context.collection.objects.link(kno)
    set_smooth(kno, 60.0)
    kno.data.materials.append(mat_cord)
    parts.append(kno)

    for sgn in (-1, 1):
        tail_pts = [
            Vector((-0.082, -0.005, 0.070)),
            Vector((-0.082 + sgn * 0.008, -0.016, 0.060)),
            Vector((-0.082 + sgn * 0.016, -0.029, 0.046)),
            Vector((-0.082 + sgn * 0.020, -0.036, 0.032)),
            Vector((-0.082 + sgn * 0.022, -0.035, 0.018)),
            Vector((-0.082 + sgn * 0.025, -0.032, 0.006)),
        ]
        parts.append(create_tube_along_points(f"PouchTail_{sgn}", tail_pts, radii=0.0018, radial_segs=8, mat=mat_cord))

    join_objects(parts, "Gelt_Cluster")
    export_glb(os.path.join(MODELS_DIR, "gelt.glb"))

    render_previews(
        "gelt",
        views=[("three_quarter", (0.14, -0.26, 0.18), 48.0)],
        target=(0.0, 0.0, 0.025),
        res=(640, 512),
        samples=32,
    )


def main():
    build_large_heirloom_dreidel()
    build_playable_dreidel("blue", "dreidel_blue_albedo.jpg", (0.08, 0.18, 0.48, 1.0), "dreidel_blue.glb")
    build_playable_dreidel("wood", "dreidel_wood_albedo.jpg", (0.72, 0.54, 0.34, 1.0), "dreidel_wood.glb")
    build_gelt_and_pouch()
    print("[dreidels_gelt] all exports complete.")


if __name__ == "__main__":
    main()

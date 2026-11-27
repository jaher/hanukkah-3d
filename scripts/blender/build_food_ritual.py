"""Build remaining traditional Judaica props in headless Blender:
1. sufganiyot.glb  — Blue-and-white scalloped porcelain platter + 5 powdered-sugar jelly doughnuts with ruby strawberry jam
2. kiddush_cup.glb — Ornate 925 sterling silver Kiddush goblet + matching saucer + glossy ruby kosher wine
3. challah.glb     — Carved walnut challah board + 3D braided golden challah loaf + draped embroidered white/blue/silver challah cover
4. table_accents.glb + accents_meta.json — Silver/cobalt votive candle holders (with lit flame metadata), Hanukkah candle box, spare candles, matchbox
5. star_wall.glb & star_window.glb — Brushed silver & cobalt Star of David wall medallion and hanging window crystal Star of David ornament.
"""

import json
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


def build_sufganiyot():
    reset_scene()

    mat_platter = make_pbr_material(
        "PorcelainPlatter",
        metallic=0.02,
        roughness=0.14,
        coat=0.75,
        coat_roughness=0.06,
        color_tex_path=os.path.join(TEXTURES_DIR, "platter_albedo.jpg"),
    )
    mat_doughnut = make_pbr_material(
        "SufganiyahCrust",
        metallic=0.0,
        roughness=0.88,
        specular=0.18,
        color_tex_path=os.path.join(TEXTURES_DIR, "sufganiyah_albedo.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "sufganiyah_normal.png"),
        bump_strength=0.65,
    )
    mat_jam = make_pbr_material(
        "RubyStrawberryJam",
        base_color=(0.52, 0.025, 0.045, 1.0),
        metallic=0.0,
        roughness=0.10,
        coat=0.92,
        coat_roughness=0.04,
    )
    mat_crumb = make_pbr_material(
        "SufganiyahInteriorCrumb",
        base_color=(0.94, 0.82, 0.54, 1.0),
        metallic=0.0,
        roughness=0.94,
        specular=0.12,
        bump_tex_path=os.path.join(TEXTURES_DIR, "sufganiyah_normal.png"),
        bump_strength=0.95,
    )

    # 1. Scalloped blue-and-white porcelain platter (separate named mesh so clicking platter/doughnuts works cleanly!)
    plate_prof = [
        (0.088, 0.000),
        (0.095, 0.002),
        (0.110, 0.008),
        (0.132, 0.018),
        (0.136, 0.021),
        (0.131, 0.022),
        (0.104, 0.013),
        (0.082, 0.009),
        (0.004, 0.0085),
    ]
    plate = create_lathe_mesh(
        "PorcelainPlatter",
        plate_prof,
        segments=64,
        cap_bottom=True,
        cap_top=True,
        flute_amp=0.0022,
        flute_count=16,
        flute_z_range=(0.015, 0.023),
        mat=mat_platter,
    )
    bm = bmesh.new()
    bm.from_mesh(plate.data)
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uv_layer].uv = (0.5 + v.x / 0.276, 0.5 + v.y / 0.276)
    bm.to_mesh(plate.data)
    bm.free()

    # 2. Watertight single-manifold scalloped bite cutter (organic curved teeth-mark silhouette!)
    def create_bite_cutter(name, center_vec, cut_r=0.026, depth_h=0.10):
        segs = 36
        bm_c = bmesh.new()
        bot_v = []
        top_v = []
        for i in range(segs):
            a = 2.0 * math.pi * i / segs
            # Organic tooth-arc scallops around the circular bite profile (100% watertight manifold!)
            rr = cut_r * (1.0 + 0.085 * math.sin(6.0 * a) + 0.04 * math.cos(10.0 * a))
            bot_v.append(bm_c.verts.new((center_vec.x + rr * math.cos(a), center_vec.y + rr * math.sin(a), center_vec.z - depth_h * 0.5)))
            top_v.append(bm_c.verts.new((center_vec.x + rr * math.cos(a), center_vec.y + rr * math.sin(a), center_vec.z + depth_h * 0.5)))
        for i in range(segs):
            inext = (i + 1) % segs
            bm_c.faces.new((bot_v[i], bot_v[inext], top_v[inext], top_v[i]))
        bm_c.faces.new(list(reversed(bot_v)))
        bm_c.faces.new(top_v)
        bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)
        mc = bpy.data.meshes.new(name)
        bm_c.to_mesh(mc)
        bm_c.free()
        c_obj = bpy.data.objects.new(name, mc)
        bpy.context.collection.objects.link(c_obj)
        c_obj.data.materials.append(mat_crumb)
        return c_obj

    # 3. Build each doughnut with 4 bite states (State0=whole, State1=1 bite, State2=2 bites/half, State3=final morsel)
    def make_doughnut_base_mesh(name, radius=0.040, height=0.044, seed=0):
        u_segs = 40
        v_segs = 24
        bm = bmesh.new()
        uv_layer = bm.loops.layers.uv.new("UVMap")
        rings = []

        for j in range(v_segs + 1):
            vt = j / v_segs
            phi = -math.pi / 2.0 + vt * math.pi
            r_raw = max(0.0, math.cos(phi))
            r_profile = radius * (r_raw ** 0.82)
            z_raw = 0.5 * (math.sin(phi) + 1.0)
            z_pos = z_raw * height
            if vt < 0.14:
                z_pos *= 0.45
            if vt > 0.88:
                z_pos -= 0.0038 * ((vt - 0.88) / 0.12) ** 2

            ring = []
            for i in range(u_segs):
                ang = 2 * math.pi * i / u_segs
                wobble = 1.0 + 0.032 * math.sin(3 * ang + seed) + 0.022 * math.cos(5 * ang - seed * 1.7)
                rr = max(0.0005, r_profile * wobble)
                ring.append(bm.verts.new((rr * math.cos(ang), rr * math.sin(ang), z_pos)))
            rings.append((vt, ring))

        for j in range(len(rings) - 1):
            vt0, r0 = rings[j]
            vt1, r1 = rings[j + 1]
            for i in range(u_segs):
                inext = (i + 1) % u_segs
                f = bm.faces.new((r0[i], r0[inext], r1[inext], r1[i]))
                u0 = i / u_segs
                u1 = (i + 1) / u_segs
                for loop, uv in zip(f.loops, [(u0, vt0), (u1, vt0), (u1, vt1), (u0, vt1)]):
                    loop[uv_layer].uv = uv

        # Close top & bottom poles watertight for rock-solid boolean bite carving!
        c_bot = bm.verts.new((0.0, 0.0, 0.0))
        for i in range(u_segs):
            inext = (i + 1) % u_segs
            f = bm.faces.new((c_bot, rings[0][1][inext], rings[0][1][i]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.02)
        c_top = bm.verts.new((0.0, 0.0, height - 0.0038))
        for i in range(u_segs):
            inext = (i + 1) % u_segs
            f = bm.faces.new((c_top, rings[-1][1][i], rings[-1][1][inext]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.98)

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh)
        bm.free()
        d_obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(d_obj)
        set_smooth(d_obj, 50.0)
        d_obj.data.materials.append(mat_doughnut)
        d_obj.data.materials.append(mat_crumb)
        return d_obj

    def make_jam_dot(name, height, seed, pos_offset=(0.0, 0.0, 0.0), scale_xyz=(1.0, 1.0, 0.48), radius=0.0115):
        bm_j = bmesh.new()
        bmesh.ops.create_uvsphere(bm_j, u_segments=18, v_segments=12, radius=radius)
        for v in bm_j.verts:
            ang = math.atan2(v.co.y, v.co.x)
            v.co.x = v.co.x * scale_xyz[0] * (1.0 + 0.14 * math.sin(3 * ang + seed)) + pos_offset[0]
            v.co.y = v.co.y * scale_xyz[1] * (1.0 + 0.12 * math.cos(2 * ang - seed)) + pos_offset[1]
            v.co.z = v.co.z * scale_xyz[2] + height - 0.0030 + pos_offset[2]
        jm = bpy.data.meshes.new(name)
        bm_j.to_mesh(jm)
        bm_j.free()
        j_obj = bpy.data.objects.new(name, jm)
        bpy.context.collection.objects.link(j_obj)
        set_smooth(j_obj, 60.0)
        j_obj.data.materials.append(mat_jam)
        return j_obj

    def build_bitten_doughnut_states(idx, cx, cy, base_z, r, h, tilt, sd):
        # Bite cutter positions in local doughnut space (biting from front-facing -Y side inward!)
        # State 1: 1 crisp bite at front-right; State 2: 2nd big bite across middle; State 3: 3rd bite leaving tasty back crescent!
        bite_specs = [
            (Vector((0.010, -r * 0.88, h * 0.5)), 0.025),
            (Vector((-0.014, -r * 0.52, h * 0.5)), 0.028),
            (Vector((0.018, -r * 0.12, h * 0.5)), 0.030),
        ]

        for state in range(4):  # 0 = whole, 1 = 1 bite, 2 = 2 bites, 3 = final morsel
            state_name = f"Suf_{idx}_State{state}"
            d_obj = make_doughnut_base_mesh(state_name + "_Body", r, h, sd)

            # Carve real boolean bites progressively with EXACT watertight solver!
            for b_i in range(state):
                c_pos, c_rad = bite_specs[b_i]
                cutter = create_bite_cutter(f"_TmpCut_{idx}_{state}_{b_i}", c_pos, cut_r=c_rad)
                mod = d_obj.modifiers.new("Bite", 'BOOLEAN')
                mod.operation = 'DIFFERENCE'
                mod.solver = 'EXACT'
                mod.object = cutter
                bpy.context.view_layer.objects.active = d_obj
                bpy.ops.object.modifier_apply(modifier="Bite")
                bpy.data.objects.remove(cutter, do_unlink=True)
                # Ensure all newly carved concave interior faces show fluffy golden brioche crumb!
                for poly in d_obj.data.polygons:
                    p_center = poly.center
                    if (Vector((p_center.x, p_center.y, 0)) - Vector((c_pos.x, c_pos.y, 0))).length <= c_rad * 1.15:
                        poly.material_index = 1

            state_parts = [d_obj]
            # Top ruby jam dot (visible on whole & 1-bite states)
            if state <= 1:
                state_parts.append(make_jam_dot(state_name + "_TopJam", h, sd))
            # Exposed luscious ruby strawberry jam pocket gleaming inside the bitten interior!
            if state == 1:
                state_parts.append(
                    make_jam_dot(
                        state_name + "_InnerJam",
                        h * 0.54,
                        sd + 11,
                        pos_offset=(0.003, -r * 0.28, 0.0),
                        scale_xyz=(1.1, 0.85, 0.72),
                        radius=0.0125,
                    )
                )
            elif state == 2:
                state_parts.append(
                    make_jam_dot(
                        state_name + "_InnerJam",
                        h * 0.52,
                        sd + 23,
                        pos_offset=(0.002, r * 0.02, 0.0),
                        scale_xyz=(1.25, 0.8, 0.72),
                        radius=0.0135,
                    )
                )
            elif state == 3:
                state_parts.append(
                    make_jam_dot(
                        state_name + "_InnerJam",
                        h * 0.48,
                        sd + 31,
                        pos_offset=(-0.008, r * 0.28, 0.0),
                        scale_xyz=(0.9, 0.7, 0.65),
                        radius=0.0095,
                    )
                )

            joined = join_objects(state_parts, state_name)
            joined.location = (cx, cy, base_z)
            joined.rotation_euler = tilt
            set_smooth(joined, 42.0)

    ring_positions = [
        (0.048, 0.036, 0.009, 0.039, 0.043, (0.04, -0.03, 0.4), 1),
        (-0.046, 0.040, 0.009, 0.040, 0.044, (-0.03, 0.05, 1.8), 2),
        (-0.048, -0.040, 0.009, 0.039, 0.042, (0.05, 0.04, 0.2), 3),
        (0.046, -0.038, 0.009, 0.040, 0.044, (-0.04, -0.04, -0.3), 4),
        (0.002, 0.003, 0.038, 0.039, 0.043, (0.07, -0.06, 0.15), 5),
    ]
    for idx, (x, y, z, r, h, tilt, sd) in enumerate(ring_positions):
        build_bitten_doughnut_states(idx + 1, x, y, z, r, h, tilt, sd)

    export_glb(os.path.join(MODELS_DIR, "sufganiyot.glb"))

    # Hide bitten states briefly for clean preview of intact platter, plus render a bitten close-up!
    for o in bpy.data.objects:
        if "State1" in o.name or "State2" in o.name or "State3" in o.name:
            o.hide_render = True
    render_previews(
        "sufganiyot",
        views=[("three_quarter", (0.24, -0.30, 0.24), 48.0)],
        target=(0.0, 0.0, 0.035),
        res=(640, 512),
        samples=32,
    )
    # Render bitten preview (show State1 on #5 top, State2 on #3 front-left, State3 on #4 front-right!)
    for o in bpy.data.objects:
        if o.name in ("Suf_5_State0", "Suf_3_State0", "Suf_4_State0"):
            o.hide_render = True
        if o.name in ("Suf_5_State1", "Suf_3_State2", "Suf_4_State3"):
            o.hide_render = False
    render_previews(
        "sufganiyot_bitten",
        views=[("three_quarter", (0.20, -0.26, 0.22), 52.0)],
        target=(0.0, 0.0, 0.038),
        res=(640, 512),
        samples=32,
    )


def build_kiddush_cup():
    reset_scene()

    mat_silver = make_pbr_material(
        "KiddushSilver925",
        base_color=(0.95, 0.96, 0.98, 1.0),
        metallic=0.98,
        roughness=0.18,
        coat=0.18,
    )
    mat_silver_carved = make_pbr_material(
        "KiddushSilverCarved",
        base_color=(0.95, 0.96, 0.98, 1.0),
        metallic=0.98,
        roughness=0.22,
        coat=0.16,
        color_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_albedo.jpg"),
        rough_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "silver_carved_normal.png"),
        bump_strength=0.95,
    )
    mat_gold_wash = make_pbr_material(
        "KiddushGoldWash",
        base_color=(0.94, 0.76, 0.30, 1.0),
        metallic=0.96,
        roughness=0.18,
    )
    mat_enamel = make_pbr_material(
        "KiddushCobaltEnamel",
        base_color=(0.04, 0.14, 0.52, 1.0),
        metallic=0.15,
        roughness=0.12,
        coat=0.85,
    )
    mat_wine = make_pbr_material(
        "KosherRubyWine",
        base_color=(0.24, 0.012, 0.032, 1.0),
        metallic=0.0,
        roughness=0.04,
        coat=0.95,
        coat_roughness=0.02,
    )

    parts = []

    # 1. Matching scalloped silver Kiddush saucer (Z = 0.000 .. 0.012)
    saucer_prof = [
        (0.042, 0.000),
        (0.056, 0.006),
        (0.062, 0.011),
        (0.060, 0.0125),
        (0.046, 0.006),
        (0.036, 0.004),
        (0.002, 0.004),
    ]
    parts.append(
        create_lathe_mesh(
            "KiddushSaucer",
            saucer_prof,
            segments=56,
            cap_bottom=True,
            cap_top=True,
            flute_amp=0.0014,
            flute_count=16,
            flute_z_range=(0.007, 0.013),
            mat=mat_silver,
        )
    )
    parts.append(add_bead_ring("SaucerBeads", 0.0118, 0.0605, 0.0012, 40, mat_silver))

    # 2. Sterling silver Kiddush goblet resting at Z = 0.0042 (top of saucer well)
    z0 = 0.0042
    cup_prof = [
        (0.034, z0),
        (0.035, z0 + 0.003),
        (0.031, z0 + 0.008),
        (0.022, z0 + 0.017),
        (0.012, z0 + 0.026),
        (0.0085, z0 + 0.036),
        (0.0125, z0 + 0.044),
        (0.0152, z0 + 0.049),  # smoothly rounded baroque stem knop
        (0.0156, z0 + 0.053),
        (0.0132, z0 + 0.058),
        (0.0086, z0 + 0.064),
        (0.0115, z0 + 0.072),  # upper collar
        (0.0220, z0 + 0.084),  # fluted lower bowl calyx
        (0.0315, z0 + 0.104),
        (0.0325, z0 + 0.126),  # graceful tulip waist
        (0.0345, z0 + 0.146),
        (0.0385, z0 + 0.160),  # flared drinking lip
        (0.0372, z0 + 0.162),
        (0.0352, z0 + 0.159),
    ]
    goblet = create_lathe_mesh(
        "KiddushGobletOuter",
        cup_prof,
        segments=56,
        cap_bottom=True,
        cap_top=False,
        flute_amp=0.0014,
        flute_count=16,
        flute_z_range=(z0 + 0.078, z0 + 0.122),
        mat=mat_silver_carved,
    )
    # Assign continuous cylindrical UVs to goblet so chased silver carving wraps seamlessly!
    bm_g = bmesh.new()
    bm_g.from_mesh(goblet.data)
    uv_g = bm_g.loops.layers.uv.new("UVMap")
    for f in bm_g.faces:
        for loop in f.loops:
            co = loop.vert.co
            u = (math.atan2(co.y, co.x) / (2.0 * math.pi) + 0.5) * 2.0
            v = (co.z - z0) / 0.162 * 1.4
            loop[uv_g].uv = (u, v)
    bm_g.to_mesh(goblet.data)
    bm_g.free()
    parts.append(goblet)

    # Traditional gold-washed interior lining
    inner_prof = [
        (0.0352, z0 + 0.159),
        (0.0312, z0 + 0.140),
        (0.0288, z0 + 0.112),
        (0.0190, z0 + 0.086),
        (0.0020, z0 + 0.076),
    ]
    parts.append(create_lathe_mesh("KiddushInnerGold", inner_prof, segments=48, cap_bottom=False, cap_top=True, mat=mat_gold_wash))

    # Decorative beaded trims & cobalt enamel band around goblet waist
    parts.append(add_bead_ring("KiddushFootBeads", z0 + 0.004, 0.0342, 0.0012, 32, mat_silver))
    parts.append(add_bead_ring("KiddushKnopBeads", z0 + 0.052, 0.0158, 0.0013, 18, mat_silver))
    parts.append(add_bead_ring("KiddushBowlBeads", z0 + 0.128, 0.0332, 0.0012, 36, mat_silver))
    parts.append(
        create_lathe_mesh(
            "KiddushEnamelRing",
            [(0.0324, z0 + 0.120), (0.0336, z0 + 0.1235), (0.0326, z0 + 0.127)],
            segments=48,
            cap_bottom=False,
            cap_top=False,
            mat=mat_enamel,
        )
    )

    # Build 4 exact cup-conforming 3D wine meniscus levels (Level4=Full 100%, Level3=75%, Level2=50%, Level1=25%)
    # so clicking the Kiddush cup drops the wine level smoothly sip-by-sip down to empty without ever clipping the tapered silver bowl!
    # Inner bowl wall contour: (z_rel, r_wall) -> (0.076, 0.002), (0.086, 0.019), (0.112, 0.0288), (0.140, 0.0312), (0.159, 0.0352)
    def inner_radius_at(z_rel):
        pts = [(0.076, 0.002), (0.086, 0.0185), (0.112, 0.0282), (0.140, 0.0306), (0.159, 0.0346)]
        for k in range(len(pts) - 1):
            z_a, r_a = pts[k]
            z_b, r_b = pts[k + 1]
            if z_rel <= z_b or k == len(pts) - 2:
                t = max(0.0, min(1.0, (z_rel - z_a) / max(1e-6, z_b - z_a)))
                return r_a + (r_b - r_a) * t
        return 0.033

    wine_levels = [
        (4, 0.1515),  # 100% full near brim
        (3, 0.1365),  # 75% after 1st sip
        (2, 0.1200),  # 50% after 2nd sip
        (1, 0.1015),  # 25% last sip near bottom
    ]
    for lvl, z_rel in wine_levels:
        wz = z0 + z_rel
        r_top = inner_radius_at(z_rel)
        # Follow inner bowl up to wz, then concave capillary meniscus climbing up the gold-washed wall!
        prof = [(0.001, z0 + 0.079)]
        for z_step in (0.088, 0.102, 0.114, 0.128, 0.140):
            if z_step < z_rel - 0.004:
                prof.append((inner_radius_at(z_step), z0 + z_step))
        prof.extend([
            (r_top, wz + 0.0022),          # capillary meniscus edge against gold-washed wall
            (r_top * 0.94, wz + 0.0005),
            (r_top * 0.78, wz - 0.0004),
            (r_top * 0.42, wz - 0.0007),
            (0.0005, wz - 0.0008),
        ])
        w_obj = create_lathe_mesh(f"KosherWine_Level{lvl}", prof, segments=56, cap_bottom=True, cap_top=True, mat=mat_wine)
        set_smooth(w_obj, 65.0)

    join_objects(parts, "Kiddush_Cup_Set")
    export_glb(os.path.join(MODELS_DIR, "kiddush_cup.glb"))

    render_previews(
        "kiddush_cup",
        views=[
            ("three_quarter", (0.18, -0.24, 0.20), 52.0),
            ("top_wine", (0.12, -0.16, 0.28), 55.0),
        ],
        target=(0.0, 0.0, 0.11),
        res=(640, 640),
        samples=36,
    )


def build_challah_and_cover():
    reset_scene()

    mat_board = make_pbr_material(
        "ChallahBoardWalnut",
        metallic=0.0,
        roughness=0.38,
        coat=0.18,
        color_tex_path=os.path.join(TEXTURES_DIR, "walnut_albedo.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "walnut_normal.png"),
        bump_strength=0.35,
    )
    mat_challah = make_pbr_material(
        "BraidedChallahCrust",
        metallic=0.0,
        roughness=0.34,  # glossy egg-wash bake!
        coat=0.38,
        coat_roughness=0.22,
        color_tex_path=os.path.join(TEXTURES_DIR, "challah_albedo.jpg"),
    )
    mat_cover = make_pbr_material(
        "EmbroideredChallahCover",
        metallic=0.02,
        roughness=0.78,
        color_tex_path=os.path.join(TEXTURES_DIR, "challah_cover_albedo.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "challah_cover_normal.png"),
        bump_strength=0.45,
    )
    mat_tassel = make_pbr_material(
        "SilverTassel",
        base_color=(0.82, 0.85, 0.92, 1.0),
        metallic=0.65,
        roughness=0.38,
    )

    parts = []

    # 1. Oval carved wooden challah board (0.30 x 0.19 x 0.015 m — sized so generous cloth skirt drapes cleanly onto flat table!)
    segs = 64
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rx, ry = 0.150, 0.095
    board_h = 0.015
    rings = []
    for z, sc in [(0.0, 0.96), (0.003, 1.0), (board_h - 0.003, 1.0), (board_h, 0.96)]:
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring.append(bm.verts.new((rx * sc * math.cos(a), ry * sc * math.sin(a), z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(segs):
            inext = (i + 1) % segs
            bm.faces.new((rings[j][i], rings[j][inext], rings[j + 1][inext], rings[j + 1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uv_layer].uv = (0.5 + v.x / (2.2 * rx), 0.5 + v.y / (2.2 * ry))
    m_b = bpy.data.meshes.new("ChallahBoard")
    bm.to_mesh(m_b)
    bm.free()
    board_obj = bpy.data.objects.new("ChallahBoard", m_b)
    bpy.context.collection.objects.link(board_obj)
    set_smooth(board_obj, 36.0)
    board_obj.data.materials.append(mat_board)
    parts.append(board_obj)

    # 2. Genuine 3D braided 4-strand golden challah loaf resting on board (Z = 0.015 .. 0.084)
    loaf_z0 = board_h
    for s_idx in range(4):
        phase = s_idx * math.pi * 0.5
        pts = []
        radii = []
        steps = 44
        for i in range(steps + 1):
            u = i / steps
            x = -0.118 + u * 0.236
            env = math.sin(math.pi * u) ** 0.55
            y = 0.024 * env * math.sin(2.0 * math.pi * 2.2 * u + phase)
            z = loaf_z0 + 0.014 + 0.034 * env * (0.55 + 0.45 * math.cos(2.0 * math.pi * 2.2 * u + phase))
            pts.append(Vector((x, y, z)))
            radii.append(0.012 + 0.015 * env)

        strand = create_tube_along_points(f"ChallahStrand_{s_idx}", pts, radii, radial_segs=18, cap_ends=True, mat=mat_challah, aspect_y=1.12)
        bm_s = bmesh.new()
        bm_s.from_mesh(strand.data)
        uv_l = bm_s.loops.layers.uv.new("UVMap")
        for f in bm_s.faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uv_l].uv = ((v.x + 0.12) * 3.8, (v.y + v.z) * 4.8)
        bm_s.to_mesh(strand.data)
        bm_s.free()
        parts.append(strand)

    # Join walnut board + 4-strand braided golden challah loaf FIRST for exact cloth collision!
    loaf_board_obj = join_objects(parts, "Challah_Loaf_Board")

    # 3. Real Silky-Linen Cloth Physics Simulation under Gravity:
    #    Generous 46 cm x 37 cm embroidered cloth over the 24 cm loaf so the fabric hugs the braided dome,
    #    cascades into soft natural drapery folds down the sides, and flattens 100% dead-flat against the table!
    bm_fl = bmesh.new()
    bmesh.ops.create_grid(bm_fl, x_segments=4, y_segments=4, size=0.9)
    m_fl = bpy.data.meshes.new("_TmpTableFloor")
    bm_fl.to_mesh(m_fl)
    bm_fl.free()
    floor_col = bpy.data.objects.new("_TmpTableFloor", m_fl)
    floor_col.location = (0.0, 0.0, 0.0)
    bpy.context.collection.objects.link(floor_col)

    # Moderate grip on loaf so cover stays centered; very low friction on tabletop so skirt glides out & flattens completely!
    bpy.context.view_layer.objects.active = loaf_board_obj
    loaf_board_obj.modifiers.new("Collision", 'COLLISION')
    loaf_board_obj.collision.thickness_outer = 0.0022
    loaf_board_obj.collision.thickness_inner = 0.004
    loaf_board_obj.collision.damping_factor = 0.45
    loaf_board_obj.collision.cloth_friction = 14.0

    bpy.context.view_layer.objects.active = floor_col
    floor_col.modifiers.new("Collision", 'COLLISION')
    floor_col.collision.thickness_outer = 0.0006
    floor_col.collision.thickness_inner = 0.003
    floor_col.collision.damping_factor = 0.70
    floor_col.collision.cloth_friction = 0.8

    # Balanced quad grid (56 x 46) laid gently center-first (just like placing a real challah cover by its edges!)
    # so the center settles on the braided challah first and the sides & 4 corners cascade OUTWARD and lie 100% flat!
    nx, ny = 56, 46
    bm_c = bmesh.new()
    uv_l = bm_c.loops.layers.uv.new("UVMap")
    grid = []
    x0, x1 = -0.230, 0.230
    y0, y1 = -0.185, 0.185
    for j in range(ny + 1):
        v_t = j / ny
        cy = y0 + v_t * (y1 - y0)
        vy = (v_t - 0.5) * 2.0  # -1..1
        row = []
        for i in range(nx + 1):
            u_t = i / nx
            cx = x0 + u_t * (x1 - x0)
            ux = (u_t - 0.5) * 2.0  # -1..1
            # Gentle real-hand placement curve: center near loaf crown, outer edges/corners slightly raised so they unfurl outward!
            z_init = 0.088 + 0.022 * (ux * ux + vy * vy)
            row.append(bm_c.verts.new((cx, cy, z_init)))
        grid.append(row)

    for j in range(ny):
        for i in range(nx):
            f = bm_c.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            uvs = [
                (i / nx, j / ny),
                ((i + 1) / nx, j / ny),
                ((i + 1) / nx, (j + 1) / ny),
                (i / nx, (j + 1) / ny),
            ]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_l].uv = uv

    bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)
    m_c = bpy.data.meshes.new("ChallahCover")
    bm_c.to_mesh(m_c)
    bm_c.free()
    cover_obj = bpy.data.objects.new("ChallahCover", m_c)
    bpy.context.collection.objects.link(cover_obj)

    # True supple silk-linen cloth parameters with clean self-collision & Catmull-Clark refinement:
    bpy.context.view_layer.objects.active = cover_obj
    cloth_mod = cover_obj.modifiers.new("Cloth", 'CLOTH')
    cs = cloth_mod.settings
    cs.quality = 14
    cs.mass = 0.26
    cs.tension_stiffness = 12.0
    cs.compression_stiffness = 12.0
    cs.shear_stiffness = 7.0
    cs.bending_stiffness = 0.045
    cs.tension_damping = 3.5
    cs.compression_damping = 3.5
    cs.shear_damping = 3.5
    cs.bending_damping = 0.25
    cs.air_damping = 0.28

    cc = cloth_mod.collision_settings
    cc.collision_quality = 8
    cc.distance_min = 0.0014
    cc.friction = 4.0
    cc.use_self_collision = True
    cc.self_distance_min = 0.0020
    cc.self_friction = 2.0

    # Simulate 140 frames (~5.8s) so gravity completely unfurls & flattens every edge and corner onto the table!
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 140
    for fr in range(1, 141):
        scene.frame_set(fr)

    # Bake simulated cloth state into static mesh geometry
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_cover = cover_obj.evaluated_get(depsgraph)
    baked_mesh = bpy.data.meshes.new_from_object(eval_cover)
    cover_obj.modifiers.remove(cloth_mod)
    old_mesh = cover_obj.data
    cover_obj.data = baked_mesh
    bpy.data.meshes.remove(old_mesh)

    # Remove temporary colliders & collision modifier from loaf/board
    loaf_board_obj.modifiers.remove(loaf_board_obj.modifiers["Collision"])
    bpy.data.objects.remove(floor_col, do_unlink=True)
    scene.frame_set(1)

    # Exact BVH clearance check against loaf & board + measure how flat the resting table apron is!
    from mathutils.bvhtree import BVHTree
    bm_lb = bmesh.new()
    bm_lb.from_mesh(loaf_board_obj.data)
    bmesh.ops.triangulate(bm_lb, faces=bm_lb.faces)
    bvh_lb = BVHTree.FromBMesh(bm_lb)
    bm_lb.free()

    min_clearance = 999.0
    pushed_verts = 0
    skirt_zs = []
    for v in cover_obj.data.vertices:
        if v.co.z < 0.0008:
            v.co.z = 0.0008
        # Measure outer apron flatness (outside oval board footprint)
        if (v.co.x / (rx + 0.025)) ** 2 + (v.co.y / (ry + 0.025)) ** 2 > 1.0:
            skirt_zs.append(v.co.z * 1000.0)
        loc, norm, _idx, dist = bvh_lb.find_nearest(v.co)
        if loc is not None and dist < 0.012:
            to_v = v.co - loc
            signed_d = to_v.dot(norm)
            if signed_d < 0.0018:
                push_dir = (norm + Vector((0.0, 0.0, 0.25))).normalized()
                v.co = loc + push_dir * 0.0022
                pushed_verts += 1
                signed_d = 0.0022
            if signed_d < min_clearance:
                min_clearance = signed_d

    corner_zs = [cover_obj.data.vertices[cj * (nx + 1) + ci].co.z * 1000.0 for ci, cj in [(0, 0), (nx, 0), (0, ny), (nx, ny)]]
    skirt_med = sorted(skirt_zs)[len(skirt_zs) // 2] if skirt_zs else -1
    skirt_max = max(skirt_zs) if skirt_zs else -1
    print(f"[challah] Cloth sim baked! min_bread_clearance={min_clearance*1000:.2f} mm, adjusted={pushed_verts}, corner_z_mm={[round(z, 2) for z in corner_zs]}, skirt_median_z={skirt_med:.2f} mm, skirt_max_z={skirt_max:.2f} mm")

    # Record corner positions BEFORE Subsurf so tassels attach right to the 4 cloth corners resting flat on the table!
    corner_coords = [cover_obj.data.vertices[cj * (nx + 1) + ci].co.copy() for ci, cj in [(0, 0), (nx, 0), (0, ny), (nx, ny)]]

    # Silky Catmull-Clark Subdivision Surface (levels=1) + crisp 1.4mm outward-only Solidify!
    sub_mod = cover_obj.modifiers.new("Subsurf", 'SUBSURF')
    sub_mod.levels = 1
    sub_mod.render_levels = 1
    sol = cover_obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.0014
    sol.offset = 1.0
    bpy.context.view_layer.objects.active = cover_obj
    bpy.ops.object.modifier_apply(modifier="Subsurf")
    bpy.ops.object.modifier_apply(modifier="Solidify")
    # Post-subsurf final floor clamp so no subsurf overshoot ever drops below tabletop!
    for v in cover_obj.data.vertices:
        if v.co.z < 0.0005:
            v.co.z = 0.0005
    set_smooth(cover_obj, 60.0)
    cover_obj.data.materials.append(mat_cover)

    # Keep ChallahCover + flat resting corner tassels as "Challah_Cover_Group"
    cover_parts = [cover_obj]
    for idx_c, (ci, cj) in enumerate([(0, 0), (nx, 0), (0, ny), (nx, ny)]):
        co = corner_coords[idx_c]
        dir_x = 0.014 if ci == nx else -0.014
        dir_y = 0.011 if cj == ny else -0.011
        t_pts = [
            Vector((co.x, co.y, max(0.0018, co.z))),
            Vector((co.x + dir_x, co.y + dir_y, 0.0020)),
        ]
        cover_parts.append(create_tube_along_points(f"Tassel_{ci}_{cj}", t_pts, radii=[0.0018, 0.0032], radial_segs=10, mat=mat_tassel))

    join_objects(cover_parts, "Challah_Cover_Group")
    export_glb(os.path.join(MODELS_DIR, "challah.glb"))

    render_previews(
        "challah",
        views=[
            ("three_quarter", (0.28, -0.34, 0.22), 48.0),
            ("side_check", (0.04, -0.42, 0.08), 52.0),
            ("top_angle", (-0.20, -0.26, 0.34), 48.0),
        ],
        target=(0.0, 0.0, 0.036),
        res=(640, 512),
        samples=32,
    )


def build_table_accents_and_stars():
    """Build votive candle holder (single reusable GLB), Hanukkah candle box + matches, and Star of David decor."""
    # --- A. Frosted Cobalt & Silver Votive Candle Holder (votive.glb) ---
    reset_scene()
    mat_silver = make_pbr_material("VotiveSilver", base_color=(0.93, 0.94, 0.96, 1.0), metallic=0.96, roughness=0.16)
    mat_glass = make_pbr_material("CobaltFrostedGlass", base_color=(0.14, 0.34, 0.78, 1.0), metallic=0.05, roughness=0.22, alpha=0.58)
    mat_wax = make_pbr_material("VotiveWax", base_color=(0.97, 0.93, 0.84, 1.0), metallic=0.0, roughness=0.38)
    mat_wick = make_pbr_material("VotiveWick", base_color=(0.06, 0.05, 0.04, 1.0), roughness=0.9)

    v_parts = []
    # Silver footed base ring & top rim
    v_parts.append(create_lathe_mesh("VotiveFoot", [(0.028, 0.0), (0.030, 0.005), (0.026, 0.012), (0.028, 0.015)], 40, mat=mat_silver))
    v_parts.append(add_bead_ring("VotiveBeads", 0.013, 0.0285, 0.0012, 26, mat_silver))
    # Frosted cobalt glass cup
    v_parts.append(
        create_lathe_mesh(
            "VotiveGlass",
            [(0.026, 0.013), (0.032, 0.042), (0.035, 0.068), (0.032, 0.068), (0.029, 0.042), (0.023, 0.016)],
            40,
            cap_bottom=True,
            cap_top=False,
            flute_amp=0.0009,
            flute_count=12,
            flute_z_range=(0.018, 0.064),
            mat=mat_glass,
        )
    )
    # Silver upper filigree rim ring
    v_parts.append(create_lathe_mesh("VotiveRim", [(0.0325, 0.066), (0.0365, 0.069), (0.0320, 0.071)], 40, cap_bottom=False, cap_top=False, mat=mat_silver))
    # Inner ivory wax votive candle + wick (wick tip at Z = 0.058 -> Three.js Y = 0.058)
    v_parts.append(create_lathe_mesh("VotiveWax", [(0.020, 0.016), (0.021, 0.046), (0.015, 0.048), (0.001, 0.046)], 28, mat=mat_wax))
    v_parts.append(create_tube_along_points("VotiveWick", [(0, 0, 0.046), (0.001, 0, 0.057)], radii=0.0007, radial_segs=8, mat=mat_wick))

    join_objects(v_parts, "Votive_Holder")
    export_glb(os.path.join(MODELS_DIR, "votive.glb"))

    # --- B. Hanukkah Candle Box + Spare Candles + Matches (candle_box.glb) ---
    reset_scene()
    mat_box = make_pbr_material(
        "CandleBoxCard",
        metallic=0.02,
        roughness=0.45,
        color_tex_path=os.path.join(TEXTURES_DIR, "candle_box_albedo.jpg"),
    )
    mat_wax_b = make_pbr_material("SpareBlueWax", base_color=(0.14, 0.34, 0.78, 1.0), roughness=0.35)
    mat_wax_w = make_pbr_material("SpareWhiteWax", base_color=(0.95, 0.94, 0.90, 1.0), roughness=0.35)
    mat_match_w = make_pbr_material("MatchWood", base_color=(0.76, 0.60, 0.38, 1.0), roughness=0.72)
    mat_match_tip = make_pbr_material("MatchTip", base_color=(0.68, 0.14, 0.12, 1.0), roughness=0.55)

    cb_parts = []
    # Rectangular candle box (0.125 x 0.068 x 0.024 m)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.125
        v.co.y *= 0.068
        v.co.z = (v.co.z + 0.5) * 0.024
    uv_l = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uv_l].uv = (0.5 + v.x / 0.13, 0.5 + v.y / 0.072)
    mb = bpy.data.meshes.new("CandleBox")
    bm.to_mesh(mb)
    bm.free()
    bobj = bpy.data.objects.new("CandleBox", mb)
    bpy.context.collection.objects.link(bobj)
    bobj.data.materials.append(mat_box)
    cb_parts.append(bobj)

    # 3 spare twisted Hanukkah candles resting casually beside the box
    for idx, (sx, sy, rot_z, mat) in enumerate([
        (0.010, -0.048, 0.18, mat_wax_b),
        (0.004, -0.062, -0.06, mat_wax_w),
        (-0.008, -0.055, 0.09, mat_wax_b),
    ]):
        pts = [Vector((-0.052, 0.0, 0.0052)), Vector((0.052, 0.0, 0.0048))]
        c_sp = create_tube_along_points(f"SpareCandle_{idx}", pts, radii=[0.0052, 0.0045], radial_segs=16, mat=mat)
        c_sp.location = (sx, sy, 0.0)
        c_sp.rotation_euler = (0.0, 0.0, rot_z)
        cb_parts.append(c_sp)

    # 2 wooden matches resting nearby
    for idx, (mx, my, rz) in enumerate([(0.088, -0.015, 0.42), (0.098, -0.028, -0.25)]):
        m_stick = create_tube_along_points(f"MatchStick_{idx}", [(-0.024, 0, 0.0014), (0.022, 0, 0.0014)], radii=0.0013, radial_segs=6, mat=mat_match_w)
        m_stick.location = (mx, my, 0.0)
        m_stick.rotation_euler = (0, 0, rz)
        cb_parts.append(m_stick)
        bm_t = bmesh.new()
        bmesh.ops.create_uvsphere(bm_t, u_segments=8, v_segments=6, radius=0.0022)
        for v in bm_t.verts:
            v.co.x *= 1.4
            v.co.x += 0.023
            v.co.z += 0.0016
        mt = bpy.data.meshes.new(f"MatchHead_{idx}")
        bm_t.to_mesh(mt)
        bm_t.free()
        to = bpy.data.objects.new(f"MatchHead_{idx}", mt)
        bpy.context.collection.objects.link(to)
        to.location = (mx, my, 0.0)
        to.rotation_euler = (0, 0, rz)
        to.data.materials.append(mat_match_tip)
        cb_parts.append(to)

    join_objects(cb_parts, "Candle_Box_Set")
    export_glb(os.path.join(MODELS_DIR, "candle_box.glb"))

    # --- C. Ornate Brushed-Silver & Cobalt Star of David Wall Medallion (star_wall.glb) ---
    reset_scene()
    mat_silver = make_pbr_material("StarWallSilver", base_color=(0.92, 0.94, 0.97, 1.0), metallic=0.96, roughness=0.18)
    mat_blue = make_pbr_material("StarWallCobalt", base_color=(0.05, 0.16, 0.48, 1.0), metallic=0.22, roughness=0.20, coat=0.75)

    sw_parts = []
    # Circular recessed cobalt medallion backing plate (radius 0.20 m, facing -Y in Blender -> +Z in Three.js)
    back_prof = [(0.205, 0.0), (0.205, 0.012), (0.192, 0.018), (0.005, 0.018)]
    back = create_lathe_mesh("StarWallBack", back_prof, segments=64, cap_bottom=True, cap_top=True, mat=mat_blue)
    back.rotation_euler = (math.pi / 2.0, 0.0, 0.0)  # now flat against Y=0 facing -Y!
    sw_parts.append(back)

    # Outer brushed silver bezel ring
    ring_pts = [Vector((0.200 * math.cos(2 * math.pi * i / 64), -0.016, 0.200 * math.sin(2 * math.pi * i / 64))) for i in range(65)]
    sw_parts.append(create_tube_along_points("StarWallRim", ring_pts, radii=0.010, radial_segs=16, cap_ends=False, mat=mat_silver))

    # Interlaced 3D Star of David triangles standing proud on front face
    rad = 0.155
    for t_idx, ang0 in enumerate([math.pi / 2.0, -math.pi / 2.0]):
        y_off = -0.026 if t_idx == 0 else -0.022
        corners = [Vector((rad * math.cos(ang0 + k * 2 * math.pi / 3), y_off, rad * math.sin(ang0 + k * 2 * math.pi / 3))) for k in range(3)]
        for k in range(3):
            p0, p1 = corners[k], corners[(k + 1) % 3]
            pts = [p0.lerp(p1, s / 8.0) for s in range(9)]
            sw_parts.append(create_tube_along_points(f"WallStarBar_{t_idx}_{k}", pts, radii=0.0085, radial_segs=14, mat=mat_silver))

    # Central silver sunburst jewel
    bm_j = bmesh.new()
    bmesh.ops.create_uvsphere(bm_j, u_segments=20, v_segments=14, radius=0.026)
    for v in bm_j.verts:
        v.co.y = v.co.y * 0.45 - 0.024
    mj = bpy.data.meshes.new("WallStarCenter")
    bm_j.to_mesh(mj)
    bm_j.free()
    jo = bpy.data.objects.new("WallStarCenter", mj)
    bpy.context.collection.objects.link(jo)
    set_smooth(jo, 60.0)
    jo.data.materials.append(mat_silver)
    sw_parts.append(jo)

    join_objects(sw_parts, "Star_Of_David_Wall")
    export_glb(os.path.join(MODELS_DIR, "star_wall.glb"))

    # --- D. Hanging Crystalline & Silver Star of David Window Ornament (star_window.glb) ---
    reset_scene()
    mat_silver = make_pbr_material("StarWinSilver", base_color=(0.96, 0.97, 1.0, 1.0), metallic=0.98, roughness=0.10)
    mat_crystal = make_pbr_material(
        "StarWinCrystal",
        base_color=(0.62, 0.80, 1.0, 1.0),
        metallic=0.12,
        roughness=0.06,
        coat=1.0,
        alpha=0.72,
    )
    win_parts = []
    # Delicate hanging silver ribbon cord from Z = 0.085 up to Z = 0.40
    win_parts.append(create_tube_along_points("StarWinCord", [(0, 0, 0.085), (0, 0, 0.42)], radii=0.0012, radial_segs=8, mat=mat_silver))
    r_w = 0.085
    for t_idx, ang0 in enumerate([math.pi / 2.0, -math.pi / 2.0]):
        corners = [Vector((r_w * math.cos(ang0 + k * 2 * math.pi / 3), (0.0015 if t_idx == 0 else -0.0015), r_w * math.sin(ang0 + k * 2 * math.pi / 3))) for k in range(3)]
        for k in range(3):
            p0, p1 = corners[k], corners[(k + 1) % 3]
            pts = [p0.lerp(p1, s / 6.0) for s in range(7)]
            win_parts.append(create_tube_along_points(f"WinStarBar_{t_idx}_{k}", pts, radii=0.0032, radial_segs=10, mat=mat_silver))
    # Faceted sapphire crystal drop in the center
    bm_c = bmesh.new()
    bmesh.ops.create_icosphere(bm_c, subdivisions=1, radius=0.020)
    for v in bm_c.verts:
        v.co.y *= 0.55
    mc = bpy.data.meshes.new("WinCrystal")
    bm_c.to_mesh(mc)
    bm_c.free()
    co = bpy.data.objects.new("WinCrystal", mc)
    bpy.context.collection.objects.link(co)
    co.data.materials.append(mat_crystal)
    win_parts.append(co)

    join_objects(win_parts, "Star_Of_David_Window")
    export_glb(os.path.join(MODELS_DIR, "star_window.glb"))

    print("[food_ritual] all exports complete.")


def build_latkes():
    """Build photorealistic crispy golden-brown Hanukkah latkes (potato pancakes) on a porcelain plate,
    served alongside a small bowl of swirled sour cream with fresh chives and a small bowl of spiced applesauce."""
    reset_scene()

    mat_plate = make_pbr_material(
        "LatkesPorcelainPlate",
        metallic=0.02,
        roughness=0.14,
        coat=0.78,
        coat_roughness=0.05,
        color_tex_path=os.path.join(TEXTURES_DIR, "platter_albedo.jpg"),
    )
    mat_bowl = make_pbr_material(
        "CondimentBowlCeramic",
        base_color=(0.95, 0.96, 0.98, 1.0),
        metallic=0.02,
        roughness=0.12,
        coat=0.82,
        coat_roughness=0.04,
    )
    mat_bowl_rim = make_pbr_material(
        "CondimentBowlCobaltRim",
        base_color=(0.08, 0.20, 0.52, 1.0),
        metallic=0.05,
        roughness=0.16,
        coat=0.80,
    )
    mat_latke = make_pbr_material(
        "CrispyPotatoLatke",
        metallic=0.0,
        roughness=0.42,
        specular=0.58,
        coat=0.32,             # warm pan-fried oil sheen catching candlelight!
        coat_roughness=0.22,
        color_tex_path=os.path.join(TEXTURES_DIR, "latke_albedo.jpg"),
        rough_tex_path=os.path.join(TEXTURES_DIR, "latke_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "latke_normal.png"),
        bump_strength=1.45,
    )
    mat_sour_cream = make_pbr_material(
        "ThickSourCream",
        base_color=(0.98, 0.96, 0.90, 1.0),
        metallic=0.0,
        roughness=0.26,
        coat=0.42,
        coat_roughness=0.16,
    )
    mat_chive = make_pbr_material(
        "FreshGreenChives",
        base_color=(0.14, 0.44, 0.12, 1.0),
        metallic=0.0,
        roughness=0.55,
    )
    mat_applesauce = make_pbr_material(
        "SpicedApplesauce",
        metallic=0.0,
        roughness=0.20,
        coat=0.72,
        coat_roughness=0.10,
        color_tex_path=os.path.join(TEXTURES_DIR, "applesauce_albedo.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "applesauce_normal.png"),
        bump_strength=0.85,
    )
    mat_spoon = make_pbr_material(
        "CondimentSilverSpoon",
        base_color=(0.94, 0.96, 0.98, 1.0),
        metallic=0.98,
        roughness=0.14,
    )

    # 1. Blue-and-white scalloped porcelain serving plate (20.6 cm diameter, centered at (0, 0, 0))
    plate_prof = [
        (0.068, 0.000),
        (0.075, 0.002),
        (0.088, 0.007),
        (0.102, 0.014),
        (0.105, 0.016),
        (0.101, 0.017),
        (0.082, 0.010),
        (0.064, 0.0072),
        (0.003, 0.0068),
    ]
    plate = create_lathe_mesh(
        "Latkes_Plate",
        plate_prof,
        segments=64,
        cap_bottom=True,
        cap_top=True,
        flute_amp=0.0014,
        flute_count=20,
        flute_z_range=(0.012, 0.0175),
        mat=mat_plate,
    )
    bm_p = bmesh.new()
    bm_p.from_mesh(plate.data)
    uv_p = bm_p.loops.layers.uv.new("UVMap")
    for f in bm_p.faces:
        for loop in f.loops:
            v = loop.vert.co
            loop[uv_p].uv = (0.5 + v.x / 0.214, 0.5 + v.y / 0.214)
    bm_p.to_mesh(plate.data)
    bm_p.free()

    # 2. Build 6 organic, craggy, freshly fried shredded-potato latkes with lacy crispy edges!
    def make_latke_mesh(name, radius, thick, seed):
        rng = random.Random(seed)
        r_rings = 9
        segs = 56
        bm = bmesh.new()
        uv_l = bm.loops.layers.uv.new("UVMap")

        # Organic craggy scalloped fried-potato silhouette (no spiky tentacles — crisp lace ridges!)
        def edge_wobble(ang):
            return (
                1.0
                + 0.055 * math.sin(3 * ang + seed * 1.1)
                + 0.044 * math.cos(5 * ang - seed * 0.7)
                + 0.036 * math.sin(11 * ang + seed * 2.3)
                + 0.028 * math.cos(17 * ang + seed * 0.4)
                + 0.020 * math.sin(25 * ang - seed * 1.9)
            )

        def surf_bump(x, y, s):
            return (
                0.0013 * math.sin(x * 165.0 + y * 90.0 + s)
                + 0.0010 * math.cos(x * 110.0 - y * 195.0 - s * 1.7)
                + 0.0007 * math.sin((x + y) * 260.0 + s * 2.4)
            )

        top_rings = []
        bot_rings = []
        for r_i in range(1, r_rings + 1):
            frac = r_i / r_rings
            # Crisp tapered pillow cross-section (thick puffy center -> thin crunchy browned lace edge!)
            h_prof = math.sqrt(max(0.02, 1.0 - (frac ** 2.15)))
            tr = []
            br = []
            for s_i in range(segs):
                ang = math.tau * s_i / segs
                wob = edge_wobble(ang) if frac > 0.35 else (1.0 + 0.3 * (edge_wobble(ang) - 1.0))
                rr = radius * frac * wob
                vx = rr * math.cos(ang)
                vy = rr * math.sin(ang)
                bmp = surf_bump(vx, vy, seed) * (0.55 + 0.45 * frac)
                zt = thick * (0.50 + 0.50 * h_prof) + bmp
                zb = thick * (0.50 - 0.50 * h_prof) * 0.65 - abs(bmp) * 0.3
                if r_i == r_rings:
                    # Crispy lacy edge slightly undulating upward/downward like real fried shreds
                    zt = thick * 0.34 + 0.0014 * math.sin(13 * ang + seed)
                    zb = zt - 0.0022
                tr.append(bm.verts.new((vx, vy, max(0.001, zt))))
                br.append(bm.verts.new((vx, vy, max(0.0, zb))))
            top_rings.append(tr)
            bot_rings.append(br)

        c_top = bm.verts.new((0.0, 0.0, thick + surf_bump(0.0, 0.0, seed)))
        c_bot = bm.verts.new((0.0, 0.0, 0.0))

        # Center fans
        for s_i in range(segs):
            sn = (s_i + 1) % segs
            bm.faces.new((c_top, top_rings[0][s_i], top_rings[0][sn]))
            bm.faces.new((c_bot, bot_rings[0][sn], bot_rings[0][s_i]))

        # Concentric quads top & bottom
        for r_i in range(len(top_rings) - 1):
            for s_i in range(segs):
                sn = (s_i + 1) % segs
                bm.faces.new((top_rings[r_i][s_i], top_rings[r_i + 1][s_i], top_rings[r_i + 1][sn], top_rings[r_i][sn]))
                bm.faces.new((bot_rings[r_i][sn], bot_rings[r_i + 1][sn], bot_rings[r_i + 1][s_i], bot_rings[r_i][s_i]))

        # Outer crispy rim band
        for s_i in range(segs):
            sn = (s_i + 1) % segs
            bm.faces.new((top_rings[-1][s_i], bot_rings[-1][s_i], bot_rings[-1][sn], top_rings[-1][sn]))

        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            for loop in f.loops:
                v = loop.vert.co
                u_c = 0.5 + (v.x / (radius * 2.22))
                v_c = 0.5 + (v.y / (radius * 2.22))
                loop[uv_l].uv = (max(0.02, min(0.98, u_c)), max(0.02, min(0.98, v_c)))

        m = bpy.data.meshes.new(name)
        bm.to_mesh(m)
        bm.free()
        obj = bpy.data.objects.new(name, m)
        bpy.context.collection.objects.link(obj)
        set_smooth(obj, 42.0)
        obj.data.materials.append(mat_latke)

        # Subtle flat tangential crispy potato shreds hugging the browned perimeter (no radial spikes!)
        parts_l = [obj]
        for k in range(14):
            ang = math.tau * k / 14.0 + rng.uniform(-0.18, 0.18)
            rr_base = radius * edge_wobble(ang) * rng.uniform(0.90, 0.99)
            # Run TANGENTIALLY along the crispy rim (ang + pi/2) so shreds curve around the latke edge naturally!
            tang = ang + (math.pi * 0.5) + rng.uniform(-0.32, 0.32)
            p0 = Vector((rr_base * math.cos(ang), rr_base * math.sin(ang), thick * rng.uniform(0.32, 0.52)))
            p1 = p0 + Vector((math.cos(tang) * 0.0045, math.sin(tang) * 0.0045, rng.uniform(-0.0006, 0.0008)))
            p2 = p1 + Vector((math.cos(tang + 0.25) * 0.0038, math.sin(tang + 0.25) * 0.0038, rng.uniform(-0.0008, 0.0006)))
            shred = create_tube_along_points(f"{name}_Shred_{k}", [p0, p1, p2], radii=[0.0014, 0.0012, 0.0006], radial_segs=5, mat=mat_latke)
            bm_sh = bmesh.new()
            bm_sh.from_mesh(shred.data)
            uv_sh = bm_sh.loops.layers.uv.new("UVMap")
            for f in bm_sh.faces:
                for loop in f.loops:
                    loop[uv_sh].uv = (0.91, 0.50)
            bm_sh.to_mesh(shred.data)
            bm_sh.free()
            parts_l.append(shred)

        return join_objects(parts_l, name)

    # Helper for optional interactive sour-cream / applesauce dollop meshes sitting on top of each latke
    def make_dollop(name, mat, scale_r=0.015, height=0.009, with_chives=False):
        bm_d = bmesh.new()
        bmesh.ops.create_uvsphere(bm_d, u_segments=20, v_segments=12, radius=scale_r)
        uv_d = bm_d.loops.layers.uv.new("UVMap")
        for v in bm_d.verts:
            ang = math.atan2(v.co.y, v.co.x)
            r_xy = math.hypot(v.co.x, v.co.y) / scale_r
            swirl = 1.0 + 0.09 * math.sin(3.0 * ang + r_xy * 4.0)
            v.co.x *= swirl
            v.co.y *= swirl
            if v.co.z < 0:
                v.co.z *= 0.20
            else:
                # Soft swirled peak on sour cream
                v.co.z = (v.co.z / scale_r) * height * (1.0 + 0.18 * math.exp(-r_xy * 3.0))
        for f in bm_d.faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uv_d].uv = (0.5 + v.x / (scale_r * 2.4), 0.5 + v.y / (scale_r * 2.4))
        md = bpy.data.meshes.new(name)
        bm_d.to_mesh(md)
        bm_d.free()
        d_obj = bpy.data.objects.new(name, md)
        bpy.context.collection.objects.link(d_obj)
        set_smooth(d_obj, 55.0)
        d_obj.data.materials.append(mat)
        d_parts = [d_obj]
        if with_chives:
            crng = random.Random(hash(name) & 0xFFFF)
            for k in range(7):
                a = crng.uniform(0, math.tau)
                rr = crng.uniform(0.002, scale_r * 0.65)
                cx_c, cy_c = rr * math.cos(a), rr * math.sin(a)
                cz_c = height * math.sqrt(max(0.05, 1.0 - (rr / scale_r) ** 2)) + 0.0005
                ca = crng.uniform(0, math.tau)
                pts_c = [
                    Vector((cx_c - math.cos(ca) * 0.0024, cy_c - math.sin(ca) * 0.0024, cz_c)),
                    Vector((cx_c + math.cos(ca) * 0.0024, cy_c + math.sin(ca) * 0.0024, cz_c)),
                ]
                d_parts.append(create_tube_along_points(f"{name}_Chive_{k}", pts_c, radii=0.0007, radial_segs=5, mat=mat_chive))
        return join_objects(d_parts, name)

    # 6 appetizingly shingled / stacked golden latkes on the porcelain plate!
    latke_specs = [
        # (x, y, z, radius, thick, (rx, ry, rz), seed)
        (-0.036,  0.024, 0.0075, 0.041, 0.0125, ( 0.02, -0.02, 0.4), 101),
        ( 0.034,  0.026, 0.0075, 0.042, 0.0125, (-0.02,  0.03, 1.9), 102),
        (-0.032, -0.028, 0.0075, 0.041, 0.0125, ( 0.03,  0.02, 2.7), 103),
        ( 0.036, -0.024, 0.0075, 0.040, 0.0125, (-0.03, -0.02, 0.8), 104),
        (-0.012,  0.006, 0.0195, 0.042, 0.0130, ( 0.06, -0.08, 1.2), 105),
        ( 0.018, -0.008, 0.0285, 0.041, 0.0130, (-0.08,  0.07, 3.6), 106),
    ]
    for idx, (lx, ly, lz, lr, lt, lrot, lsd) in enumerate(latke_specs, start=1):
        l_obj = make_latke_mesh(f"Latke_{idx}", lr, lt, lsd)
        l_obj.location = (lx, ly, lz)
        l_obj.rotation_euler = lrot

        # Interactive topping dollops positioned right on top of each latke (hidden by default in Three.js until bowl clicked!)
        sc_top = make_dollop(f"Latke_{idx}_SourCream", mat_sour_cream, scale_r=0.014, height=0.0085, with_chives=True)
        sc_top.location = (lx, ly, lz + lt * 0.92)
        sc_top.rotation_euler = lrot

        ap_top = make_dollop(f"Latke_{idx}_Applesauce", mat_applesauce, scale_r=0.015, height=0.0075, with_chives=False)
        ap_top.location = (lx, ly, lz + lt * 0.90)
        ap_top.rotation_euler = lrot

    # 3. Helper to build matching glazed porcelain condiment ramekin bowls + tiny sterling silver spoon!
    def build_condiment_bowl(group_name, bx, by, fill_type):
        b_parts = []
        # Glazed porcelain ramekin bowl (r = 0.034 m, h = 0.028 m)
        bowl_prof = [
            (0.020, 0.000),
            (0.023, 0.002),
            (0.030, 0.010),
            (0.034, 0.022),
            (0.035, 0.027),
            (0.032, 0.028),
            (0.030, 0.025),
            (0.026, 0.012),
            (0.018, 0.005),
            (0.001, 0.0045),
        ]
        b_mesh = create_lathe_mesh(group_name + "_Ceramic", bowl_prof, segments=44, cap_bottom=True, cap_top=True, mat=mat_bowl)
        b_parts.append(b_mesh)
        # Cobalt accent rim stripe around bowl top
        rim_pts = [Vector((0.0342 * math.cos(math.tau * i / 48), 0.0342 * math.sin(math.tau * i / 48), 0.0262)) for i in range(49)]
        b_parts.append(create_tube_along_points(group_name + "_Rim", rim_pts, radii=0.0014, radial_segs=8, cap_ends=False, mat=mat_bowl_rim))

        # Sculpted condiment filling (swirled sour cream + fresh green chives OR glossy chunky cinnamon applesauce!)
        bm_f = bmesh.new()
        uv_f = bm_f.loops.layers.uv.new("UVMap")
        r_steps, a_steps = 8, 40
        rings_f = []
        base_z = 0.0215
        for ri in range(1, r_steps + 1):
            frac = ri / r_steps
            rr = 0.0302 * frac
            ring = []
            for ai in range(a_steps):
                ang = math.tau * ai / a_steps
                if fill_type == "sour_cream":
                    # Creamy swirled vortex peak in center!
                    swirl_h = 0.0068 * math.exp(-(frac ** 1.6) * 2.8) + 0.0016 * math.sin(3.0 * ang - frac * 7.5) * (1.0 - frac * 0.6)
                    z_f = base_z + swirl_h - 0.0015 * (frac ** 2)
                else:
                    # Chunky glistening golden applesauce dome!
                    chunk_h = (
                        0.0042 * (1.0 - frac * frac)
                        + 0.0013 * math.sin(5.0 * ang + frac * 6.0) * (1.0 - 0.4 * frac)
                        + 0.0009 * math.cos(9.0 * ang - frac * 9.0)
                    )
                    z_f = base_z + chunk_h - 0.0010 * (frac ** 2)
                ring.append(bm_f.verts.new((rr * math.cos(ang), rr * math.sin(ang), z_f)))
            rings_f.append(ring)
        c_f = bm_f.verts.new((0.0, 0.0, base_z + (0.0085 if fill_type == "sour_cream" else 0.0052)))
        for ai in range(a_steps):
            an = (ai + 1) % a_steps
            bm_f.faces.new((c_f, rings_f[0][ai], rings_f[0][an]))
        for ri in range(len(rings_f) - 1):
            for ai in range(a_steps):
                an = (ai + 1) % a_steps
                bm_f.faces.new((rings_f[ri][ai], rings_f[ri + 1][ai], rings_f[ri + 1][an], rings_f[ri][an]))
        bmesh.ops.recalc_face_normals(bm_f, faces=bm_f.faces)
        for f in bm_f.faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uv_f].uv = (0.5 + v.x / 0.064, 0.5 + v.y / 0.064)
        mf = bpy.data.meshes.new(group_name + "_Fill")
        bm_f.to_mesh(mf)
        bm_f.free()
        f_obj = bpy.data.objects.new(group_name + "_Fill", mf)
        bpy.context.collection.objects.link(f_obj)
        set_smooth(f_obj, 55.0)
        f_obj.data.materials.append(mat_sour_cream if fill_type == "sour_cream" else mat_applesauce)
        b_parts.append(f_obj)

        # Fresh finely chopped green chive rings sprinkled across the swirled sour cream!
        if fill_type == "sour_cream":
            crng = random.Random(420)
            for k in range(22):
                a = crng.uniform(0, math.tau)
                rr = (crng.random() ** 0.6) * 0.021
                cx_c, cy_c = rr * math.cos(a), rr * math.sin(a)
                frac = rr / 0.0302
                cz_c = base_z + 0.0068 * math.exp(-(frac ** 1.6) * 2.8) + 0.0012
                ca = crng.uniform(0, math.tau)
                pts_c = [
                    Vector((cx_c - math.cos(ca) * 0.0028, cy_c - math.sin(ca) * 0.0028, cz_c)),
                    Vector((cx_c + math.cos(ca) * 0.0028, cy_c + math.sin(ca) * 0.0028, cz_c)),
                ]
                b_parts.append(create_tube_along_points(f"{group_name}_Chive_{k}", pts_c, radii=0.0008, radial_segs=5, mat=mat_chive))

        # Delicate sterling silver condiment spoon resting naturally in the bowl!
        s_dir = -1.0 if bx < 0 else 1.0
        sp_pts = [
            Vector((s_dir * 0.008, -0.004, 0.022)),
            Vector((s_dir * 0.026, -0.006, 0.031)),
            Vector((s_dir * 0.044, -0.008, 0.042)),
            Vector((s_dir * 0.056, -0.009, 0.049)),
        ]
        b_parts.append(create_tube_along_points(group_name + "_Spoon", sp_pts, radii=[0.0028, 0.0018, 0.0022, 0.0036], radial_segs=10, mat=mat_spoon))

        joined = join_objects(b_parts, group_name)
        joined.location = (bx, by, 0.0)
        return joined

    # Place Sour Cream bowl on the left & Spiced Applesauce bowl on the right beside the latkes plate!
    build_condiment_bowl("SourCream_Bowl", -0.132, 0.048, "sour_cream")
    build_condiment_bowl("Applesauce_Bowl", 0.132, 0.048, "applesauce")

    export_glb(os.path.join(MODELS_DIR, "latkes.glb"))

    # Hide optional interactive topping dollops for clean preview of freshly fried latkes + side bowls!
    for o in bpy.data.objects:
        if o.name.endswith("_SourCream") or o.name.endswith("_Applesauce"):
            o.hide_render = True
    render_previews(
        "latkes",
        views=[
            ("three_quarter", (0.04, -0.34, 0.22), 50.0),
            ("top", (0.0, -0.08, 0.38), 52.0),
        ],
        target=(0.0, 0.01, 0.02),
        res=(640, 512),
        samples=36,
    )


def main():
    build_sufganiyot()
    build_latkes()
    build_kiddush_cup()
    build_challah_and_cover()
    build_table_accents_and_stars()


if __name__ == "__main__":
    main()

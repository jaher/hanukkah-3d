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

    # 1. Oval carved wooden challah board (0.34 x 0.22 x 0.018 m)
    segs = 64
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    rx, ry = 0.175, 0.112
    board_h = 0.017
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

    # 2. Genuine 3D braided 4-strand golden challah loaf resting on board (Z = 0.017 .. 0.095)
    # Four interwoven sinusoidal strands along X in [-0.135, +0.135]
    loaf_z0 = board_h
    for s_idx in range(4):
        phase = s_idx * math.pi * 0.5
        pts = []
        radii = []
        steps = 44
        for i in range(steps + 1):
            u = i / steps  # 0..1
            x = -0.135 + u * 0.270
            env = math.sin(math.pi * u) ** 0.55  # tapers gently at loaf ends!
            y = 0.028 * env * math.sin(2.0 * math.pi * 2.2 * u + phase)
            z = loaf_z0 + 0.016 + 0.040 * env * (0.55 + 0.45 * math.cos(2.0 * math.pi * 2.2 * u + phase))
            pts.append(Vector((x, y, z)))
            radii.append(0.014 + 0.017 * env)

        strand = create_tube_along_points(f"ChallahStrand_{s_idx}", pts, radii, radial_segs=18, cap_ends=True, mat=mat_challah, aspect_y=1.12)
        # Assign clean UVs to strand
        bm_s = bmesh.new()
        bm_s.from_mesh(strand.data)
        uv_l = bm_s.loops.layers.uv.new("UVMap")
        for f in bm_s.faces:
            for loop in f.loops:
                v = loop.vert.co
                loop[uv_l].uv = ((v.x + 0.14) * 3.5, (v.y + v.z) * 4.5)
        bm_s.to_mesh(strand.data)
        bm_s.free()
        parts.append(strand)

    # 3. Draped Embroidered Challah Cover folded artistically over the left/back 65% of the challah
    #    so BOTH the gorgeous embroidered cover AND the golden braided challah peeking out are prominently visible!
    nx, ny = 42, 34
    bm_c = bmesh.new()
    uv_l = bm_c.loops.layers.uv.new("UVMap")
    grid = []
    # Cloth covers X in [-0.195, +0.065] (drapes off left/back edge of board and hugs loaf contour!)
    # and Y in [-0.145, +0.145]
    for j in range(ny + 1):
        v_t = j / ny
        cy = -0.140 + v_t * 0.280
        row = []
        for i in range(nx + 1):
            u_t = i / nx
            cx = -0.190 + u_t * 0.260  # right edge rests artistically across the braided loaf around x=+0.07

            # Compute smooth surface height draping generously over the elliptical braided challah loaf + board!
            # Generous dome clearance (rx=0.156, ry=0.086, height=0.086 above board) guarantees zero bread poke-through!
            ell = (cx / 0.156) ** 2 + (cy / 0.086) ** 2
            if ell < 1.0:
                loaf_h = loaf_z0 + 0.016 + 0.084 * math.sqrt(max(0.0, 1.0 - ell))
            else:
                # Smooth natural catenary cloth drape down to board/table
                d = math.sqrt(ell) - 1.0
                loaf_h = loaf_z0 + 0.016 * math.exp(-d * 4.2)

            # Outside the oval board, drape softly down to tabletop Z = 0.002!
            board_ell = (cx / 0.175) ** 2 + (cy / 0.112) ** 2
            if board_ell > 1.0:
                bd = math.sqrt(board_ell) - 1.0
                board_drop = math.exp(-bd * 7.5)
                z_val = 0.003 + (loaf_h - 0.003) * board_drop
            else:
                z_val = loaf_h

            # Subtle organic fabric ripples & pleats along draped edges
            edge_factor = min(1.0, max(0.0, ell - 0.55))
            ripple = 0.0030 * edge_factor * math.sin(cx * 34.0 + cy * 26.0) + 0.0016 * math.cos(cy * 42.0)
            z_val = max(0.0025, z_val + ripple + 0.0065)

            row.append(bm_c.verts.new((cx, cy, z_val)))
        grid.append(row)

    for j in range(ny):
        for i in range(nx):
            v00 = grid[j][i]
            v10 = grid[j][i + 1]
            v11 = grid[j + 1][i + 1]
            v01 = grid[j + 1][i]
            f = bm_c.faces.new((v00, v10, v11, v01))
            uvs = [
                (i / nx, j / ny),
                ((i + 1) / nx, j / ny),
                ((i + 1) / nx, (j + 1) / ny),
                (i / nx, (j + 1) / ny),
            ]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_l].uv = uv

    # Give the cloth subtle thickness (1.5 mm) so both sides render cleanly in Three.js!
    bmesh.ops.recalc_face_normals(bm_c, faces=bm_c.faces)
    m_c = bpy.data.meshes.new("ChallahCover")
    bm_c.to_mesh(m_c)
    bm_c.free()
    cover_obj = bpy.data.objects.new("ChallahCover", m_c)
    bpy.context.collection.objects.link(cover_obj)
    sol = cover_obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.0022
    sol.offset = 1.0
    bpy.context.view_layer.objects.active = cover_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    set_smooth(cover_obj, 50.0)
    cover_obj.data.materials.append(mat_cover)
    # Keep ChallahCover + tassels as a separate named object ("Challah_Cover_Group") so clicking the challah
    # smoothly lifts/uncovers the embroidered cover to reveal the braided golden challah loaf underneath!
    cover_parts = [cover_obj]
    for ci, cj in [(0, 0), (nx, 0), (0, ny), (nx, ny)]:
        co = cover_obj.data.vertices[cj * (nx + 1) + ci].co
        t_pts = [
            Vector((co.x, co.y, co.z)),
            Vector((co.x + (0.010 if ci == nx else -0.010), co.y + (0.008 if cj == ny else -0.008), max(0.002, co.z - 0.008))),
        ]
        cover_parts.append(create_tube_along_points(f"Tassel_{ci}_{cj}", t_pts, radii=[0.0022, 0.0042], radial_segs=10, mat=mat_tassel))

    join_objects(parts, "Challah_Loaf_Board")
    join_objects(cover_parts, "Challah_Cover_Group")
    export_glb(os.path.join(MODELS_DIR, "challah.glb"))

    render_previews(
        "challah",
        views=[("three_quarter", (0.28, -0.34, 0.26), 48.0)],
        target=(0.0, 0.0, 0.045),
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


def main():
    build_sufganiyot()
    build_kiddush_cup()
    build_challah_and_cover()
    build_table_accents_and_stars()


if __name__ == "__main__":
    main()

"""Build the warm lived-in Hanukkah room shell + solid walnut dining table with runner, and bake Cycles GI/AO lightmaps to JPG.

Exports:
- assets/models/table.glb + assets/textures/table_lightmap.jpg (UVMap_Light as TEXCOORD_1)
- assets/models/room.glb  + assets/textures/room_lightmap.jpg  (UVMap_Light as TEXCOORD_1)
- Multi-angle preview renders in /tmp/hanukkah_previews/
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
    PREVIEWS_DIR,
    reset_scene,
    set_smooth,
    make_pbr_material,
    create_lathe_mesh,
    create_tube_along_points,
    join_objects,
    export_glb,
)


def make_box(name, cx, cy, cz, sx, sy, sz, mat, uv_scale=1.0, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * sx + cx
        v.co.y = v.co.y * sy + cy
        v.co.z = v.co.z * sz + cz
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES', clamp_overlap=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv_layer = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        n = f.normal
        for loop in f.loops:
            co = loop.vert.co
            if abs(n.z) > 0.7:
                u, v = co.x * uv_scale, co.y * uv_scale
            elif abs(n.x) > 0.7:
                u, v = co.y * uv_scale, co.z * uv_scale
            else:
                u, v = co.x * uv_scale, co.z * uv_scale
            loop[uv_layer].uv = (u, v)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if bevel > 0.0:
        set_smooth(obj, 36.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def bake_lightmap_for_object(obj, out_jpg_path, res=1024, samples=32, lights=None):
    """Create non-overlapping UVMap_Light (TEXCOORD_1) on obj and bake Cycles combined diffuse/AO lightmap to JPG."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 3

    # Add second UV channel for lightmap
    mesh = obj.data
    if "UVMap" not in mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    if "UVMap_Light" not in mesh.uv_layers:
        lm_uv = mesh.uv_layers.new(name="UVMap_Light")
    else:
        lm_uv = mesh.uv_layers["UVMap_Light"]
    mesh.uv_layers.active = lm_uv

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.025)
    bpy.ops.object.mode_set(mode='OBJECT')

    # Create target bake image
    bake_img = bpy.data.images.new("BakeLightmap", width=res, height=res, alpha=False)
    bake_img.colorspace_settings.name = 'sRGB'

    # Temporarily attach Image Texture node referencing bake_img to every material on obj
    temp_nodes = []
    for mat in mesh.materials:
        if mat is None or not mat.use_nodes:
            continue
        nt = mat.node_tree
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = bake_img
        node.location = (-400, -500)
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node
        temp_nodes.append((nt, node))

    # Set up temporary baking world & lights
    world = bpy.data.worlds.new("BakeWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.16, 0.14, 0.16, 1.0)
        bg.inputs["Strength"].default_value = 0.55

    temp_lights = []
    for lname, ltype, loc, energy, col, size in (lights or []):
        ld = bpy.data.lights.new(lname, type=ltype)
        ld.energy = energy
        ld.color = col
        if ltype == 'AREA':
            ld.size = size
        elif ltype == 'POINT':
            ld.shadow_soft_size = size
        lo = bpy.data.objects.new(lname, ld)
        lo.location = loc
        scene.collection.objects.link(lo)
        temp_lights.append(lo)

    # Bake Diffuse Indirect + Direct (GI + soft AO) cleanly without specular/albedo color!
    scene.render.bake.use_pass_direct = True
    scene.render.bake.use_pass_indirect = True
    scene.render.bake.use_pass_color = False
    scene.render.bake.margin = 8
    bpy.ops.object.bake(type='DIFFUSE')

    # Save lightmap as optimized JPEG
    bake_img.filepath_raw = out_jpg_path
    bake_img.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    bake_img.save()
    print(f"[bake] wrote lightmap {out_jpg_path} ({os.path.getsize(out_jpg_path) / 1024:.1f} KB)")

    # Clean up temp bake nodes & lights; restore UVMap as active for rendering while keeping UVMap_Light as 2nd UV!
    for nt, node in temp_nodes:
        nt.nodes.remove(node)
    for lo in temp_lights:
        bpy.data.objects.remove(lo, do_unlink=True)
    scene.world = None
    mesh.uv_layers.active = mesh.uv_layers["UVMap"]


def build_dining_table():
    """Build solid walnut dining table (1.70 x 0.95 m, top at Z = 0.760 m) + embroidered table runner."""
    reset_scene()

    mat_walnut = make_pbr_material(
        "TableWalnut",
        metallic=0.0,
        roughness=0.34,
        coat=0.22,
        coat_roughness=0.24,
        color_tex_path=os.path.join(TEXTURES_DIR, "walnut_albedo.jpg"),
        rough_tex_path=os.path.join(TEXTURES_DIR, "walnut_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "walnut_normal.png"),
        bump_strength=0.35,
    )
    mat_walnut_dark = make_pbr_material(
        "TableWalnutDark",
        base_color=(0.14, 0.08, 0.045, 1.0),
        metallic=0.0,
        roughness=0.42,
        color_tex_path=os.path.join(TEXTURES_DIR, "walnut_albedo.jpg"),
    )
    mat_runner = make_pbr_material(
        "EmbroideredTableRunner",
        metallic=0.06,
        roughness=0.72,
        color_tex_path=os.path.join(TEXTURES_DIR, "runner_albedo.jpg"),
    )

    wood_parts = []
    # Tabletop: 1.70 m wide (X), 0.95 m deep (Y), thickness 0.036 m -> top sits at exact Z = 0.760 m!
    top = make_box("TableTop", 0.0, 0.0, 0.760 - 0.018, 1.70, 0.95, 0.036, mat_walnut, uv_scale=0.65, bevel=0.008)
    wood_parts.append(top)

    # Recessed wooden apron skirt under tabletop
    apron_z = 0.724 - 0.042
    wood_parts.append(make_box("ApronFront", 0.0, -0.405, apron_z, 1.48, 0.026, 0.084, mat_walnut_dark, uv_scale=0.8, bevel=0.003))
    wood_parts.append(make_box("ApronBack", 0.0, 0.405, apron_z, 1.48, 0.026, 0.084, mat_walnut_dark, uv_scale=0.8, bevel=0.003))
    wood_parts.append(make_box("ApronLeft", -0.735, 0.0, apron_z, 0.026, 0.80, 0.084, mat_walnut_dark, uv_scale=0.8, bevel=0.003))
    wood_parts.append(make_box("ApronRight", 0.735, 0.0, apron_z, 0.026, 0.80, 0.084, mat_walnut_dark, uv_scale=0.8, bevel=0.003))

    # Four turned walnut legs (Z = 0.000 .. 0.725)
    leg_prof = [
        (0.020, 0.000),
        (0.024, 0.018),
        (0.018, 0.036),
        (0.026, 0.070),
        (0.022, 0.110),
        (0.029, 0.460),
        (0.036, 0.560),
        (0.028, 0.610),
        (0.038, 0.640),
        (0.038, 0.726),
    ]
    for sx in (-0.735, 0.735):
        for sy in (-0.395, 0.395):
            leg = create_lathe_mesh(f"TableLeg_{sx:.2f}_{sy:.2f}", leg_prof, segments=28, cap_bottom=True, cap_top=True, mat=mat_walnut_dark)
            leg.location = (sx, sy, 0.0)
            # Quick UV for legs
            bm = bmesh.new()
            bm.from_mesh(leg.data)
            uv_l = bm.loops.layers.uv.new("UVMap")
            for f in bm.faces:
                for loop in f.loops:
                    co = loop.vert.co
                    loop[uv_l].uv = (math.atan2(co.y, co.x) * 0.3 + 0.5, co.z * 1.2)
            bm.to_mesh(leg.data)
            bm.free()
            wood_parts.append(leg)

    table_wood = join_objects(wood_parts, "DiningTable_Wood")

    # Embroidered blue/white/silver table runner draping smoothly over both X ends!
    # Flat along tabletop X in [-0.85, +0.85] at Z = 0.763 m, draping smoothly down ends to Z = 0.61 m
    nx, ny = 64, 16
    bm_r = bmesh.new()
    uv_l = bm_r.loops.layers.uv.new("UVMap")
    grid = []
    half_y = 0.185  # 37 cm wide runner!
    for j in range(ny + 1):
        vt = j / ny
        ry = -half_y + vt * (2 * half_y)
        row = []
        for i in range(nx + 1):
            ut = i / nx
            # Parametric arc length s along runner: total length 2.04 m (1.70 top + 0.17 drape each side)
            s = (ut - 0.5) * 2.04
            abs_s = abs(s)
            sgn = 1.0 if s >= 0 else -1.0
            if abs_s <= 0.842:
                rx = s
                rz = 0.7630
            elif abs_s <= 0.862:
                # Smooth quarter-round curve over beveled table edge!
                ang = ((abs_s - 0.842) / 0.020) * (math.pi / 2.0)
                rx = sgn * (0.842 + 0.013 * math.sin(ang))
                rz = 0.7500 + 0.013 * math.cos(ang)
            else:
                drop = abs_s - 0.862
                # Gentle natural fabric sway on hanging end flap
                wave = 0.004 * math.sin(vt * math.pi * 4.0) * min(1.0, drop / 0.12)
                rx = sgn * (0.855 + wave)
                rz = 0.7500 - drop
            row.append(bm_r.verts.new((rx, ry, rz)))
        grid.append(row)

    for j in range(ny):
        for i in range(nx):
            f = bm_r.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            uvs = [
                (i / nx, j / ny),
                ((i + 1) / nx, j / ny),
                ((i + 1) / nx, (j + 1) / ny),
                (i / nx, (j + 1) / ny),
            ]
            for loop, uv in zip(f.loops, uvs):
                loop[uv_l].uv = uv

    bmesh.ops.recalc_face_normals(bm_r, faces=bm_r.faces)
    mr = bpy.data.meshes.new("TableRunner")
    bm_r.to_mesh(mr)
    bm_r.free()
    runner_obj = bpy.data.objects.new("TableRunner", mr)
    bpy.context.collection.objects.link(runner_obj)
    sol = runner_obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.0018
    sol.offset = -1.0  # thickness goes downward toward table so top surface stays at exact Z = 0.763!
    bpy.context.view_layer.objects.active = runner_obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    set_smooth(runner_obj, 45.0)
    runner_obj.data.materials.append(mat_runner)

    # Bake GI/AO lightmap onto Table Wood
    bake_lightmap_for_object(
        table_wood,
        os.path.join(TEXTURES_DIR, "table_lightmap.jpg"),
        res=1024,
        samples=32,
        lights=[
            ("BakeWarmCenter", 'POINT', (0.0, 0.0, 1.25), 55.0, (1.0, 0.80, 0.56), 0.35),
            ("BakeCoolWindow", 'AREA', (0.0, 1.5, 1.5), 30.0, (0.55, 0.72, 1.0), 1.4),
        ],
    )

    export_glb(os.path.join(MODELS_DIR, "table.glb"))


def build_curtain_panel(name, x_center, y_pos, z_bot, z_top, width, mat, tie_side=1.0):
    """Build a richly pleated royal-blue velvet curtain panel gathered gently with a tieback."""
    nx, nz = 28, 30
    bm = bmesh.new()
    uv_l = bm.loops.layers.uv.new("UVMap")
    grid = []
    for j in range(nz + 1):
        vt = j / nz
        z = z_bot + vt * (z_top - z_bot)
        # Graceful hourglass cinch around tieback height (vt ~ 0.38)
        cinch = math.exp(-((vt - 0.36) / 0.16) ** 2)
        w_local = width * (1.0 - 0.36 * cinch)
        shift_x = tie_side * 0.075 * cinch
        row = []
        for i in range(nx + 1):
            ut = i / nx
            # Deep vertical velvet drapery folds
            pleat = 0.042 * math.sin(ut * math.pi * 7.0) * (0.75 + 0.25 * (1.0 - vt))
            x = x_center + shift_x + (ut - 0.5) * w_local
            y = y_pos + pleat - 0.015 * cinch
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)

    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
            for loop, uv in zip(
                f.loops,
                [(i / nx, j / nz), ((i + 1) / nx, j / nz), ((i + 1) / nx, (j + 1) / nz), (i / nx, (j + 1) / nz)],
            ):
                loop[uv_l].uv = uv

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    sol = obj.modifiers.new("Solidify", 'SOLIDIFY')
    sol.thickness = 0.006
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier="Solidify")
    set_smooth(obj, 55.0)
    obj.data.materials.append(mat)
    return obj


def make_profile_molding(name, p_start, p_end, profile_out_z, normal_dir, mat, cap_ends=True):
    """Extrude a true multi-stepped carved architectural molding profile [(out_depth, z_height), ...]
    along a straight line from p_start (x0, y0) to p_end (x1, y1), projecting outward along normal_dir (nx, ny).
    Produces crisp classical ogee/cyma/bead/cove profiles with real depth and shadow!
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    p0 = Vector((p_start[0], p_start[1], 0.0))
    p1 = Vector((p_end[0], p_end[1], 0.0))
    nvec = Vector((normal_dir[0], normal_dir[1], 0.0)).normalized()
    length = (p1 - p0).length

    ring0 = []
    ring1 = []
    for out_d, z_h in profile_out_z:
        v0 = p0 + nvec * out_d + Vector((0.0, 0.0, z_h))
        v1 = p1 + nvec * out_d + Vector((0.0, 0.0, z_h))
        ring0.append(bm.verts.new(v0))
        ring1.append(bm.verts.new(v1))

    n_p = len(profile_out_z)
    for j in range(n_p):
        jn = (j + 1) % n_p
        f = bm.faces.new((ring0[j], ring1[j], ring1[jn], ring0[jn]))
        v0 = j / float(n_p)
        v1 = (j + 1) / float(n_p)
        for loop, uv in zip(f.loops, [(0.0, v0), (length, v0), (length, v1), (0.0, v1)]):
            loop[uv_layer].uv = uv

    if cap_ends and n_p >= 3:
        bm.faces.new(list(reversed(ring0)))
        bm.faces.new(ring1)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 34.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def make_bolection_panel_frame(name, center_xyz, width, height, wall_axis, normal_sign, mat):
    """Build a genuine 3D mitered classical picture-frame bolection molding around a recessed wainscot bay!
    wall_axis: 'Y' (panel lies on X-Z plane, projects along Y*normal_sign) or 'X' (lies on Y-Z plane, projects along X*normal_sign).
    """
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    cx, cy, cz = center_xyz
    hw, hh = width * 0.5, height * 0.5

    # Classical 7-point stepped bolection molding profile [(inset_from_outer, projection_depth)]
    profile = [
        (0.000, 0.000),  # flush back against wainscot
        (0.000, 0.012),  # crisp outer step
        (0.009, 0.017),  # raised outer bead crest
        (0.017, 0.012),  # ogee hollow
        (0.024, 0.021),  # bold projecting bolection nose!
        (0.032, 0.017),  # inner beveled slope
        (0.038, 0.006),  # shadow rabbet meeting recessed panel
        (0.038, 0.000),
    ]

    signs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    rings = []
    for inset, proj in profile:
        ring = []
        for s_u, s_z in signs:
            u_off = s_u * (hw - inset)
            z_off = s_z * (hh - inset)
            if wall_axis == 'Y':
                pt = Vector((cx + u_off, cy + normal_sign * proj, cz + z_off))
            else:
                pt = Vector((cx + normal_sign * proj, cy + u_off, cz + z_off))
            ring.append(bm.verts.new(pt))
        rings.append(ring)

    n_p = len(rings)
    for j in range(n_p):
        jn = (j + 1) % n_p
        r0, r1 = rings[j], rings[jn]
        for c in range(4):
            cn = (c + 1) % 4
            f = bm.faces.new((r0[c], r0[cn], r1[cn], r1[c]))
            for loop in f.loops:
                loop[uv_layer].uv = (0.5, 0.5)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 34.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def make_fluted_casing(name, x_center, y_wall, z_bot, z_top, width, depth, mat):
    """Build a vertical classical fluted window casing pilaster with 3 crisp vertical concave flutes + outer stepped beads."""
    # Cross section across X (width) and outward -Y (depth)
    hw = width * 0.5
    xs_prof = [
        (-hw, 0.000),
        (-hw, depth * 0.58),
        (-hw + 0.010, depth * 0.85),  # outer backband bead
        (-hw + 0.018, depth * 0.78),
        (-hw + 0.022, depth * 0.96),  # raised fillet before flute 1
        (-hw + 0.027, depth * 0.62),  # flute 1 trough
        (-hw + 0.032, depth * 0.96),  # ridge 1-2
        (-0.006, depth * 0.96),
        (0.000, depth * 0.60),        # center flute 2 trough
        (0.006, depth * 0.96),        # ridge 2-3
        (hw - 0.032, depth * 0.96),
        (hw - 0.027, depth * 0.62),   # flute 3 trough
        (hw - 0.022, depth * 0.96),   # inner fillet
        (hw - 0.012, depth * 0.82),
        (hw, depth * 0.68),
        (hw, 0.000),
    ]
    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new("UVMap")
    r0 = [bm.verts.new((x_center + dx, y_wall - dy, z_bot)) for dx, dy in xs_prof]
    r1 = [bm.verts.new((x_center + dx, y_wall - dy, z_top)) for dx, dy in xs_prof]
    n_p = len(xs_prof)
    for j in range(n_p):
        jn = (j + 1) % n_p
        f = bm.faces.new((r0[j], r0[jn], r1[jn], r1[j]))
        for loop in f.loops:
            loop[uv_layer].uv = (j / n_p, 0.5)
    bm.faces.new(list(reversed(r0)))
    bm.faces.new(r1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 34.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def make_rosette_corner_block(name, cx, y_wall, cz, size, depth, mat):
    """Build a square classical corner rosette block with sculpted circular concentric floral rings."""
    parts = [make_box(name + "_Blk", cx, y_wall - depth * 0.5, cz, size, depth, size, mat, bevel=0.004)]
    # Carved circular concentric rosette boss on the front face (-Y)
    prof = [
        (size * 0.38, 0.000),
        (size * 0.36, 0.005),
        (size * 0.29, 0.008),
        (size * 0.24, 0.004),
        (size * 0.18, 0.010),
        (size * 0.11, 0.006),
        (size * 0.07, 0.011),
        (0.001, 0.012),
    ]
    ros = create_lathe_mesh(name + "_Ros", prof, segments=32, cap_bottom=True, cap_top=True, flute_amp=0.0015, flute_count=12, flute_z_range=(0.003, 0.009), mat=mat)
    ros.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    ros.location = (cx, y_wall - depth + 0.001, cz)
    parts.append(ros)
    return join_objects(parts, name)


def build_room():
    """Build the warm lived-in Hanukkah room shell with classic herringbone oak parquet floor
    and ornate carved classical architectural moldings (crown+dentils, baseboards, chair rail,
    bolection wainscot panels, fluted window casings with corner rosettes & pediment header)."""
    reset_scene()

    W_HALF = 2.80
    Y_WIN = 2.20   # -> Three.js Z = -2.20
    Y_BACK = -2.60  # -> Three.js Z = +2.60
    H_CEIL = 2.90

    # Materials
    mat_floor = make_pbr_material(
        "HerringboneOakParquet",
        metallic=0.0,
        roughness=0.34,
        coat=0.18,
        coat_roughness=0.22,
        color_tex_path=os.path.join(TEXTURES_DIR, "floor_albedo.jpg"),
        rough_tex_path=os.path.join(TEXTURES_DIR, "floor_rough.jpg"),
        bump_tex_path=os.path.join(TEXTURES_DIR, "floor_normal.png"),
        bump_strength=0.85,
    )
    mat_rug = make_pbr_material(
        "WovenHanukkahRug",
        metallic=0.0,
        roughness=0.88,
        color_tex_path=os.path.join(TEXTURES_DIR, "rug_albedo.jpg"),
    )
    mat_wall_cream = make_pbr_material(
        "WarmPlasterWall",
        base_color=(0.76, 0.73, 0.68, 1.0),
        metallic=0.0,
        roughness=0.86,
    )
    mat_wall_navy = make_pbr_material(
        "TwilightBlueAccentWall",
        base_color=(0.11, 0.16, 0.28, 1.0),
        metallic=0.0,
        roughness=0.82,
    )
    mat_trim_white = make_pbr_material(
        "CreamWainscotTrim",
        base_color=(0.89, 0.875, 0.84, 1.0),
        metallic=0.0,
        roughness=0.38,
        coat=0.12,
        coat_roughness=0.25,
    )
    mat_ceiling = make_pbr_material(
        "PlasterCeiling",
        base_color=(0.84, 0.82, 0.78, 1.0),
        metallic=0.0,
        roughness=0.90,
    )
    mat_curtain = make_pbr_material(
        "RoyalVelvetCurtain",
        base_color=(0.06, 0.14, 0.36, 1.0),
        metallic=0.02,
        roughness=0.82,
    )
    mat_silver = make_pbr_material(
        "BrushedSilverHardware",
        base_color=(0.90, 0.92, 0.95, 1.0),
        metallic=0.95,
        roughness=0.22,
    )
    mat_walnut = make_pbr_material(
        "SideboardWalnut",
        metallic=0.0,
        roughness=0.38,
        color_tex_path=os.path.join(TEXTURES_DIR, "walnut_albedo.jpg"),
    )
    mat_sconce_shade = make_pbr_material(
        "WarmLinenShade",
        base_color=(0.98, 0.92, 0.80, 1.0),
        roughness=0.65,
        emission=(1.0, 0.74, 0.38, 1.0),
        emission_strength=1.35,
    )
    mat_window_glass = make_pbr_material(
        "WindowGlass",
        base_color=(0.76, 0.86, 1.0, 1.0),
        metallic=0.08,
        roughness=0.06,
        alpha=0.14,
    )

    static_arch = []

    # 1. Classic Herringbone Oak Parquet Floor (scaled cleanly at 0.85 repeats/m -> crisp real-world ~8cm x 32cm parquet blocks!) & Ceiling
    static_arch.append(make_box("Floor", 0.0, (Y_WIN + Y_BACK) * 0.5, -0.02, W_HALF * 2, Y_WIN - Y_BACK, 0.04, mat_floor, uv_scale=0.85))
    static_arch.append(make_box("Ceiling", 0.0, (Y_WIN + Y_BACK) * 0.5, H_CEIL + 0.02, W_HALF * 2, Y_WIN - Y_BACK, 0.04, mat_ceiling, uv_scale=0.4))

    # 2. Side walls & Rear wall
    static_arch.append(make_box("WallLeft", -W_HALF - 0.04, (Y_WIN + Y_BACK) * 0.5, H_CEIL * 0.5, 0.08, Y_WIN - Y_BACK, H_CEIL, mat_wall_cream, uv_scale=0.4))
    static_arch.append(make_box("WallRight", W_HALF + 0.04, (Y_WIN + Y_BACK) * 0.5, H_CEIL * 0.5, 0.08, Y_WIN - Y_BACK, H_CEIL, mat_wall_cream, uv_scale=0.4))
    static_arch.append(make_box("WallBehindCam", 0.0, Y_BACK - 0.04, H_CEIL * 0.5, W_HALF * 2, 0.08, H_CEIL, mat_wall_cream, uv_scale=0.4))

    # 3. Back Window Wall (Y = +2.20 -> Three.js Z = -2.20) in deep twilight navy-blue accent with true rectangular opening
    wx = 0.95
    wz0, wz1 = 0.85, 2.45
    wall_t = 0.20
    yc = Y_WIN + wall_t * 0.5
    left_w = W_HALF - wx
    static_arch.append(make_box("WinWallLeft", -(wx + left_w * 0.5), yc, H_CEIL * 0.5, left_w, wall_t, H_CEIL, mat_wall_navy, uv_scale=0.4))
    static_arch.append(make_box("WinWallRight", (wx + left_w * 0.5), yc, H_CEIL * 0.5, left_w, wall_t, H_CEIL, mat_wall_navy, uv_scale=0.4))
    static_arch.append(make_box("WinWallBottom", 0.0, yc, wz0 * 0.5, wx * 2.0, wall_t, wz0, mat_wall_navy, uv_scale=0.4))
    top_h = H_CEIL - wz1
    static_arch.append(make_box("WinWallTop", 0.0, yc, wz1 + top_h * 0.5, wx * 2.0, wall_t, top_h, mat_wall_navy, uv_scale=0.4))

    # 4. CLASSICAL CARVED ARCHITECTURAL MILLWORK & PROFILED MOLDINGS
    # Wainscot lower wood backing (Z = 0.0 .. 0.87 on window wall, 0.0 .. 0.90 on side walls)
    static_arch.append(make_box("WainscotWin", 0.0, Y_WIN - 0.010, 0.43, W_HALF * 2, 0.020, 0.86, mat_trim_white, uv_scale=0.5))
    static_arch.append(make_box("WainscotLeft", -W_HALF + 0.010, (Y_WIN + Y_BACK) * 0.5, 0.45, 0.020, Y_WIN - Y_BACK, 0.90, mat_trim_white, uv_scale=0.5))
    static_arch.append(make_box("WainscotRight", W_HALF - 0.010, (Y_WIN + Y_BACK) * 0.5, 0.45, 0.020, Y_WIN - Y_BACK, 0.90, mat_trim_white, uv_scale=0.5))

    # A. Tall Multi-Stepped Georgian Baseboards (quarter-round shoe + plinth + ogee cap!)
    baseboard_prof = [
        (0.000, 0.000),
        (0.036, 0.000),  # shoe molding base
        (0.036, 0.012),
        (0.026, 0.024),  # quarter-round shoe curve
        (0.024, 0.115),  # tall vertical plinth
        (0.029, 0.125),  # lower bead
        (0.022, 0.136),  # recessed cove
        (0.026, 0.148),  # ogee crest
        (0.012, 0.160),  # top bevel
        (0.000, 0.165),
    ]
    static_arch.append(make_profile_molding("BaseboardWin", (-W_HALF, Y_WIN - 0.020), (W_HALF, Y_WIN - 0.020), baseboard_prof, (0, -1), mat_trim_white))
    static_arch.append(make_profile_molding("BaseboardLeft", (-W_HALF + 0.020, Y_BACK), (-W_HALF + 0.020, Y_WIN), baseboard_prof, (1, 0), mat_trim_white))
    static_arch.append(make_profile_molding("BaseboardRight", (W_HALF - 0.020, Y_WIN), (W_HALF - 0.020, Y_BACK), baseboard_prof, (-1, 0), mat_trim_white))

    # B. Sculpted 9-Point Classical Chair Rail (cove + projecting bullnose + ogee lip!)
    def chair_rail_prof(z_base):
        return [
            (0.000, z_base + 0.000),
            (0.018, z_base + 0.004),
            (0.026, z_base + 0.012),  # lower bead
            (0.020, z_base + 0.020),  # cove shadow line
            (0.038, z_base + 0.030),  # bold projecting bullnose!
            (0.040, z_base + 0.042),
            (0.032, z_base + 0.052),  # ogee step
            (0.022, z_base + 0.060),
            (0.010, z_base + 0.068),
            (0.000, z_base + 0.072),
        ]

    static_arch.append(make_profile_molding("ChairRailWin", (-W_HALF, Y_WIN - 0.020), (W_HALF, Y_WIN - 0.020), chair_rail_prof(0.815), (0, -1), mat_trim_white))
    static_arch.append(make_profile_molding("ChairRailLeft", (-W_HALF + 0.020, Y_BACK), (-W_HALF + 0.020, Y_WIN), chair_rail_prof(0.86), (1, 0), mat_trim_white))
    static_arch.append(make_profile_molding("ChairRailRight", (W_HALF - 0.020, Y_WIN), (W_HALF - 0.020, Y_BACK), chair_rail_prof(0.86), (-1, 0), mat_trim_white))

    # C. Ornate Classical Crown Molding (Cyma Recta + Cove + Fillet) + Carved 3D Dentil Blocks!
    crown_prof = [
        (0.000, H_CEIL - 0.145),
        (0.016, H_CEIL - 0.142),
        (0.024, H_CEIL - 0.132),  # lower astragal bead
        (0.018, H_CEIL - 0.122),
        (0.032, H_CEIL - 0.105),  # dentil bed fascia
        (0.038, H_CEIL - 0.088),
        (0.062, H_CEIL - 0.062),  # sweeping cyma-recta ogee curve!
        (0.095, H_CEIL - 0.036),
        (0.118, H_CEIL - 0.016),  # top corona projection
        (0.122, H_CEIL),
        (0.000, H_CEIL),
    ]
    static_arch.append(make_profile_molding("CrownWin", (-W_HALF, Y_WIN), (W_HALF, Y_WIN), crown_prof, (0, -1), mat_trim_white))
    static_arch.append(make_profile_molding("CrownLeft", (-W_HALF, Y_BACK), (-W_HALF, Y_WIN), crown_prof, (1, 0), mat_trim_white))
    static_arch.append(make_profile_molding("CrownRight", (W_HALF, Y_WIN), (W_HALF, Y_BACK), crown_prof, (-1, 0), mat_trim_white))

    # Rhythmic row of carved 3D dentil blocks tucked beneath the crown corona along the window wall & side walls!
    dentil_bm = bmesh.new()
    dentil_z = H_CEIL - 0.098
    # Window wall dentils
    x_d = -W_HALF + 0.14
    while x_d <= W_HALF - 0.14:
        bmesh.ops.create_cube(dentil_bm, size=1.0, matrix=Matrix.Translation((x_d, Y_WIN - 0.044, dentil_z)) @ Matrix.Diagonal((0.024, 0.028, 0.030, 1.0)))
        x_d += 0.056
    # Side wall dentils
    y_d = Y_BACK + 0.14
    while y_d <= Y_WIN - 0.14:
        bmesh.ops.create_cube(dentil_bm, size=1.0, matrix=Matrix.Translation((-W_HALF + 0.044, y_d, dentil_z)) @ Matrix.Diagonal((0.028, 0.024, 0.030, 1.0)))
        bmesh.ops.create_cube(dentil_bm, size=1.0, matrix=Matrix.Translation((W_HALF - 0.044, y_d, dentil_z)) @ Matrix.Diagonal((0.028, 0.024, 0.030, 1.0)))
        y_d += 0.056
    dm = bpy.data.meshes.new("CrownDentils")
    dentil_bm.to_mesh(dm)
    dentil_bm.free()
    dentil_obj = bpy.data.objects.new("CrownDentils", dm)
    bpy.context.collection.objects.link(dentil_obj)
    dentil_obj.data.materials.append(mat_trim_white)
    static_arch.append(dentil_obj)

    # D. True 3D Mitered Bolection Wainscoting Panels (sculpted depth & shadow — NEVER flat boxes!)
    # Window wall wainscot bays (6 evenly proportioned bays)
    for idx_p, (px, pw) in enumerate([(-2.22, 0.72), (-1.36, 0.62), (-0.48, 0.76), (0.48, 0.76), (1.36, 0.62), (2.22, 0.72)]):
        static_arch.append(make_bolection_panel_frame(f"WainBolection_Win_{idx_p}", (px, Y_WIN - 0.020, 0.49), pw, 0.52, 'Y', -1.0, mat_trim_white))
        # Subtle nested inner bead rectangle inside each bolection bay for double-stepped European millwork depth!
        static_arch.append(make_bolection_panel_frame(f"WainInner_Win_{idx_p}", (px, Y_WIN - 0.020, 0.49), pw - 0.12, 0.40, 'Y', -1.0, mat_trim_white))

    # Side walls bolection wainscot panels
    for idx_s, py in enumerate([-1.85, -0.95, -0.05, 0.85, 1.65]):
        static_arch.append(make_bolection_panel_frame(f"WainBolection_L_{idx_s}", (-W_HALF + 0.020, py, 0.51), 0.72, 0.54, 'X', 1.0, mat_trim_white))
        static_arch.append(make_bolection_panel_frame(f"WainBolection_R_{idx_s}", (W_HALF - 0.020, py, 0.51), 0.72, 0.54, 'X', -1.0, mat_trim_white))

    # Upper wall decorative classical gallery molding frames flanking the window (around Rebbe portrait & Star of David!)
    for sgn_w, tag in [(-1.0, "L"), (1.0, "R")]:
        static_arch.append(make_bolection_panel_frame(f"UpperWallFrame_{tag}", (sgn_w * 1.94, Y_WIN - 0.002, 1.56), 0.82, 1.12, 'Y', -1.0, mat_trim_white))

    # 5. FLUTED CLASSICAL WINDOW TRIM, ROSETTE CORNER BLOCKS, PEDIMENT HEADER & PROFILED SILL
    # Profiled bullnose & cove windowsill ledge (cleanly clear of curtains!)
    sill_prof = [
        (-0.22, wz0 - 0.052),
        (-0.22, wz0 - 0.002),
        (0.055, wz0 - 0.002),  # flat sill top
        (0.068, wz0 - 0.008),  # rounded bullnose edge!
        (0.068, wz0 - 0.024),
        (0.054, wz0 - 0.032),  # underside drip cove
        (0.036, wz0 - 0.038),  # apron molding step!
        (0.036, wz0 - 0.064),
        (0.022, wz0 - 0.074),  # lower apron ogee
        (0.000, wz0 - 0.080),
    ]
    static_arch.append(make_profile_molding("WindowSillProfiled", (-wx - 0.08, Y_WIN), (wx + 0.08, Y_WIN), sill_prof, (0, -1), mat_trim_white))

    # Decorative carved sill corbel brackets tucked beneath left & right sill ends
    for sx in (-wx - 0.02, wx + 0.02):
        static_arch.append(make_box(f"SillCorbel_{sx:.2f}", sx, Y_WIN - 0.028, wz0 - 0.092, 0.048, 0.044, 0.055, mat_trim_white, bevel=0.008))

    # Fluted Classical Vertical Window Casings (3 deep vertical flutes!) resting on plinth blocks
    casing_w = 0.105
    casing_d = 0.042
    static_arch.append(make_fluted_casing("WinCasingFluted_L", -wx - casing_w * 0.5 + 0.006, Y_WIN, wz0 + 0.002, wz1 - 0.002, casing_w, casing_d, mat_trim_white))
    static_arch.append(make_fluted_casing("WinCasingFluted_R", wx + casing_w * 0.5 - 0.006, Y_WIN, wz0 + 0.002, wz1 - 0.002, casing_w, casing_d, mat_trim_white))

    # Sculpted Classical Corner Rosette Blocks at upper-left & upper-right of the window!
    static_arch.append(make_rosette_corner_block("WinRosette_L", -wx - casing_w * 0.5 + 0.006, Y_WIN, wz1 + 0.056, 0.118, 0.048, mat_trim_white))
    static_arch.append(make_rosette_corner_block("WinRosette_R", wx + casing_w * 0.5 - 0.006, Y_WIN, wz1 + 0.056, 0.118, 0.048, mat_trim_white))

    # Stepped Classical Architrave & Crown Pediment Header above the window!
    header_prof = [
        (0.000, wz1 + 0.002),
        (0.042, wz1 + 0.002),
        (0.044, wz1 + 0.026),  # lower architrave step
        (0.036, wz1 + 0.042),  # recessed frieze band
        (0.036, wz1 + 0.088),
        (0.052, wz1 + 0.102),  # stepped cornice fillet
        (0.072, wz1 + 0.122),  # projecting classical pediment cap!
        (0.078, wz1 + 0.136),
        (0.000, wz1 + 0.136),
    ]
    static_arch.append(make_profile_molding("WinPedimentHeader", (-wx - 0.135, Y_WIN), (wx + 0.135, Y_WIN), header_prof, (0, -1), mat_trim_white))

    # Inner sash jambs & stepped classical muntins
    static_arch.append(make_box("WinJambL", -wx + 0.022, Y_WIN + 0.11, (wz0 + wz1) * 0.5, 0.044, 0.20, wz1 - wz0, mat_trim_white))
    static_arch.append(make_box("WinJambR", wx - 0.022, Y_WIN + 0.11, (wz0 + wz1) * 0.5, 0.044, 0.20, wz1 - wz0, mat_trim_white))
    static_arch.append(make_box("WinJambTop", 0.0, Y_WIN + 0.11, wz1 - 0.022, wx * 2, 0.20, 0.044, mat_trim_white))
    for mx in (-0.34, 0.34):
        static_arch.append(make_box(f"MuntinV_{mx:.2f}", mx, Y_WIN + 0.14, (wz0 + wz1) * 0.5, 0.028, 0.038, wz1 - wz0, mat_trim_white, bevel=0.005))
    static_arch.append(make_box("MuntinH_Mid", 0.0, Y_WIN + 0.14, 1.72, wx * 2, 0.038, 0.032, mat_trim_white, bevel=0.005))

    # 6. Warm Walnut Sideboard along Right Wall
    sb_x, sb_y = 2.50, 0.42
    static_arch.append(make_box("SideboardBody", sb_x, sb_y, 0.45, 0.48, 1.44, 0.68, mat_walnut, uv_scale=0.6, bevel=0.006))
    static_arch.append(make_box("SideboardTop", sb_x, sb_y, 0.805, 0.52, 1.50, 0.034, mat_walnut, uv_scale=0.6, bevel=0.006))
    for lx in (sb_x - 0.20, sb_x + 0.20):
        for ly in (sb_y - 0.66, sb_y + 0.66):
            static_arch.append(make_box(f"SideboardLeg_{lx:.2f}_{ly:.2f}", lx, ly, 0.06, 0.045, 0.045, 0.12, mat_walnut))
    for dy in (-0.45, 0.0, 0.45):
        static_arch.append(make_box(f"SBDoor_{dy:.2f}", sb_x - 0.244, sb_y + dy, 0.45, 0.014, 0.38, 0.52, mat_walnut, bevel=0.004))

    # Join static architectural shell & bake Cycles GI/AO lightmap so every carved molding & dentil gets authentic soft AO!
    room_shell = join_objects(static_arch, "Room_Architecture")

    bake_lightmap_for_object(
        room_shell,
        os.path.join(TEXTURES_DIR, "room_lightmap.jpg"),
        res=1024,
        samples=36,
        lights=[
            ("BakeRoomWarm", 'POINT', (0.0, 0.35, 1.55), 115.0, (1.0, 0.78, 0.52), 0.55),
            ("BakeSconceL", 'POINT', (-1.58, 2.02, 1.72), 45.0, (1.0, 0.74, 0.42), 0.18),
            ("BakeSconceR", 'POINT', (1.58, 2.02, 1.72), 45.0, (1.0, 0.74, 0.42), 0.18),
            ("BakeSideboard", 'POINT', (2.42, 0.82, 1.15), 40.0, (1.0, 0.76, 0.44), 0.22),
            ("BakeMoon", 'AREA', (0.0, 2.85, 1.75), 75.0, (0.45, 0.64, 1.0), 1.6),
        ],
    )

    # 7. Woven Blue/White/Silver Hanukkah Area Rug centered under table (pulled slightly smaller 2.75 x 2.05m so MORE gorgeous herringbone oak parquet floor frames the rug!)
    rug = make_box("HanukkahRug", 0.0, 0.35, 0.004, 2.75, 2.00, 0.008, mat_rug, uv_scale=1.0, bevel=0.002)
    bm_rg = bmesh.new()
    bm_rg.from_mesh(rug.data)
    uv_rg = bm_rg.loops.layers.uv.active
    for f in bm_rg.faces:
        for loop in f.loops:
            co = loop.vert.co
            loop[uv_rg].uv = ((co.x + 1.375) / 2.75, (co.y - 0.35 + 1.00) / 2.00)
    bm_rg.to_mesh(rug.data)
    bm_rg.free()

    # 8. Draped Royal-Blue Velvet Curtains + Brushed Silver Curtain Rod & Finials (positioned cleanly outside fluted window casings & rosettes!)
    build_curtain_panel("Curtain_Left", -1.32, Y_WIN - 0.16, 0.03, 2.62, 0.56, mat_curtain, tie_side=-1.0)
    build_curtain_panel("Curtain_Right", 1.32, Y_WIN - 0.16, 0.03, 2.62, 0.56, mat_curtain, tie_side=1.0)

    rod_pts = [Vector((-1.72, Y_WIN - 0.17, 2.62)), Vector((1.72, Y_WIN - 0.17, 2.62))]
    create_tube_along_points("CurtainRod", rod_pts, radii=0.015, radial_segs=16, mat=mat_silver)
    for sx in (-1.76, 1.76):
        bm_f = bmesh.new()
        bmesh.ops.create_uvsphere(bm_f, u_segments=16, v_segments=12, radius=0.034, matrix=Matrix.Translation((sx, Y_WIN - 0.17, 2.62)))
        mf = bpy.data.meshes.new(f"RodFinial_{sx:.1f}")
        bm_f.to_mesh(mf)
        bm_f.free()
        fo = bpy.data.objects.new(f"RodFinial_{sx:.1f}", mf)
        bpy.context.collection.objects.link(fo)
        set_smooth(fo, 60.0)
        fo.data.materials.append(mat_silver)

    # 9. Twin Warm Brushed-Silver Wall Sconces flanking the window (X = +/-1.62, Y = 2.15, Z = 1.72)
    sconce_parts = []
    for sx in (-1.62, 1.62):
        plate = create_lathe_mesh(f"SconcePlate_{sx:.1f}", [(0.055, 0.0), (0.052, 0.012), (0.018, 0.016)], 28, mat=mat_silver)
        plate.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
        plate.location = (sx, Y_WIN - 0.015, 1.66)
        sconce_parts.append(plate)
        arm = create_tube_along_points(
            f"SconceArm_{sx:.1f}",
            [(sx, Y_WIN - 0.02, 1.66), (sx, Y_WIN - 0.12, 1.63), (sx, Y_WIN - 0.15, 1.70)],
            radii=0.007,
            radial_segs=10,
            mat=mat_silver,
        )
        sconce_parts.append(arm)
        shade = create_lathe_mesh(
            f"SconceShade_{sx:.1f}",
            [(0.068, 1.70), (0.048, 1.85), (0.045, 1.85), (0.065, 1.70)],
            32,
            cap_bottom=False,
            cap_top=False,
            mat=mat_sconce_shade,
        )
        shade.location = (sx, Y_WIN - 0.15, 0.0)
        sconce_parts.append(shade)

    # 10. Cozy Silver Table Lamp on the Sideboard (X = 2.48, Y = 0.85, Z = 0.822)
    lamp_base = create_lathe_mesh(
        "SideboardLampBase",
        [(0.075, 0.822), (0.072, 0.838), (0.045, 0.875), (0.082, 0.96), (0.078, 1.03), (0.028, 1.09), (0.014, 1.14)],
        36,
        mat=mat_silver,
    )
    lamp_base.location = (2.48, 0.88, 0.0)
    sconce_parts.append(lamp_base)
    lamp_shade = create_lathe_mesh(
        "SideboardLampShade",
        [(0.165, 1.10), (0.115, 1.32), (0.111, 1.32), (0.161, 1.10)],
        40,
        cap_bottom=False,
        cap_top=False,
        mat=mat_sconce_shade,
    )
    lamp_shade.location = (2.48, 0.88, 0.0)
    sconce_parts.append(lamp_shade)
    join_objects(sconce_parts, "Room_LightingFixtures")

    # 11. Subtle Window Glass Pane (separate mesh so Three.js can tune reflections cleanly)
    glass = make_box("Window_Glass", 0.0, Y_WIN + 0.15, (wz0 + wz1) * 0.5, wx * 2 - 0.04, 0.008, wz1 - wz0 - 0.04, mat_window_glass)

    export_glb(os.path.join(MODELS_DIR, "room.glb"))


def main():
    build_dining_table()
    build_room()
    print("[room_table] room.glb, table.glb, and baked lightmaps complete.")


if __name__ == "__main__":
    main()

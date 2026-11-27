"""Shared Blender headless modeling, procedural texture, preview render, and glTF export utilities."""

import json
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

REPO_ROOT = "/workspace"
MODELS_DIR = os.path.join(REPO_ROOT, "assets", "models")
TEXTURES_DIR = os.path.join(REPO_ROOT, "assets", "textures")
PREVIEWS_DIR = os.path.join(REPO_ROOT, "tmp", "previews")

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(TEXTURES_DIR, exist_ok=True)
os.makedirs(PREVIEWS_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    return scene


def set_smooth(obj, angle_deg=38.0):
    if obj.type != 'MESH':
        return
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    mesh.use_auto_smooth = True
    mesh.auto_smooth_angle = math.radians(angle_deg)


def ensure_uv(obj, method='SMART'):
    if obj.type != 'MESH':
        return
    mesh = obj.data
    if not mesh.uv_layers:
        mesh.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    if method == 'SMART':
        bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
    elif method == 'CUBE':
        bpy.ops.uv.cube_project(cube_size=1.0)
    bpy.ops.object.mode_set(mode='OBJECT')


def make_pbr_material(
    name,
    base_color=(0.8, 0.8, 0.8, 1.0),
    metallic=0.0,
    roughness=0.5,
    specular=0.5,
    coat=0.0,
    coat_roughness=0.1,
    emission=(0.0, 0.0, 0.0, 1.0),
    emission_strength=0.0,
    alpha=1.0,
    color_tex_path=None,
    rough_tex_path=None,
    bump_tex_path=None,
    bump_strength=0.15,
    uv_scale=(1.0, 1.0),
):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)

    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (250, 0)
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Specular"].default_value = specular
    if "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = coat
        bsdf.inputs["Clearcoat Roughness"].default_value = coat_roughness
    bsdf.inputs["Emission"].default_value = emission
    bsdf.inputs["Emission Strength"].default_value = emission_strength
    bsdf.inputs["Alpha"].default_value = alpha
    if alpha < 0.999:
        mat.blend_method = 'BLEND'

    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_coord = None
    mapping = None

    def get_mapping():
        nonlocal tex_coord, mapping
        if mapping is None:
            tex_coord = nt.nodes.new("ShaderNodeTexCoord")
            tex_coord.location = (-700, 0)
            mapping = nt.nodes.new("ShaderNodeMapping")
            mapping.location = (-500, 0)
            mapping.inputs["Scale"].default_value = (uv_scale[0], uv_scale[1], 1.0)
            nt.links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
        return mapping

    if color_tex_path and os.path.exists(color_tex_path):
        img = bpy.data.images.load(color_tex_path, check_existing=True)
        img.colorspace_settings.name = 'sRGB'
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-200, 260)
        nt.links.new(get_mapping().outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])

    if rough_tex_path and os.path.exists(rough_tex_path):
        img = bpy.data.images.load(rough_tex_path, check_existing=True)
        img.colorspace_settings.name = 'Non-Color'
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-200, -20)
        nt.links.new(get_mapping().outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Roughness"])

    if bump_tex_path and os.path.exists(bump_tex_path):
        img = bpy.data.images.load(bump_tex_path, check_existing=True)
        img.colorspace_settings.name = 'Non-Color'
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-200, -300)
        nt.links.new(get_mapping().outputs["Vector"], tex.inputs["Vector"])
        if bump_tex_path.lower().endswith("_normal.png") or "normal" in os.path.basename(bump_tex_path).lower():
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nmap.location = (40, -260)
            nmap.inputs["Strength"].default_value = bump_strength
            nt.links.new(tex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        else:
            bump = nt.nodes.new("ShaderNodeBump")
            bump.location = (40, -260)
            bump.inputs["Strength"].default_value = bump_strength
            bump.inputs["Distance"].default_value = 0.005
            nt.links.new(tex.outputs["Color"], bump.inputs["Height"])
            nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    return mat


def create_lathe_mesh(name, profile_rz, segments=64, cap_bottom=True, cap_top=True, flute_amp=0.0, flute_count=0, flute_z_range=None, mat=None):
    """Create a revolved mesh from [(r, z), ...] profile points around Z axis."""
    bm = bmesh.new()
    rings = []
    for r, z in profile_rz:
        ring = []
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
                        # smooth fade at ends
                        t = (z - z0) / max(1e-6, (z1 - z0))
                        env = math.sin(math.pi * t)
                        rr += flute_amp * env * (0.5 + 0.5 * math.cos(flute_count * ang))
                if in_range and flute_z_range is None:
                    rr += flute_amp * (0.5 + 0.5 * math.cos(flute_count * ang))
            v = bm.verts.new((rr * math.cos(ang), rr * math.sin(ang), z))
            ring.append(v)
        rings.append(ring)

    for j in range(len(rings) - 1):
        r0 = rings[j]
        r1 = rings[j + 1]
        for i in range(segments):
            inext = (i + 1) % segments
            bm.faces.new((r0[i], r0[inext], r1[inext], r1[i]))

    if cap_bottom and profile_rz[0][0] > 1e-6:
        c = bm.verts.new((0.0, 0.0, profile_rz[0][1]))
        r0 = rings[0]
        for i in range(segments):
            inext = (i + 1) % segments
            bm.faces.new((c, r0[inext], r0[i]))

    if cap_top and profile_rz[-1][0] > 1e-6:
        c = bm.verts.new((0.0, 0.0, profile_rz[-1][1]))
        rt = rings[-1]
        for i in range(segments):
            inext = (i + 1) % segments
            bm.faces.new((c, rt[i], rt[inext]))

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


def create_tube_along_points(name, points, radii, radial_segs=20, cap_ends=True, mat=None, aspect_y=1.0):
    """Build a smooth swept tube along 3D points [(x,y,z), ...] with per-point radius."""
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    n = len(pts)
    rings = []

    prev_normal = None
    for idx in range(n):
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
            # parallel transport
            normal = (prev_normal - tangent * prev_normal.dot(tangent))
            if normal.length < 1e-6:
                up = Vector((0, 1, 0)) if abs(tangent.y) < 0.9 else Vector((1, 0, 0))
                normal = tangent.cross(up).normalized()
            else:
                normal.normalize()
        binormal = tangent.cross(normal).normalized()
        prev_normal = normal

        r = radii[idx] if isinstance(radii, (list, tuple)) else radii
        ring = []
        for s in range(radial_segs):
            ang = 2.0 * math.pi * s / radial_segs
            offset = (normal * math.cos(ang) + binormal * (math.sin(ang) * aspect_y)) * r
            ring.append(bm.verts.new(pts[idx] + offset))
        rings.append(ring)

    for j in range(n - 1):
        r0 = rings[j]
        r1 = rings[j + 1]
        for s in range(radial_segs):
            sn = (s + 1) % radial_segs
            bm.faces.new((r0[s], r0[sn], r1[sn], r1[s]))

    if cap_ends:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 45.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_bead_ring(name, center_z, radius, bead_r, count, mat=None, center_xy=(0.0, 0.0)):
    """Create a single mesh containing a ring of decorative sterling-silver pearls/beads."""
    bm = bmesh.new()
    cx, cy = center_xy
    for i in range(count):
        ang = 2.0 * math.pi * i / count
        pos = Vector((cx + radius * math.cos(ang), cy + radius * math.sin(ang), center_z))
        bmesh.ops.create_uvsphere(
            bm,
            u_segments=12,
            v_segments=8,
            radius=bead_r,
            matrix=Matrix.Translation(pos),
        )
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_smooth(obj, 60.0)
    if mat:
        obj.data.materials.append(mat)
    return obj


def join_objects(objs, new_name):
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    res = bpy.context.view_layer.objects.active
    res.name = new_name
    return res


def export_glb(filepath, selected_only=False):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=selected_only,
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_texcoords=True,
    )
    print(f"[export_glb] wrote {filepath} ({os.path.getsize(filepath) / 1024:.1f} KB)")


def render_previews(prefix, views, target=(0, 0, 0.12), res=(800, 640), samples=36, bg_color=(0.04, 0.055, 0.09, 1.0)):
    """Render Cycles PNG preview shots from multiple camera positions without modifying exported objects."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = False
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'
    scene.view_settings.exposure = 0.25

    # Studio world
    world = bpy.data.worlds.new("PreviewWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = bg_color
        bg.inputs["Strength"].default_value = 0.65

    temp_objs = []

    # Studio floor sweep
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=2, y_segments=2, size=2.0)
    fmesh = bpy.data.meshes.new("_PreviewFloor")
    bm.to_mesh(fmesh)
    bm.free()
    floor = bpy.data.objects.new("_PreviewFloor", fmesh)
    floor.location = (0, 0, -0.0005)
    fmat = make_pbr_material("_PreviewFloorMat", base_color=(0.14, 0.09, 0.06, 1.0), roughness=0.45)
    floor.data.materials.append(fmat)
    scene.collection.objects.link(floor)
    temp_objs.append(floor)

    # Warm key + cool rim + soft fill lights
    light_specs = [
        ("KeyLight", 'AREA', (0.7, -0.9, 0.9), 45.0, (1.0, 0.88, 0.72), 0.7),
        ("RimLight", 'AREA', (-0.8, 0.8, 0.75), 35.0, (0.68, 0.82, 1.0), 0.8),
        ("FillLight", 'AREA', (-0.9, -0.5, 0.5), 18.0, (0.95, 0.92, 0.88), 1.0),
    ]
    tgt_vec = Vector(target)
    for lname, ltype, loc, energy, col, size in light_specs:
        ldata = bpy.data.lights.new(lname, type=ltype)
        ldata.energy = energy
        ldata.color = col
        ldata.size = size
        lobj = bpy.data.objects.new(lname, ldata)
        lobj.location = Vector(loc) + Vector((tgt_vec.x, tgt_vec.y, 0.0))
        direction = tgt_vec - lobj.location
        lobj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lobj)
        temp_objs.append(lobj)

    cam_data = bpy.data.cameras.new("_PreviewCam")
    cam_data.lens = 50.0
    cam_obj = bpy.data.objects.new("_PreviewCam", cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    temp_objs.append(cam_obj)

    rendered = []
    for vname, cam_pos, lens in views:
        cam_data.lens = lens
        cam_obj.location = Vector(cam_pos)
        direction = tgt_vec - cam_obj.location
        cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        out_png = os.path.join(PREVIEWS_DIR, f"{prefix}_{vname}.png")
        scene.render.filepath = out_png
        bpy.ops.render.render(write_still=True)
        rendered.append(out_png)
        print(f"[preview] rendered {out_png}")

    # Clean up temporary preview studio objects
    for obj in temp_objs:
        bpy.data.objects.remove(obj, do_unlink=True)
    scene.world = None
    return rendered

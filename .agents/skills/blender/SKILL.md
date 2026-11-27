---
name: blender
description: Headless Blender 3D modeling, PBR material authoring, glTF/GLB export, Cycles GI/AO lightmap baking, and multi-angle PNG preview rendering for Three.js web apps.
---

# Blender Headless Modeling & Baking Workflow

Blender is used **strictly for 3D geometry modeling, UV unwrapping, PBR material setup, Cycles lightmap baking, and verification preview renders**. Final rendering always runs live in Three.js in the browser.

## 1. Execution Pattern

Always invoke Blender headlessly with deterministic Python scripts:

```bash
blender --background --python scripts/blender/<script>.py
```

Every modeling script must:
1. Clear the default scene (`bpy.ops.wm.read_factory_settings(use_empty=True)`).
2. Model using exact real-world metric scale (`1 unit = 1 meter`).
3. Follow coordinate conventions:
   - In Blender: `+X` right, `+Y` back, `+Z` up.
   - Front of every prop faces `-Y` (which exports to Three.js `+Z` toward viewer when `export_yup=True`).
   - Lowest resting contact point sits at `Z = 0.0` (exports to `Y = 0.0` in Three.js) so props sit flush on tables/floors without floating or clipping.
4. Apply smooth shading with `auto_smooth` (or sharp edge marking / bevels) so metallic highlights read cleanly without faceting.
5. Assign Principled BSDF materials compatible with glTF 2.0 (`Base Color`, `Metallic`, `Roughness`, `Normal`, `Alpha`).
6. Export clean `.glb` files with:
   ```python
   bpy.ops.export_scene.gltf(
       filepath=out_path,
       export_format='GLB',
       export_yup=True,
       export_apply=True,
       export_normals=True,
       export_tangents=True,
       export_materials='EXPORT',
       export_texcoords=True,
   )
   ```
7. Export any precision attachment metadata (e.g. exact candle wick coordinates in Three.js Y-up coordinates) to JSON alongside the `.glb`.

## 2. Cycles GI / AO Lightmap Baking

For static architectural surfaces (room walls, floor, ceiling, trim, wooden dining table):
1. Create a dedicated non-overlapping second UV channel named `UVMap_Light` (`smart_project` with `island_margin=0.02`).
2. Set `scene.render.engine = 'CYCLES'`, `scene.cycles.device = 'CPU'`, `samples = 48..96`, `use_denoising = True` (if available).
3. Bake combined indirect diffuse lighting + ambient occlusion to a 1024x1024 or 2048x2048 image, save as `.jpg` (quality 88-92) in `assets/textures/`.
4. Keep the lightmap UV as `TEXCOORD_1` (`uv2` in Three.js) so Three.js `MeshStandardMaterial.lightMap` applies seamlessly on top of tiled PBR albedo/roughness/normal maps (`uv`).

## 3. Multi-Angle Verification Previews

Before accepting any model:
- Render multi-angle PNG previews (`front`, `three_quarter`, `side`/`detail`) into `/tmp/hanukkah_previews/` using Cycles (or Workbench/Eevee with studio/warm lighting) so each asset can be visually inspected against real Judaica product references.
- Verify silhouette, proportions, surface finish, ornament clarity, absence of floating/intersecting geometry, and clean normals.
- Iterate on the modeling script until every preview passes visual inspection; never ship unverified geometry.

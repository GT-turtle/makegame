"""Create a higher-detail CC0 Crusader idle presentation render.

This pass deliberately keeps the CC0 BlendKit "The Armored Adventurer" mesh
and armature as the character base, then replaces its small props and pointed
helmet with project-specific Crusader equipment and a premium presentation
setup.  It is an idle/look-development proof rather than a final game mesh.

Run from the project root with the bundled Blender::

    blender.exe -b tools/runtime/asset-sources/blendkit-armored-adventurer/\
        armored-adventurer-1k.blend \
        --python scripts/create_cc0_full_knight_hq_v2.py -- --size 2048
"""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import sys
import time
import zipfile
from collections import deque
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "tools" / "runtime" / "asset-sources" / "blendkit-armored-adventurer"
SOURCE_BLEND = SOURCE_DIR / "armored-adventurer-1k.blend"
OUTPUT_DIR = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "alternative-cc0"
OUTPUT_BLEND = OUTPUT_DIR / "cc0_crusader_hq_idle.blend"
OUTPUT_RENDER = OUTPUT_DIR / "cc0_crusader_hq_idle_2048.png"
OUTPUT_REPORT = OUTPUT_DIR / "REPORT.md"
OUTPUT_MANIFEST = OUTPUT_DIR / "manifest.json"
OUTPUT_SCRIPT = OUTPUT_DIR / "create_cc0_full_knight_hq_v2.py"
OUTPUT_ZIP = OUTPUT_DIR / "cc0_crusader_hq_idle_package.zip"

RENDER_SIZE = 2048


def parse_args() -> None:
    global RENDER_SIZE, OUTPUT_RENDER
    if "--" not in sys.argv:
        return
    args = sys.argv[sys.argv.index("--") + 1 :]
    for index, arg in enumerate(args):
        if arg == "--size" and index + 1 < len(args):
            RENDER_SIZE = max(512, int(args[index + 1]))
    OUTPUT_RENDER = OUTPUT_DIR / f"cc0_crusader_hq_idle_{RENDER_SIZE}.png"


def ensure_source() -> None:
    if not bpy.data.filepath:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))


def srgb(hex_value: str, alpha: float = 1.0):
    value = hex_value.lstrip("#")
    channels = [int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (*[lin(c) for c in channels], alpha)


def shader_input(shader, names, value) -> None:
    for name in names:
        if name in shader.inputs:
            shader.inputs[name].default_value = value
            return


def new_material(name: str, kind: str, base_hex: str, *, metallic=0.0, roughness=0.5,
                 secondary_hex: str | None = None, noise_scale=7.0, bump=0.08):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (680, 20)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (380, 20)
    shader_input(bsdf, ("Metallic",), metallic)
    shader_input(bsdf, ("Roughness",), roughness)
    shader_input(bsdf, ("IOR",), 1.46)
    shader_input(bsdf, ("Coat Weight", "Clearcoat"), 0.12 if metallic else 0.04)
    shader_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.30)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex = nt.nodes.new("ShaderNodeTexCoord")
    tex.location = (-820, 40)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.location = (-650, 40)
    nt.links.new(tex.outputs["Generated"], mapping.inputs["Vector"])

    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.location = (-440, 140)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.68
    noise.inputs["Distortion"].default_value = 0.17
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])

    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.location = (-180, 160)
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = srgb(secondary_hex or base_hex)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = srgb(base_hex)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    rough_map = nt.nodes.new("ShaderNodeMapRange")
    rough_map.location = (85, 150)
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 1.0
    rough_map.inputs["To Min"].default_value = max(0.05, roughness - 0.09)
    rough_map.inputs["To Max"].default_value = min(0.95, roughness + 0.11)
    nt.links.new(noise.outputs["Fac"], rough_map.inputs["Value"])
    nt.links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])

    if bump > 0:
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.location = (-430, -155)
        fine.noise_dimensions = "3D"
        fine.inputs["Scale"].default_value = 115.0 if metallic else 58.0
        fine.inputs["Detail"].default_value = 3.0
        fine.inputs["Roughness"].default_value = 0.72
        nt.links.new(mapping.outputs["Vector"], fine.inputs["Vector"])
        relief_output = fine.outputs["Fac"]
        if metallic > 0.5:
            scratches = nt.nodes.new("ShaderNodeTexWave")
            scratches.location = (-430, -330)
            scratches.wave_type = "BANDS"
            scratches.bands_direction = "X"
            scratches.inputs["Scale"].default_value = 235.0
            scratches.inputs["Distortion"].default_value = 9.0
            scratches.inputs["Detail"].default_value = 4.0
            scratches.inputs["Detail Scale"].default_value = 1.7
            nt.links.new(mapping.outputs["Vector"], scratches.inputs["Vector"])
            mix = nt.nodes.new("ShaderNodeMixRGB")
            mix.location = (-100, -220)
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 0.34
            nt.links.new(fine.outputs["Fac"], mix.inputs[1])
            nt.links.new(scratches.outputs["Color"], mix.inputs[2])
            relief_output = mix.outputs["Color"]
        bump_node = nt.nodes.new("ShaderNodeBump")
        bump_node.location = (95, -125)
        bump_node.inputs["Strength"].default_value = bump
        bump_node.inputs["Distance"].default_value = 0.0045 if metallic else 0.016
        nt.links.new(relief_output, bump_node.inputs["Height"])
        nt.links.new(bump_node.outputs["Normal"], bsdf.inputs["Normal"])

    mat["look_kind"] = kind
    return mat


def create_materials():
    mats = {
        "ivory": new_material("HQ2 Forged Ivory Steel", "plate", "D4CFBF", metallic=0.86,
                              roughness=0.36, secondary_hex="969287", noise_scale=5.2, bump=0.13),
        "ivory_light": new_material("HQ2 Highlighted Ivory Steel", "plate", "E2DDCB", metallic=0.86,
                                    roughness=0.31, secondary_hex="AAA69B", noise_scale=5.5, bump=0.11),
        "gold": new_material("HQ2 Aged Sun Gold", "trim", "D4A747", metallic=0.92,
                             roughness=0.32, secondary_hex="634018", noise_scale=7.5, bump=0.065),
        "dark_steel": new_material("HQ2 Dark Tempered Steel", "metal", "56636C", metallic=0.90,
                                   roughness=0.39, secondary_hex="0B1116", noise_scale=8.0, bump=0.08),
        "navy": new_material("HQ2 Black Navy Gambeson", "cloth", "172532", metallic=0.02,
                             roughness=0.75, secondary_hex="03070A", noise_scale=36.0, bump=0.20),
        "leather": new_material("HQ2 Oiled Saddle Leather", "leather", "704326", metallic=0.0,
                                roughness=0.60, secondary_hex="251109", noise_scale=45.0, bump=0.22),
        "stone": new_material("HQ2 Slate Floor", "stone", "41494A", metallic=0.0,
                              roughness=0.82, secondary_hex="10171C", noise_scale=3.4, bump=0.30),
        "wall": new_material("HQ2 Old Stone Wall", "stone", "253039", metallic=0.0,
                             roughness=0.88, secondary_hex="070C10", noise_scale=2.5, bump=0.34),
        "slit": new_material("HQ2 Helmet Slit", "void", "010205", metallic=0.15,
                             roughness=0.68, secondary_hex="000000", noise_scale=3.0, bump=0.0),
        "gem": new_material("HQ2 Spirit Turquoise", "gem", "36D6D5", metallic=0.12,
                            roughness=0.18, secondary_hex="075E66", noise_scale=8.0, bump=0.02),
    }
    gem_bsdf = mats["gem"].node_tree.nodes.get("Principled BSDF")
    if gem_bsdf:
        shader_input(gem_bsdf, ("Emission Color", "Emission"), srgb("36D6D5"))
        shader_input(gem_bsdf, ("Emission Strength",), 1.8)
    return mats


def assign(obj, material) -> None:
    if not hasattr(obj.data, "materials"):
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def delete_source_components(mesh_obj) -> dict[str, int]:
    """Remove only the old pointed helmet, buckler, and long scabbard islands."""
    mesh = mesh_obj.data
    adjacency = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    seen: set[int] = set()
    remove: set[int] = set()
    counts = {"helmet": 0, "buckler": 0, "sword_scabbard": 0}
    for start in range(len(mesh.vertices)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            idx = stack.pop()
            component.append(idx)
            for neighbor in adjacency[idx]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        coords = [mesh.vertices[i].co for i in component]
        min_x, max_x = min(v.x for v in coords), max(v.x for v in coords)
        min_y, max_y = min(v.y for v in coords), max(v.y for v in coords)
        min_z, max_z = min(v.z for v in coords), max(v.z for v in coords)
        kind = None
        if min_z > 1.355 and max_z > 1.46:
            kind = "helmet"
        elif min_x < -0.40 and (max_y - min_y) > 0.30 and min_z > 0.55:
            kind = "buckler"
        elif max_x > 0.40 and min_z < 0.22 and max_z > 0.75:
            kind = "sword_scabbard"
        if kind:
            remove.update(component)
            counts[kind] += len(component)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in sorted(remove)], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return counts


def refine_source(mats):
    mesh_obj = bpy.data.objects.get("Plane.029")
    rig = bpy.data.objects.get("The Armored Adventurer")
    if mesh_obj is None or rig is None:
        raise RuntimeError("Expected CC0 source objects are missing")

    removed = delete_source_components(mesh_obj)
    head_aux = bpy.data.objects.get("Person.009")
    if head_aux:
        head_aux.hide_render = True
        head_aux.hide_viewport = True

    # Source is 1.596m.  Its parent inverse means multiplying the armature scale
    # scales the skinned mesh in world space without touching the source weights.
    factor = 1.90 / 1.596
    rig.scale *= factor
    mesh_obj.data.transform(__import__("mathutils").Matrix.Diagonal((1.075, 1.0, 1.0, 1.0)))
    # A restrained piecewise proportion pass raises the hip line about 6 cm
    # while preserving overall height.  This makes the donor read as an adult
    # knight instead of a short-legged miniature in the low hero camera.
    for vertex in mesh_obj.data.vertices:
        z = vertex.co.z
        vertex.co.z = z * 1.06 if z < 0.90 else 0.954 + (z - 0.90) * 0.93
    mesh_obj.data.update()

    # Replace the broad legacy palette with a restrained ivory/gold/navy set.
    slot_map = {
        0: mats["navy"], 1: mats["ivory"], 2: mats["leather"], 3: mats["dark_steel"],
        4: mats["navy"], 5: mats["dark_steel"], 6: mats["dark_steel"],
        7: mats["navy"], 8: mats["ivory"], 9: mats["leather"],
        10: mats["ivory_light"], 11: mats["navy"], 12: mats["ivory"],
        13: mats["navy"], 14: mats["gold"], 15: mats["dark_steel"],
        16: mats["dark_steel"],
    }
    for index, slot in enumerate(mesh_obj.material_slots):
        slot.material = slot_map.get(index, mats["ivory"])
    for poly in mesh_obj.data.polygons:
        poly.use_smooth = True
    bevel = mesh_obj.modifiers.get("HQ2 micro bevel") or mesh_obj.modifiers.new("HQ2 micro bevel", "BEVEL")
    bevel.width = 0.0024
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(37)
    return mesh_obj, rig, removed, factor


def rounded_box(name, location, dimensions, material, *, bevel=0.018, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new("Hand-finished rounded edges", "BEVEL")
    mod.width = bevel
    mod.segments = 4
    assign(obj, material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def uv_sphere(name, location, scale, material, *, segments=64, rings=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def cylinder(name, location, radius, depth, material, *, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    bevel = obj.modifiers.new("Machined edge bevel", "BEVEL")
    bevel.width = max(0.002, radius * 0.10)
    bevel.segments = 3
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def curve_path(name, points, material, bevel_depth, *, cyclic=False):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_resolution = 5
    curve.bevel_depth = bevel_depth
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    return obj


def plate_mesh(name, outline_xz, *, front_y, back_y, center_y, material, bevel=0.02):
    """Convex, edged plate built as two fans plus a closed side wall."""
    n = len(outline_xz)
    verts = [(x, front_y, z) for x, z in outline_xz]
    verts += [(0.0, center_y, sum(z for _x, z in outline_xz) / n)]
    verts += [(x, back_y, z) for x, z in outline_xz]
    verts += [(0.0, back_y, sum(z for _x, z in outline_xz) / n)]
    front_center = n
    back_start = n + 1
    back_center = 2 * n + 1
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append((front_center, i, j))
        faces.append((back_center, back_start + j, back_start + i))
        faces.append((i, back_start + i, back_start + j, j))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    assign(obj, material)
    bevel_mod = obj.modifiers.new("Rolled plate edge", "BEVEL")
    bevel_mod.width = bevel
    bevel_mod.segments = 4
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def create_breastplate(mats):
    """Accent the donor cuirass instead of hiding it under another flat shell."""
    rounded_box("HQ2 Chest Cross Vertical", (0, -0.198, 1.392), (0.026, 0.014, 0.158),
                mats["gold"], bevel=0.005)
    rounded_box("HQ2 Chest Cross Horizontal", (0, -0.198, 1.420), (0.156, 0.014, 0.026),
                mats["gold"], bevel=0.005)
    gem = uv_sphere("HQ2 Chest Spirit Stone", (0, -0.211, 1.416), (0.024, 0.013, 0.024),
                    mats["gem"], segments=40, rings=20)
    return None, gem


def create_ovoid_helm_shell(material):
    """Compact, front-flattened ovoid shell with a human rather than ball profile."""
    rings = [
        (1.615, 0.102, 0.090),
        (1.660, 0.126, 0.104),
        (1.760, 0.132, 0.108),
        (1.835, 0.118, 0.096),
        (1.875, 0.082, 0.069),
        (1.895, 0.020, 0.018),
    ]
    segments = 96
    verts = []
    for z, rx, ry in rings:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            x = rx * math.cos(angle)
            y = ry * math.sin(angle)
            # The visor/front is a shallow plane instead of a round cheek-ball.
            y = max(y, -ry * 0.82)
            verts.append((x, y, z))
    faces = []
    for ring in range(len(rings) - 1):
        base = ring * segments
        nxt = (ring + 1) * segments
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((base + i, base + j, nxt + j, nxt + i))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings) - 1) * segments + i for i in range(segments)))
    mesh = bpy.data.meshes.new("HQ2 Compact Great Helm Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shell = bpy.data.objects.new("HQ2 Compact Ovoid Great Helm", mesh)
    bpy.context.collection.objects.link(shell)
    assign(shell, material)
    bevel = shell.modifiers.new("Forged shell edge", "BEVEL")
    bevel.width = 0.004
    bevel.segments = 3
    for poly in mesh.polygons:
        poly.use_smooth = True
    return shell


def create_helmet(mats):
    shell = create_ovoid_helm_shell(mats["ivory_light"])
    face_outline = [
        (-0.120, 1.785), (-0.116, 1.655), (-0.072, 1.615), (0.0, 1.600),
        (0.072, 1.615), (0.116, 1.655), (0.120, 1.785),
    ]
    lower = plate_mesh("HQ2 Articulated Helm Faceplate", face_outline, front_y=-0.119,
                       back_y=-0.092, center_y=-0.134, material=mats["ivory"], bevel=0.006)

    # Cross aperture from both eyes toward the mouth, now recessed and framed by
    # actual brow/cheek seams instead of floating bars on a sphere.
    rounded_box("HQ2 Helm Eye Slit", (0, -0.142, 1.747), (0.172, 0.008, 0.020),
                mats["slit"], bevel=0.004)
    rounded_box("HQ2 Helm Breath Slit", (0, -0.143, 1.684), (0.020, 0.008, 0.115),
                mats["slit"], bevel=0.004)
    rounded_box("HQ2 Helm Brow Gold", (0, -0.148, 1.772), (0.196, 0.009, 0.011),
                mats["gold"], bevel=0.003)
    rounded_box("HQ2 Helm Cross Gold", (0, -0.149, 1.678), (0.010, 0.009, 0.168),
                mats["gold"], bevel=0.003)
    # Articulation seams and small ventilation cuts make the compact helm read at
    # close range while retaining the requested round overall silhouette.
    for side in (-1, 1):
        curve_path(f"HQ2 Helm Cheek Seam {side}", [
            (side * 0.092, -0.137, 1.752), (side * 0.103, -0.135, 1.675),
            (side * 0.058, -0.139, 1.625),
        ], mats["gold"], 0.0035)
        for index, z in enumerate((1.690, 1.670, 1.650)):
            rounded_box(f"HQ2 Helm Vent {side} {index}", (side * 0.064, -0.145, z),
                        (0.042, 0.006, 0.006), mats["slit"], bevel=0.002)
        uv_sphere(f"HQ2 Helm Temple Rivet {'L' if side < 0 else 'R'}",
                  (side * 0.108, -0.118, 1.710), (0.010, 0.006, 0.010), mats["gold"],
                  segments=28, rings=14)
    curve_path("HQ2 Helm Crown Ridge", [
        (0, -0.095, 1.78), (0, -0.075, 1.855), (0, 0.0, 1.894), (0, 0.085, 1.85),
    ], mats["gold"], 0.0055)
    cylinder("HQ2 Chainmail Gorget", (0, 0.002, 1.575), 0.128, 0.092, mats["dark_steel"], vertices=72)
    return shell, lower


def shield_outline(cx=0.545, cz=0.925):
    local = [
        (-0.205, 0.625), (-0.310, 0.530), (-0.325, 0.245), (-0.265, -0.235),
        (-0.105, -0.565), (0.0, -0.660), (0.105, -0.565), (0.265, -0.235),
        (0.325, 0.245), (0.310, 0.530), (0.205, 0.625), (0.0, 0.650),
    ]
    return [(cx + x * 0.90, cz + z) for x, z in local]


def create_shield(mats):
    before = set(bpy.data.objects)
    outline = shield_outline()
    n = len(outline)
    # Convex front fan (toward -Y) and inset back.  Curvature is encoded by the
    # front center sitting 55mm farther forward than the perimeter.
    perimeter_front = [(x, -0.315, z) for x, z in outline]
    perimeter_back = [(x, -0.245, z) for x, z in outline]
    verts = perimeter_front + [(0.545, -0.372, 0.965)] + perimeter_back + [(0.545, -0.245, 0.965)]
    fc, bs, bc = n, n + 1, 2 * n + 1
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces += [(fc, i, j), (bc, bs + j, bs + i), (i, bs + i, bs + j, j)]
    mesh = bpy.data.meshes.new("HQ2 Greatshield Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shield = bpy.data.objects.new("HQ2 Shoulder-to-Knee Greatshield", mesh)
    bpy.context.collection.objects.link(shield)
    assign(shield, mats["ivory"])
    bevel = shield.modifiers.new("Shield rolled edge", "BEVEL")
    bevel.width = 0.017
    bevel.segments = 5
    for poly in mesh.polygons:
        poly.use_smooth = True

    path = [(x, -0.345, z) for x, z in outline]
    curve_path("HQ2 Shield Leather Perimeter", path, mats["leather"], 0.030, cyclic=True)
    curve_path("HQ2 Shield Gold Perimeter", [(x, -0.372, z) for x, z in outline], mats["gold"],
               0.014, cyclic=True)
    rounded_box("HQ2 Shield Cross Vertical", (0.545, -0.408, 0.950), (0.042, 0.024, 0.835),
                mats["gold"], bevel=0.009)
    rounded_box("HQ2 Shield Cross Horizontal", (0.545, -0.407, 1.175), (0.420, 0.024, 0.045),
                mats["gold"], bevel=0.009)
    uv_sphere("HQ2 Shield Spirit Stone", (0.545, -0.427, 1.173), (0.038, 0.018, 0.038),
              mats["gem"], segments=44, rings=22)
    for index in (0, 2, 4, 6, 8, 10):
        x, z = outline[index]
        uv_sphere(f"HQ2 Shield Rivet {index:02d}", (x, -0.389, z), (0.012, 0.009, 0.012),
                  mats["gold"], segments=24, rings=12)
    pivot = bpy.data.objects.new("HQ2 Greatshield Guard Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (0.545, -0.28, 0.925)
    bpy.context.view_layer.update()
    pivot_inverse = pivot.matrix_world.inverted()
    for obj in [obj for obj in bpy.data.objects if obj not in before and obj is not pivot]:
        obj.parent = pivot
        # Most procedural shield meshes carry their final coordinates in mesh
        # space with an identity object transform.  Parent inverse preserves
        # that world placement before the pivot yaw is applied.
        obj.matrix_parent_inverse = pivot_inverse
    # Turn the shield away from a billboard presentation.  From the sword-side
    # camera the 15 degree yaw reveals the cuirass and far leg while retaining
    # shoulder-to-below-knee coverage.
    pivot.rotation_euler.z = math.radians(-15.0)
    return shield, pivot


def create_sword(mats):
    x, y = -0.405, -0.155
    z0, z1, z2 = 1.025, 2.115, 2.215
    # Diamond-section claymore blade with a narrow, realistic profile.
    widths = [0.038, 0.032, 0.0]
    zs = [z0, z1, z2]
    verts = []
    for z, width in zip(zs, widths):
        verts += [(x - width, y, z), (x, y - 0.014, z), (x + width, y, z), (x, y + 0.014, z)]
    faces = []
    for ring in range(2):
        a, b = ring * 4, (ring + 1) * 4
        for i in range(4):
            faces.append((a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i))
    faces += [(0, 3, 2, 1), (8, 9, 10, 11)]
    mesh = bpy.data.meshes.new("HQ2 Claymore Blade Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    blade = bpy.data.objects.new("HQ2 Long Thin Claymore Blade", mesh)
    bpy.context.collection.objects.link(blade)
    assign(blade, mats["dark_steel"])
    bevel = blade.modifiers.new("Sharpened blade bevel", "BEVEL")
    bevel.width = 0.0025
    bevel.segments = 2

    # A slightly lighter central fuller catches the key light without widening
    # the sword into a fantasy slab.
    rounded_box("HQ2 Claymore Fuller", (x, y - 0.015, 1.58), (0.018, 0.006, 0.91),
                mats["ivory_light"], bevel=0.002)
    guard = rounded_box("HQ2 Claymore Crossguard", (x, y, 1.015), (0.360, 0.048, 0.034),
                        mats["gold"], bevel=0.014)
    for side in (-1, 1):
        uv_sphere(f"HQ2 Guard Quillon {'L' if side < 0 else 'R'}",
                  (x + side * 0.178, y, 1.018), (0.025, 0.031, 0.025), mats["gold"],
                  segments=32, rings=16)
    cylinder("HQ2 Claymore Leather Grip", (x, y, 0.885), 0.035, 0.225, mats["leather"], vertices=48)
    for z in (0.79, 0.84, 0.93, 0.98):
        cylinder(f"HQ2 Grip Ring {z:.2f}", (x, y, z), 0.039, 0.012, mats["gold"], vertices=40)
    uv_sphere("HQ2 Claymore Pommel", (x, y, 0.754), (0.052, 0.044, 0.055), mats["gold"],
              segments=40, rings=20)
    return blade, guard


def create_armor_details(mats):
    # Belt, layered waist plates, and selective rivets give the source silhouette
    # physically legible construction at close range.
    rounded_box("HQ2 Sword Belt", (0, -0.085, 1.055), (0.58, 0.075, 0.055), mats["leather"], bevel=0.014)
    rounded_box("HQ2 Belt Gold Frame", (0, -0.132, 1.055), (0.095, 0.025, 0.068), mats["gold"], bevel=0.012)
    rounded_box("HQ2 Belt Dark Center", (0, -0.148, 1.055), (0.058, 0.014, 0.037), mats["slit"], bevel=0.007)
    # Small sunburst collar accents echo the helm/shield without plastering the
    # whole model in glowing symbols.
    for side in (-1, 1):
        rounded_box(f"HQ2 Collar Trim {side}", (side * 0.135, -0.183, 1.515),
                    (0.180, 0.020, 0.026), mats["gold"], bevel=0.007,
                    rotation=(0, math.radians(-side * 12), math.radians(-side * 12)))


def create_sabatons(mats):
    """Adult-length articulated toes, preserving the donor's existing greaves."""
    for side in (-1, 1):
        cx = side * 0.155
        verts = [
            (cx - 0.052, -0.320, 0.025), (cx + 0.052, -0.320, 0.025),
            (cx + 0.090, 0.015, 0.025), (cx - 0.090, 0.015, 0.025),
            (cx - 0.035, -0.325, 0.060), (cx + 0.035, -0.325, 0.060),
            (cx + 0.082, 0.015, 0.125), (cx - 0.082, 0.015, 0.125),
        ]
        faces = [
            (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
            (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0),
        ]
        mesh = bpy.data.meshes.new(f"HQ2 Sabaton Mesh {side}")
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(f"HQ2 Adult Sabaton {'L' if side < 0 else 'R'}", mesh)
        bpy.context.collection.objects.link(obj)
        assign(obj, mats["ivory"])
        bevel = obj.modifiers.new("Articulated toe bevel", "BEVEL")
        bevel.width = 0.010
        bevel.segments = 4
        rounded_box(f"HQ2 Sabaton Toe Band {side}", (cx, -0.165, 0.085),
                    (0.142, 0.018, 0.012), mats["gold"], bevel=0.003)


def aim_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, color, size, target=(0, 0, 1.10)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim_at(obj, target)
    return obj


def create_environment(mats):
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    rounded_box("HQ2 Stone Dais", (0, 0.10, -0.07), (7.0, 7.0, 0.14), mats["stone"], bevel=0.025)
    rounded_box("HQ2 Back Wall", (0, 3.05, 2.0), (7.5, 0.20, 4.2), mats["wall"], bevel=0.04)
    for side in (-1, 1):
        rounded_box(f"HQ2 Hall Pillar {side}", (side * 2.2, 2.78, 1.95), (0.42, 0.44, 3.9),
                    mats["stone"], bevel=0.045)
        rounded_box(f"HQ2 Hall Pillar Base {side}", (side * 2.2, 2.65, 0.16), (0.72, 0.62, 0.32),
                    mats["stone"], bevel=0.055)
        rounded_box(f"HQ2 Hall Pillar Capital {side}", (side * 2.2, 2.65, 3.62), (0.70, 0.64, 0.28),
                    mats["stone"], bevel=0.055)

    focus = bpy.data.objects.new("HQ2 Camera Focus", None)
    bpy.context.collection.objects.link(focus)
    focus.location = (0.02, -0.04, 1.12)
    cam_data = bpy.data.cameras.new("HQ2 Hero Camera")
    cam_data.lens = 86.0
    cam_data.sensor_width = 36.0
    cam_data.clip_start = 0.05
    cam_data.clip_end = 100.0
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = focus
    cam_data.dof.aperture_fstop = 7.1
    cam_data.dof.aperture_blades = 8
    cam = bpy.data.objects.new("HQ2 Hero Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (-2.55, -5.70, 0.96)
    aim_at(cam, (0.02, -0.02, 1.12))
    bpy.context.scene.camera = cam

    add_area("HQ2 Warm Key", (-3.2, -4.2, 4.8), 980.0, (1.0, 0.79, 0.57), 3.1)
    add_area("HQ2 Cool Fill", (3.8, -2.9, 2.7), 580.0, (0.48, 0.68, 1.0), 3.2)
    add_area("HQ2 Gold Rim", (2.8, 3.3, 3.7), 1050.0, (1.0, 0.67, 0.32), 2.5)
    add_area("HQ2 Top Softbox", (-0.4, 0.2, 5.0), 650.0, (1.0, 0.88, 0.72), 3.4)
    add_area("HQ2 Shield Edge", (4.0, -1.1, 1.55), 480.0, (0.55, 0.78, 1.0), 2.0)
    return cam


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 16
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.eevee.taa_render_samples = 256 if RENDER_SIZE >= 1500 else 96
    scene.eevee.use_fast_gi = True
    scene.eevee.fast_gi_quality = 0.9
    scene.eevee.fast_gi_step_count = 24
    scene.eevee.fast_gi_ray_count = 4
    scene.eevee.fast_gi_distance = 4.5
    scene.eevee.shadow_ray_count = 4
    scene.eevee.shadow_step_count = 16
    scene.eevee.shadow_resolution_scale = 1.0
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -0.62
    scene.view_settings.gamma = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("HQ2 Dark Hall World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("06101A")
    background.inputs["Strength"].default_value = 0.22


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def write_docs(started: float, removed, scale_factor: float):
    source_hash = sha256(SOURCE_BLEND)
    render_hash = sha256(OUTPUT_RENDER)
    blend_hash = sha256(OUTPUT_BLEND)
    elapsed = time.perf_counter() - started
    report = f"""# CC0 Crusader comparison proof — rejected

![{RENDER_SIZE}px comparison render]({OUTPUT_RENDER.name})

## Selection status

**Rejected / not selected for the production Crusader.**  The legal CC0 route
validates the pipeline, proportions, shield scale, and camera, but the donor
topology remains too stylized and low-detail for the requested premium target.

## Result

- 190 cm adult-proportioned Crusader in a neutral guard stance.
- The CC0 Armored Adventurer mesh and 65-bone rig remain the character base.
- New fitted rounded cross helm, sculpted breastplate, layered faulds, thin curved
  shoulder-to-knee shield, and long thin one-handed claymore.
- Forged ivory steel, aged gold, leather, dark mail/gambeson, restrained cyan stones.
- {RENDER_SIZE} x {RENDER_SIZE} Eevee comparison render with an 86 mm low hero camera and five-light hall setup.

## CC0 source record

- Asset: The Armored Adventurer by AnonmalyFound
- Official page: https://www.blendkit.com/asset-gallery-detail/4d71b492-be49-4748-b159-6ec337aefa50/
- License reported by official BlendKit API: `cc_zero` (CC0)
- BlendKit license terms: https://www.blendkit.com/docs/licenses/
- Local source SHA-256: `{source_hash}`

The source was scaled by `{scale_factor:.6f}` to 1.90 m.  Only disconnected
source islands belonging to the pointed helmet, small buckler and old
sword/scabbard were removed (`{json.dumps(removed)}`); the source armor/body
mesh, rig and skin weights remain in the output blend.

## Files

- `{OUTPUT_RENDER.name}` — final still (SHA-256 `{render_hash}`)
- `{OUTPUT_BLEND.name}` — reusable Blender scene (SHA-256 `{blend_hash}`)
- `{OUTPUT_SCRIPT.name}` — reproducible build/render script
- `{OUTPUT_MANIFEST.name}` — machine-readable source/build record

This is a rejected idle/look-dev comparison, not the production-quality answer.
The new hard-surface pieces
are positioned for this guard stance and are not yet transferred to the source
armature for animation.

Build and render time: `{elapsed:.1f}` seconds.
"""
    OUTPUT_REPORT.write_text(report, encoding="utf-8")
    shutil.copy2(Path(__file__).resolve(), OUTPUT_SCRIPT)
    manifest = {
        "selection_status": "rejected_comparison",
        "rejection_reason": "Donor topology remains stylized and low-detail for the requested premium target.",
        "source": {
            "asset": "The Armored Adventurer",
            "author": "AnonmalyFound",
            "url": "https://www.blendkit.com/asset-gallery-detail/4d71b492-be49-4748-b159-6ec337aefa50/",
            "license": "CC0",
            "sha256": source_hash,
        },
        "output": {
            "render": str(OUTPUT_RENDER),
            "render_sha256": render_hash,
            "blend": str(OUTPUT_BLEND),
            "blend_sha256": blend_hash,
            "resolution": [RENDER_SIZE, RENDER_SIZE],
            "engine": "BLENDER_EEVEE",
            "samples": 256 if RENDER_SIZE >= 1500 else 96,
        },
        "character": {
            "height_m": 1.90,
            "source_scale_factor": scale_factor,
            "removed_source_vertices": removed,
            "base_rig_preserved": True,
            "new_equipment_rigged": False,
        },
    }
    OUTPUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if OUTPUT_ZIP.exists():
        OUTPUT_ZIP.unlink()
    with zipfile.ZipFile(OUTPUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in (OUTPUT_RENDER, OUTPUT_BLEND, OUTPUT_REPORT, OUTPUT_MANIFEST, OUTPUT_SCRIPT):
            archive.write(file, arcname=file.name)


def main():
    started = time.perf_counter()
    parse_args()
    ensure_source()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mats = create_materials()
    _mesh_obj, _rig, removed, factor = refine_source(mats)
    create_breastplate(mats)
    create_helmet(mats)
    create_armor_details(mats)
    create_sabatons(mats)
    create_shield(mats)
    create_sword(mats)
    configure_scene()
    create_environment(mats)
    bpy.context.scene.render.filepath = str(OUTPUT_RENDER)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), compress=True)
    bpy.ops.render.render(write_still=True)
    # Store the live presentation camera/render path in the saved blend too.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), compress=True)
    write_docs(started, removed, factor)
    print("CC0_HQ_V2_COMPLETE")
    print(str(OUTPUT_RENDER))
    print(str(OUTPUT_BLEND))
    print(str(OUTPUT_ZIP))


if __name__ == "__main__":
    main()

"""Create a premium crusader still from the BlenderKit Rigged Knight base.

The downloaded model is intentionally kept out of distributable archives. This
script loads the project-local royalty-free source, performs a non-destructive
look/pose/equipment pass, and writes a derived working blend plus still render.

Run from the repository root with the bundled Blender build::

    tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
      tools/runtime/asset-sources/hq-knight-rigged-baseline/hq-rigged-knight.blend \
      --python scripts/create_rigged_knight_crusader_hq_v2.py -- --size 1024
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tools" / "runtime" / "asset-sources" / "hq-knight-rigged-baseline" / "hq-rigged-knight.blend"
DONOR_ARMOUR = ROOT / "tools" / "runtime" / "asset-sources" / "hq-knight-roblox-armour" / "hq-knight-roblox-armour.blend"
ACTUAL_GEAR = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "actual" / "human_base_crusader_hq_v2.blend"
OUT = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "rigged-knight"
OUT_BLEND = OUT / "crusader_hq_v2_rigged_knight.blend"
OUT_RENDER = OUT / "crusader_hq_v2_idle_2048.png"
OUT_REPORT = OUT / "build_report.json"
RIG_NAME = "Rigged knight"


def cli() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--draft", action="store_true")
    return parser.parse_args(args)


def srgb(hex_color: str, alpha: float = 1.0):
    value = hex_color.lstrip("#")
    result = []
    for idx in (0, 2, 4):
        component = int(value[idx : idx + 2], 16) / 255.0
        result.append(component / 12.92 if component <= 0.04045 else ((component + 0.055) / 1.055) ** 2.4)
    return (*result, alpha)


def clear_material(name: str):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (760, 40)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (470, 40)
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return material, nodes, links, bsdf


def set_input(shader, names, value):
    for name in names:
        if name in shader.inputs:
            shader.inputs[name].default_value = value
            return


def forged_metal(name: str, dark: str, mid: str, light: str, *, metallic=0.88, rough=(0.24, 0.43)):
    material, nodes, links, bsdf = clear_material(name)
    tex = nodes.new("ShaderNodeTexNoise")
    tex.location = (-680, 130)
    tex.noise_dimensions = "3D"
    tex.inputs["Scale"].default_value = 6.2
    tex.inputs["Detail"].default_value = 7.0
    tex.inputs["Roughness"].default_value = 0.72
    tex.inputs["Distortion"].default_value = 0.20
    coords = nodes.new("ShaderNodeTexCoord")
    coords.location = (-920, 110)
    links.new(coords.outputs["Generated"], tex.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-430, 150)
    ramp.color_ramp.elements[0].position = 0.17
    ramp.color_ramp.elements[0].color = srgb(dark)
    ramp.color_ramp.elements[-1].position = 0.84
    ramp.color_ramp.elements[-1].color = srgb(light)
    middle = ramp.color_ramp.elements.new(0.50)
    middle.color = srgb(mid)
    links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("IOR",), 1.47)
    set_input(bsdf, ("Coat Weight", "Clearcoat"), 0.14)
    set_input(bsdf, ("Coat Roughness", "Clearcoat Roughness"), 0.30)

    rough_map = nodes.new("ShaderNodeMapRange")
    rough_map.location = (-120, 115)
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 1.0
    rough_map.inputs["To Min"].default_value = rough[0]
    rough_map.inputs["To Max"].default_value = rough[1]
    links.new(tex.outputs["Fac"], rough_map.inputs["Value"])
    links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])

    micro = nodes.new("ShaderNodeTexNoise")
    micro.location = (-390, -170)
    micro.noise_dimensions = "3D"
    micro.inputs["Scale"].default_value = 145.0
    micro.inputs["Detail"].default_value = 2.0
    micro.inputs["Roughness"].default_value = 0.76
    links.new(coords.outputs["Object"], micro.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.location = (90, -120)
    bump.inputs["Strength"].default_value = 0.11
    bump.inputs["Distance"].default_value = 0.008
    links.new(micro.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def organic_material(name: str, colors, *, roughness=0.72, metallic=0.0, scale=7.0, bump_strength=0.18):
    material, nodes, links, bsdf = clear_material(name)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-600, 120)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 7.5
    noise.inputs["Roughness"].default_value = 0.78
    noise.inputs["Distortion"].default_value = 0.30
    coords = nodes.new("ShaderNodeTexCoord")
    coords.location = (-850, 110)
    links.new(coords.outputs["Generated"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.location = (-350, 130)
    ramp.color_ramp.elements[0].color = srgb(colors[0])
    ramp.color_ramp.elements[-1].color = srgb(colors[-1])
    if len(colors) == 3:
        middle = ramp.color_ramp.elements.new(0.52)
        middle.color = srgb(colors[1])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    set_input(bsdf, ("Roughness",), roughness)
    set_input(bsdf, ("Metallic",), metallic)
    bump = nodes.new("ShaderNodeBump")
    bump.location = (90, -80)
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.020
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def flat_material(name: str, color: str, *, metallic=0.0, roughness=0.6, emission=0.0):
    material, _nodes, _links, bsdf = clear_material(name)
    rgba = srgb(color)
    set_input(bsdf, ("Base Color",), rgba)
    set_input(bsdf, ("Metallic",), metallic)
    set_input(bsdf, ("Roughness",), roughness)
    if emission:
        set_input(bsdf, ("Emission Color", "Emission"), rgba)
        set_input(bsdf, ("Emission Strength",), emission)
    return material


def masonry_material(name: str, color_a: str, color_b: str, mortar: str, *, scale=16.0, vertical=False):
    material, nodes, links, bsdf = clear_material(name)
    coords = nodes.new("ShaderNodeTexCoord")
    coords.location = (-760, 80)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-650, 80)
    if vertical:
        mapping.inputs["Rotation"].default_value[0] = math.radians(90.0)
    links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
    brick = nodes.new("ShaderNodeTexBrick")
    brick.location = (-520, 100)
    brick.offset = 0.5
    brick.offset_frequency = 2
    brick.squash = 1.0
    brick.squash_frequency = 2
    brick.inputs["Color1"].default_value = srgb(color_a)
    brick.inputs["Color2"].default_value = srgb(color_b)
    brick.inputs["Mortar"].default_value = srgb(mortar)
    brick.inputs["Scale"].default_value = scale
    brick.inputs["Mortar Size"].default_value = 0.018
    brick.inputs["Mortar Smooth"].default_value = 0.015
    brick.inputs["Bias"].default_value = -0.15
    links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    set_input(bsdf, ("Roughness",), 0.90)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-500, -170)
    noise.inputs["Scale"].default_value = 65.0
    noise.inputs["Detail"].default_value = 5.0
    links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    mix = nodes.new("ShaderNodeMixRGB")
    mix.location = (-250, -90)
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.55
    links.new(brick.outputs["Fac"], mix.inputs[1])
    links.new(noise.outputs["Fac"], mix.inputs[2])
    bump = nodes.new("ShaderNodeBump")
    bump.location = (95, -80)
    bump.inputs["Strength"].default_value = 0.42
    bump.inputs["Distance"].default_value = 0.045
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def create_materials():
    return {
        "ivory": forged_metal("CR2 Ivory Hammered Plate", "746D61", "B8AE96", "E6DDC5", metallic=0.78, rough=(0.27, 0.46)),
        "ivory_light": forged_metal("CR2 Pale Edge Steel", "8E8778", "CDC4AC", "F0E9D5", metallic=0.82, rough=(0.22, 0.38)),
        "gold": forged_metal("CR2 Sun Gold", "5A310A", "B47718", "E7B94D", metallic=0.94, rough=(0.22, 0.37)),
        "dark_steel": forged_metal("CR2 Dark Tempered Steel", "081015", "26323A", "64717A", metallic=0.90, rough=(0.31, 0.52)),
        "blade": forged_metal("CR2 Claymore Steel", "465058", "98A2A5", "E5E8E3", metallic=0.96, rough=(0.16, 0.31)),
        "leather": organic_material("CR2 Oiled Brown Leather", ("160A05", "4C2310", "8A552C"), roughness=0.67, scale=9.0, bump_strength=0.24),
        "wood": organic_material("CR2 Dark Oak Shield Core", ("160C08", "3B2113", "684020"), roughness=0.76, scale=4.5, bump_strength=0.28),
        "cloth": organic_material("CR2 Midnight Gambeson", ("05090F", "101C29", "263847"), roughness=0.88, scale=48.0, bump_strength=0.16),
        "chain": forged_metal("CR2 Blackened Mail", "020609", "111B22", "536069", metallic=0.76, rough=(0.38, 0.62)),
        "slit": flat_material("CR2 Helmet Darkness", "010204", roughness=0.88),
        "cyan": flat_material("CR2 Spirit Cyan", "15949D", metallic=0.14, roughness=0.26, emission=1.55),
        "stone": masonry_material("CR2 Slate Flagstones", "11171B", "2A3132", "030506", scale=20.0),
        "wall": masonry_material("CR2 Ancient Block Wall", "080C10", "1A2226", "020304", scale=13.0, vertical=True),
    }


def set_material(obj, material):
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def bevel(obj, width=0.008, segments=3, angle=True):
    modifier = obj.modifiers.new("Hand finished rolled edges", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE" if angle else "NONE"
    return obj


def box(name, dimensions, material, location=(0, 0, 0), rotation=(0, 0, 0), bevel_width=0.006):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, material)
    bevel(obj, bevel_width, 3)
    smooth(obj)
    return obj


def uv_sphere(name, location, scale, material, segments=48, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, material)
    smooth(obj)
    return obj


def cylinder(name, location, radius, depth, material, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    set_material(obj, material)
    bevel(obj, min(radius * 0.18, 0.006), 3)
    smooth(obj)
    return obj


def torus(name, location, major_radius, minor_radius, material, rotation=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=64,
        minor_segments=12,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_material(obj, material)
    smooth(obj)
    return obj


def curve_poly(name, points, material, bevel_depth=0.01, cyclic=False):
    data = bpy.data.curves.new(name + " Mesh", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = bevel_depth
    data.bevel_resolution = 4
    spline = data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material)
    return obj


def clear_helpers():
    for obj in list(bpy.data.objects):
        if obj.name.startswith("CR2_") or obj.type in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)


def grade_existing_material(material, tint: str, factor: float, *, blend="MIX"):
    """Color-grade an existing PBR material without discarding its 2K maps."""
    if material is None or not material.use_nodes:
        return
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for shader in [node for node in nodes if node.type == "BSDF_PRINCIPLED"]:
        base = shader.inputs.get("Base Color")
        if base is None:
            continue
        source_link = base.links[0] if base.is_linked else None
        old_default = tuple(base.default_value)
        mix = nodes.new("ShaderNodeMixRGB")
        mix.name = "CR2 preserve PBR color grade"
        mix.blend_type = blend
        mix.inputs[0].default_value = factor
        mix.inputs[2].default_value = srgb(tint)
        if source_link:
            from_socket = source_link.from_socket
            links.remove(source_link)
            links.new(from_socket, mix.inputs[1])
        else:
            mix.inputs[1].default_value = old_default
        links.new(mix.outputs["Color"], base)


def grade_source_pbr():
    # All original normal, metallic, roughness, AO and opacity maps remain live.
    grades = {
        "Steel.002": ("D8CEB7", 0.18, "SCREEN"),
        "Medieval chain.001": ("192630", 0.46, "MULTIPLY"),
        "leather_red_02": ("1A0D08", 0.64, "MULTIPLY"),
        "leather_red_02.002": ("1A0D08", 0.64, "MULTIPLY"),
        "Fabric Pattern 07.001": ("101B28", 0.55, "MULTIPLY"),
        "fabric_leather_02.002": ("101B28", 0.50, "MULTIPLY"),
        # The skin slot becomes dark fitted gloves / balaclava wherever exposed.
        "Material.001": ("17100C", 0.78, "MIX"),
    }
    for name, (tint, factor, blend) in grades.items():
        grade_existing_material(bpy.data.materials.get(name), tint, factor, blend=blend)


def import_detailed_armour():
    """Fit selected realistic PBR armour pieces over the rigged base.

    The donor is also a BlenderKit royalty-free asset. Only its realistic great
    helm is used; the rigged source remains the entire visible body, plate,
    articulated arms, mail, legs, hands and animation base.
    """
    if not DONOR_ARMOUR.exists():
        raise FileNotFoundError(DONOR_ARMOUR)
    with bpy.data.libraries.load(str(DONOR_ARMOUR), link=False) as (data_from, data_to):
        data_to.collections = ["Roblox Knight Armour"] if "Roblox Knight Armour" in data_from.collections else []
    if not data_to.collections or data_to.collections[0] is None:
        raise RuntimeError("Detailed armour donor collection was not found")
    collection = data_to.collections[0]
    bpy.context.scene.collection.children.link(collection)

    keep = {"Helmet": "Helmet"}
    imported = {}
    for obj in list(collection.objects):
        if obj.name not in keep:
            obj.hide_render = True
            obj.hide_viewport = True
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
        old_name = obj.name
        obj.name = f"CR2_Detailed_{keep[old_name]}"
        if old_name == "Helmet":
            obj.scale = (0.43, 0.43, 0.43)
            obj.location = (0.0, 0.0, 1.305)
        imported[keep[old_name]] = obj

    armour_material = next((slot.material for obj in imported.values() for slot in obj.material_slots if slot.material and "Armour" in slot.material.name), None)
    if armour_material:
        grade_existing_material(armour_material, "D8CDB5", 0.26, blend="SCREEN")
    return imported


def import_closed_helmet_and_faulds(materials):
    """Reuse the project's closed great helm and modest layered faulds.

    These pieces were created for the HBM prototype in ``actual``. The helmet
    shell is fully enclosing; slits/vents are dark inserts and the separate mail
    gorget overlaps both shell and breastplate, so no scalp, face or neck skin
    can read in the final frame.
    """
    if not ACTUAL_GEAR.exists():
        raise FileNotFoundError(ACTUAL_GEAR)
    helmet_names = {
        "HQV2_Compact_Rounded_Great_Helm",
        "HQV2_Closed_Bowed_Visor",
        "HQV2_Closed_Chain_Gorget",
        "HQV2_Helmet_Cross_H",
        "HQV2_Helmet_Cross_V",
        "HQV2_Helmet_Crown_Ridge",
        "HQV2_Helmet_Fitted_Neck_Roll",
        "HQV2_Helmet_Hinge_L",
        "HQV2_Helmet_Hinge_R",
        "HQV2_Helmet_MouthVent_1",
        "HQV2_Helmet_MouthVent_2",
        "HQV2_Helmet_MouthVent_3",
        "HQV2_Helmet_MouthVent_4",
        "HQV2_Helmet_MouthVent_5",
        "HQV2_Helmet_Spirit_Gem",
        "HQV2_Helmet_Visor_Slit_L",
        "HQV2_Helmet_Visor_Slit_R",
    }
    fauld_names = {
        "HQV2_Cuisse_L",
        "HQV2_Cuisse_R",
        "HQV2_Cuisse_UpperBand_L",
        "HQV2_Cuisse_UpperBand_R",
        "HQV2_Cuisse_LowerBand_L",
        "HQV2_Cuisse_LowerBand_R",
    }
    requested = helmet_names | fauld_names
    with bpy.data.libraries.load(str(ACTUAL_GEAR), link=False) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects if name in requested]
    collection = bpy.data.collections.new("CR2 Closed Helmet and Faulds")
    bpy.context.scene.collection.children.link(collection)
    imported = {}
    helmet_transform = Matrix.Translation((0.0, 0.0, 0.31)) @ Matrix.Diagonal((0.92, 0.92, 0.92, 1.0))
    fauld_transform = Matrix.Translation((0.0, 0.0, 0.10))
    for obj in data_to.objects:
        if obj is None:
            continue
        if obj.name not in collection.objects:
            collection.objects.link(obj)
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_parent_inverse.identity()
        obj.matrix_world = (helmet_transform if obj.name in helmet_names else fauld_transform) @ matrix
        obj.hide_render = False
        obj.hide_viewport = False
        imported[obj.name] = obj

        if obj.name in {"HQV2_Compact_Rounded_Great_Helm", "HQV2_Closed_Bowed_Visor"}:
            set_material(obj, materials["ivory"])
        elif obj.name == "HQV2_Closed_Chain_Gorget":
            set_material(obj, materials["chain"])
        elif "Visor_Slit" in obj.name or "MouthVent" in obj.name:
            set_material(obj, materials["slit"])
        elif "Spirit_Gem" in obj.name:
            set_material(obj, materials["cyan"])
        elif obj.name.startswith("HQV2_Cuisse_"):
            set_material(obj, materials["gold"] if "Band" in obj.name else materials["ivory"])
        elif obj.type in {"MESH", "CURVE"}:
            obj.data.materials.clear()
            obj.data.materials.append(materials["gold"] if "Cross" in obj.name or "Ridge" in obj.name or "Hinge" in obj.name else materials["dark_steel"])
    return imported


def pose_guard():
    rig = bpy.data.objects.get(RIG_NAME)
    if rig is None:
        return {}
    # Rigify stores IK/FK on the limb parent. IK targets make a clean, natural
    # guard stance and keep all 221 original mesh pieces moving together.
    targets = {
        "hand_ik.R": Vector((-0.43, -0.18, 0.91)),
        "hand_ik.L": Vector((0.49, -0.12, 1.19)),
        "foot_ik.R": Vector((-0.285, 0.125, 0.047)),
        "foot_ik.L": Vector((0.295, -0.135, 0.047)),
    }
    for side in ("L", "R"):
        rig.pose.bones[f"upper_arm_parent.{side}"]["IK_FK"] = 1.0
        rig.pose.bones[f"thigh_parent.{side}"]["IK_FK"] = 1.0
        rig.pose.bones[f"upper_arm_parent.{side}"]["IK_Stretch"] = 0.0
        rig.pose.bones[f"thigh_parent.{side}"]["IK_Stretch"] = 0.0
    bpy.context.view_layer.update()
    for name, target in targets.items():
        bone = rig.pose.bones.get(name)
        if bone:
            pose_matrix = bone.matrix.copy()
            pose_matrix.translation = target
            bone.matrix = pose_matrix
    # Small counter-rotation avoids a mannequin-straight torso.
    rig.pose.bones["chest"].rotation_mode = "XYZ"
    rig.pose.bones["chest"].rotation_euler = (math.radians(-1.5), math.radians(1.5), math.radians(-2.5))
    rig.pose.bones["hips"].rotation_mode = "XYZ"
    rig.pose.bones["hips"].rotation_euler = (0.0, math.radians(-1.0), math.radians(1.5))
    rig.pose.bones["head"].rotation_mode = "XYZ"
    rig.pose.bones["head"].rotation_euler = (math.radians(1.0), 0.0, math.radians(-2.5))
    bpy.context.view_layer.update()
    return {name: list(target) for name, target in targets.items()}


def helmet_mesh(materials):
    # Fitted rounded great helm: narrow enough to retain adult proportions and
    # faceted enough to read as forged plate rather than a toy capsule.
    rings = [
        (1.805, 0.118, 0.116),
        (1.835, 0.128, 0.126),
        (1.900, 0.132, 0.134),
        (1.970, 0.130, 0.134),
        (2.030, 0.120, 0.125),
        (2.070, 0.090, 0.100),
        (2.092, 0.035, 0.044),
    ]
    segments = 64
    vertices = []
    for z, rx, ry in rings:
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            vertices.append((rx * math.cos(angle), ry * math.sin(angle), z))
    faces = []
    for ring in range(len(rings) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            a = ring * segments + index
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + index
            faces.append((a, b, c, d))
    faces.append(tuple(range((len(rings) - 1) * segments, len(rings) * segments)))
    mesh = bpy.data.meshes.new("CR2 Rounded Great Helm Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    helm = bpy.data.objects.new("CR2_Rounded_Great_Helm", mesh)
    bpy.context.collection.objects.link(helm)
    set_material(helm, materials["ivory"])
    smooth(helm)
    bevel(helm, 0.004, 3)

    # Eye slit, cross-shaped reinforcement, crown ridge, lower breathing holes.
    box("CR2_Helmet_Eye_Slit", (0.205, 0.014, 0.026), materials["slit"], (0, -0.134, 1.964), bevel_width=0.004)
    box("CR2_Helmet_Brow_Gold", (0.235, 0.018, 0.020), materials["gold"], (0, -0.145, 1.985), bevel_width=0.004)
    box("CR2_Helmet_Cross_Vertical", (0.025, 0.021, 0.205), materials["gold"], (0, -0.147, 1.913), bevel_width=0.004)
    torus("CR2_Helmet_Brow_Band", (0, 0, 1.986), 0.129, 0.007, materials["gold"], scale=(1.0, 1.02, 1.0))
    box("CR2_Helmet_Crown_Ridge", (0.024, 0.022, 0.080), materials["gold"], (0, -0.100, 2.058), rotation=(math.radians(-22), 0, 0), bevel_width=0.004)
    uv_sphere("CR2_Helmet_Spirit_Gem", (0, -0.154, 2.023), (0.021, 0.010, 0.021), materials["cyan"], 32, 16)
    for x in (-0.073, -0.038, 0.038, 0.073):
        for z in (1.852, 1.878):
            uv_sphere(f"CR2_Helmet_Breath_{x}_{z}", (x, -0.133, z), (0.007, 0.006, 0.007), materials["slit"], 16, 8)
    for side in (-1, 1):
        uv_sphere(f"CR2_Helmet_Rivet_{side}", (side * 0.130, -0.005, 1.945), (0.011, 0.007, 0.011), materials["gold"], 20, 10)
    return helm


def detailed_helmet_accents(materials, helmet):
    """Add restrained crusader identity to the fitted donor great helm."""
    if helmet is None:
        return
    # Donor helmet bounds after fitting: z 1.786..2.087, x about +/-0.106.
    # The dark visor is inset; gold bars are thin forged reinforcements.
    box("CR2_Helmet_Deep_Visor", (0.195, 0.011, 0.026), materials["slit"], (0, -0.127, 1.960), bevel_width=0.003)
    box("CR2_Helmet_Brow_Reinforcement", (0.218, 0.016, 0.018), materials["gold"], (0, -0.136, 1.980), bevel_width=0.004)
    box("CR2_Helmet_Cross_Reinforcement", (0.020, 0.018, 0.205), materials["gold"], (0, -0.137, 1.910), bevel_width=0.004)
    box("CR2_Helmet_Crown_Seam", (0.018, 0.020, 0.078), materials["gold"], (0, -0.102, 2.075), rotation=(math.radians(-18), 0, 0), bevel_width=0.003)
    uv_sphere("CR2_Helmet_Tiny_Spirit_Inset", (0, -0.147, 2.011), (0.010, 0.005, 0.010), materials["cyan"], 24, 12)
    for side in (-1, 1):
        for z in (1.842, 1.890, 2.014):
            uv_sphere(f"CR2_Helmet_Hand_Rivet_{side}_{z}", (side * 0.115, -0.052, z), (0.006, 0.004, 0.006), materials["gold"], 16, 8)


def shield_surface(name, scale, y_front, y_back, material):
    outline = [
        (-0.13, 0.705), (-0.30, 0.675), (-0.355, 0.570), (-0.362, 0.270),
        (-0.335, -0.080), (-0.255, -0.400), (0.0, -0.720),
        (0.255, -0.400), (0.335, -0.080), (0.362, 0.270), (0.355, 0.570), (0.30, 0.675), (0.13, 0.705),
    ]
    outline = [(x * scale, z * scale) for x, z in outline]
    vertices = [(0, y_front - 0.055, 0), (0, y_back, 0)]
    vertices += [(x, y_front, z) for x, z in outline]
    vertices += [(x, y_back, z) for x, z in outline]
    count = len(outline)
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((0, 2 + index, 2 + nxt))
        faces.append((1, 2 + count + nxt, 2 + count + index))
        faces.append((2 + index, 2 + count + index, 2 + count + nxt, 2 + nxt))
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    bevel(obj, 0.012 * scale, 4)
    smooth(obj)
    return obj, outline


def make_shield(materials):
    pivot = bpy.data.objects.new("CR2_Great_Shield_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    # Shifted outboard to show the torso/leg read, narrowed twelve percent and
    # yawed so the thin convex construction is visible instead of a flat wall.
    pivot.location = (0.62, -0.16, 1.025)
    pivot.rotation_euler = (math.radians(-4.0), math.radians(2.0), math.radians(-10.0))
    pivot.scale.x = 0.88

    base, outline = shield_surface("CR2_Great_Shield_Core", 1.0, 0.0, 0.055, materials["wood"])
    panel, _ = shield_surface("CR2_Great_Shield_Ivory_Face", 0.91, -0.055, -0.025, materials["ivory"])
    base.parent = pivot
    panel.parent = pivot

    rim_points = [(x * 0.985, -0.073, z * 0.985) for x, z in outline]
    rim = curve_poly("CR2_Great_Shield_Gold_Rim", rim_points, materials["gold"], 0.018, True)
    rim.parent = pivot
    cross_v = box("CR2_Shield_Cross_V", (0.050, 0.025, 0.82), materials["gold"], (0, -0.091, 0.02), bevel_width=0.007)
    cross_h = box("CR2_Shield_Cross_H", (0.36, 0.026, 0.052), materials["gold"], (0, -0.092, 0.14), bevel_width=0.008)
    gem = uv_sphere("CR2_Shield_Spirit_Gem", (0, -0.112, 0.14), (0.026, 0.012, 0.026), materials["cyan"], 32, 16)
    for obj in (cross_v, cross_h, gem):
        obj.parent = pivot
    for side in (-1, 1):
        for z in (-0.28, 0.02, 0.34, 0.58):
            stud = uv_sphere(f"CR2_Shield_Rivet_{side}_{z}", (side * 0.305, -0.083, z), (0.012, 0.008, 0.012), materials["gold"], 20, 10)
            stud.parent = pivot
    # Back braces peek around the edge and make the prop read as constructed.
    for z in (-0.25, 0.30):
        brace = box(f"CR2_Shield_Back_Brace_{z}", (0.55, 0.045, 0.075), materials["dark_steel"], (0, 0.082, z), bevel_width=0.010)
        brace.parent = pivot
    return pivot


def blade_mesh(name, material):
    outline = [(-0.036, 0.0), (-0.030, 1.075), (0.0, 1.195), (0.030, 1.075), (0.036, 0.0)]
    thickness = 0.008
    vertices = [(x, -thickness, z) for x, z in outline] + [(x, thickness, z) for x, z in outline]
    count = len(outline)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    bevel(obj, 0.004, 3)
    return obj


def make_sword(materials):
    pivot = bpy.data.objects.new("CR2_Claymore_Pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = (-0.43, -0.17, 1.015)
    pivot.rotation_euler = (math.radians(1.0), math.radians(-1.0), math.radians(-3.0))
    blade = blade_mesh("CR2_Claymore_Long_Thin_Blade", materials["blade"])
    fuller = blade_mesh("CR2_Claymore_Dark_Fuller", materials["dark_steel"])
    fuller.scale = (0.30, 1.15, 0.91)
    fuller.location = (0, -0.012, 0.045)
    guard_curve = curve_poly(
        "CR2_Claymore_Swept_Guard",
        [(-0.20, 0, -0.015), (-0.11, -0.006, 0.010), (0, 0, 0.025), (0.11, -0.006, 0.010), (0.20, 0, -0.015)],
        materials["gold"],
        0.014,
    )
    grip = cylinder("CR2_Claymore_Leather_Grip", (0, 0, -0.145), 0.026, 0.26, materials["leather"])
    pommel = uv_sphere("CR2_Claymore_Pommel", (0, 0, -0.305), (0.045, 0.035, 0.055), materials["gold"], 40, 20)
    gem = uv_sphere("CR2_Claymore_Gem", (0, -0.026, 0.025), (0.025, 0.012, 0.025), materials["cyan"], 32, 16)
    for z in (-0.045, -0.105, -0.165, -0.225):
        wrap = torus(f"CR2_Claymore_Grip_Wrap_{z}", (0, 0, z), 0.027, 0.0035, materials["gold"])
        wrap.scale = (1.0, 0.9, 1.0)
    for obj in list(bpy.data.objects):
        if obj.name.startswith("CR2_Claymore_") and obj is not pivot:
            obj.parent = pivot
    return pivot


def armor_accents(materials):
    # Chest cross and belt are thin, slightly raised pieces rather than a decal.
    box("CR2_Chest_Cross_V", (0.036, 0.018, 0.220), materials["gold"], (0.0, -0.192, 1.520), bevel_width=0.005)
    box("CR2_Chest_Cross_H", (0.205, 0.019, 0.038), materials["gold"], (0.0, -0.193, 1.570), bevel_width=0.006)
    uv_sphere("CR2_Chest_Spirit_Gem", (0.0, -0.211, 1.570), (0.017, 0.008, 0.017), materials["cyan"], 28, 14)
    # Articulated gold belt line and buckle.
    curve_poly(
        "CR2_Gold_Waist_Band",
        [(0.30 * math.cos(a), 0.16 * math.sin(a) - 0.005, 1.205) for a in [2 * math.pi * i / 64 for i in range(64)]],
        materials["gold"],
        0.010,
        True,
    )
    box("CR2_Belt_Buckle", (0.105, 0.025, 0.075), materials["gold"], (0, -0.180, 1.205), bevel_width=0.010)

    # Knees, greaves and boots deliberately remain the source PBR armour. No
    # spherical or capsule overlays: silhouette detail comes from real plates.


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, location, energy, size, color, target=(0, 0, 1.1), shape="DISK"):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = shape
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim(obj, target)
    return obj


def environment(materials):
    floor = box("CR2_Stone_Floor", (12, 12, 0.12), materials["stone"], (0, 0, -0.07), bevel_width=0.025)
    wall = box("CR2_Stone_Backdrop", (10, 0.28, 5.0), materials["wall"], (0, 3.2, 2.35), bevel_width=0.035)
    # Framing columns and shallow masonry courses add scale without competing
    # with the hero silhouette.
    for side in (-1, 1):
        box(f"CR2_Wall_Pillar_{side}", (0.48, 0.35, 4.5), materials["stone"], (side * 2.15, 3.05, 2.15), bevel_width=0.055)
        box(f"CR2_Wall_Pillar_Base_{side}", (0.72, 0.50, 0.22), materials["stone"], (side * 2.15, 2.94, 0.04), bevel_width=0.035)
        box(f"CR2_Wall_Pillar_Cap_{side}", (0.72, 0.50, 0.22), materials["stone"], (side * 2.15, 2.94, 4.22), bevel_width=0.035)
    # Broad lintel and recessed side walls make this read as a medieval hall,
    # not a sterile studio or sci-fi panel wall.
    box("CR2_Hall_Lintel", (4.8, 0.42, 0.42), materials["stone"], (0, 3.00, 4.18), bevel_width=0.06)
    box("CR2_Hall_Left_Return", (0.28, 3.8, 4.2), materials["wall"], (-3.15, 1.35, 2.0), bevel_width=0.05)
    box("CR2_Hall_Right_Return", (0.28, 3.8, 4.2), materials["wall"], (3.15, 1.35, 2.0), bevel_width=0.05)

    focus = bpy.data.objects.new("CR2_Camera_Focus", None)
    bpy.context.collection.objects.link(focus)
    focus.location = (0.02, -0.01, 1.08)
    camera_data = bpy.data.cameras.new("CR2_Hero_Camera")
    camera_data.lens = 85.0
    camera_data.sensor_width = 36.0
    camera_data.dof.use_dof = True
    camera_data.dof.focus_object = focus
    camera_data.dof.aperture_fstop = 7.1
    camera_data.dof.aperture_blades = 9
    camera = bpy.data.objects.new("CR2_Hero_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3.20, -6.00, 0.88)
    aim(camera, focus.location)
    bpy.context.scene.camera = camera

    area("CR2_Key_Softbox", (-3.8, -4.2, 4.5), 1220, 3.0, (1.0, 0.72, 0.43), (0, 0, 1.2))
    area("CR2_Fill_Softbox", (4.0, -2.5, 2.7), 360, 3.5, (0.37, 0.56, 0.88), (0, 0, 1.15))
    area("CR2_Rim_Light", (1.2, 3.0, 3.6), 1320, 2.1, (0.46, 0.70, 1.0), (0, 0, 1.35))
    area("CR2_Top_Warm", (-0.5, 0.4, 5.0), 620, 2.8, (1.0, 0.74, 0.44), (0, 0, 1.0))
    area("CR2_Shield_Kicker", (3.6, -4.8, 1.6), 300, 1.5, (1.0, 0.78, 0.50), (0.72, -0.18, 1.0))
    return camera


def configure(size: int, draft: bool):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 12
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.eevee.taa_render_samples = 128 if draft else 256
    scene.eevee.use_fast_gi = True
    scene.eevee.fast_gi_quality = 0.75 if draft else 1.0
    scene.eevee.fast_gi_step_count = 16 if draft else 32
    scene.eevee.fast_gi_ray_count = 4 if draft else 8
    scene.eevee.fast_gi_distance = 4.0
    scene.eevee.shadow_ray_count = 4 if draft else 8
    scene.eevee.shadow_step_count = 12 if draft else 20
    scene.eevee.shadow_resolution_scale = 1.0
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -1.05
    scene.view_settings.gamma = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("CR2 Dark Hall World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = srgb("050A10")
        background.inputs["Strength"].default_value = 0.18


def main():
    args = cli()
    OUT.mkdir(parents=True, exist_ok=True)
    clear_helpers()
    materials = create_materials()
    grade_source_pbr()
    pose_targets = pose_guard()
    closed_gear = import_closed_helmet_and_faulds(materials)
    shield = make_shield(materials)
    sword = make_sword(materials)
    armor_accents(materials)
    environment(materials)
    configure(args.size, args.draft or args.size < 1600)

    output_render = OUT / ("crusader_hq_v2_idle_draft_1024.png" if args.size <= 1024 else OUT_RENDER.name)
    bpy.context.scene.render.filepath = str(output_render)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - started
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), compress=True)

    report = {
        "source": str(SOURCE),
        "source_asset": {
            "name": "Rigged Knight base",
            "author": "Job Hier",
            "blenderkit_id": "08535653-abb1-4c8f-9d50-2a8b6235a7f5",
            "license": "royalty_free",
            "license_note": "Local derivative only. The source/model is not included in a public or distributable ZIP.",
        },
        "project_gear_source": {
            "blend": str(ACTUAL_GEAR),
            "usage": "project-created fully enclosing rounded great helm, closed bowed visor, chain gorget and modest articulated cuisses",
            "helmet_visible_height_m": 0.30,
            "helmet_share_of_character_height": "approximately 14 percent including crown, with gorget overlap below",
        },
        "output_blend": str(OUT_BLEND),
        "output_render": str(output_render),
        "resolution": [args.size, args.size],
        "engine": "BLENDER_EEVEE",
        "samples": bpy.context.scene.eevee.taa_render_samples,
        "render_seconds": round(elapsed, 2),
        "camera": {"lens_mm": 85.0, "position": [3.20, -6.00, 0.88], "target": [0.02, -0.01, 1.08]},
        "pose_targets": pose_targets,
        "equipment": {
            "helmet": "small fitted rounded cross great helm",
            "shield": "thin convex shoulder-to-below-knee great shield",
            "weapon": "long thin one-handed claymore",
            "palette": "warm ivory steel, sun gold, dark mail/leather, restrained spirit cyan",
        },
        "distribution": {"zip_created": False, "source_redistributed": False},
    }
    OUT_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("CRUSADER_HQ_V2_COMPLETE")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

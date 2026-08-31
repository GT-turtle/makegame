"""Create a non-destructive high-quality look-dev pass for the HBM Crusader.

Run with the project-local Blender build, loading the existing .blend first::

    blender.exe --background artifacts/human-base-sculpt-crusader/\
        human_base_sculpt_crusader.blend \
        --python scripts/create_human_base_sculpt_hq_look.py

The script deliberately does not touch the armature pose, keyframes, actions,
mesh topology, or any of the Human Base Mesh shell modifiers.  It only replaces
material node trees, adds presentation-only shield-back details, lighting,
environment pieces, and two cameras, then saves the result to a new folder.
"""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = PROJECT_ROOT / "artifacts" / "human-base-sculpt-crusader" / "human_base_sculpt_crusader.blend"
OUTPUT_DIR = PROJECT_ROOT / "artifacts" / "human-base-sculpt-crusader-hq-look"
OUTPUT_BLEND = OUTPUT_DIR / "human_base_sculpt_crusader_hq_look.blend"
FRONT_RENDER = OUTPUT_DIR / "human_base_sculpt_crusader_hq_front_3q.png"
BACK_RENDER = OUTPUT_DIR / "human_base_sculpt_crusader_hq_back_3q.png"
MANIFEST_PATH = OUTPUT_DIR / "hq_look_manifest.json"

RENDER_SIZE = 1536
CAMERA_LENS_MM = 78.0
CAMERA_TARGET = Vector((0.05, 0.0, 1.04))


def parse_cli() -> None:
    """Support a tiny optional CLI without introducing external dependencies."""
    global OUTPUT_DIR, OUTPUT_BLEND, FRONT_RENDER, BACK_RENDER, MANIFEST_PATH, RENDER_SIZE
    if "--" not in sys.argv:
        return
    args = sys.argv[sys.argv.index("--") + 1 :]
    for idx, arg in enumerate(args):
        if arg == "--output-dir" and idx + 1 < len(args):
            OUTPUT_DIR = Path(args[idx + 1]).resolve()
        elif arg == "--size" and idx + 1 < len(args):
            RENDER_SIZE = max(1024, int(args[idx + 1]))
    OUTPUT_BLEND = OUTPUT_DIR / "human_base_sculpt_crusader_hq_look.blend"
    FRONT_RENDER = OUTPUT_DIR / "human_base_sculpt_crusader_hq_front_3q.png"
    BACK_RENDER = OUTPUT_DIR / "human_base_sculpt_crusader_hq_back_3q.png"
    MANIFEST_PATH = OUTPUT_DIR / "hq_look_manifest.json"


def ensure_source_loaded() -> None:
    if bpy.data.filepath:
        return
    if not SOURCE_BLEND.exists():
        raise FileNotFoundError(SOURCE_BLEND)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND))


def srgb(hex_color: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Convert a display-space hex swatch to Blender scene-linear values."""
    value = hex_color.lstrip("#")
    rgb = [int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def linear(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return linear(rgb[0]), linear(rgb[1]), linear(rgb[2]), alpha


def node(nodes, node_type: str, name: str, x: float, y: float):
    result = nodes.new(node_type)
    result.name = name
    result.label = name
    result.location = (x, y)
    return result


def input_value(shader, names: tuple[str, ...], value) -> None:
    for name in names:
        if name in shader.inputs:
            shader.inputs[name].default_value = value
            return


def reset_material(name: str):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = node(nodes, "ShaderNodeOutputMaterial", "Material Output", 920, 20)
    shader = node(nodes, "ShaderNodeBsdfPrincipled", "Surface", 590, 20)
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material, nodes, material.node_tree.links, shader


def add_texture_coordinates(nodes, links):
    texcoord = node(nodes, "ShaderNodeTexCoord", "Object Coordinates", -980, 20)
    mapping = node(nodes, "ShaderNodeMapping", "Texture Scale", -790, 20)
    links.new(texcoord.outputs["Generated"], mapping.inputs["Vector"])
    return mapping


def add_noise(nodes, links, vector_socket, name: str, x: float, y: float, scale: float,
              detail: float = 4.0, roughness: float = 0.65, distortion: float = 0.0):
    noise = node(nodes, "ShaderNodeTexNoise", name, x, y)
    noise.noise_dimensions = "3D"
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = roughness
    noise.inputs["Distortion"].default_value = distortion
    links.new(vector_socket, noise.inputs["Vector"])
    return noise


def add_wave(nodes, links, vector_socket, name: str, x: float, y: float, scale: float,
             distortion: float = 4.0, direction: str = "X"):
    wave = node(nodes, "ShaderNodeTexWave", name, x, y)
    wave.wave_type = "BANDS"
    wave.bands_direction = direction
    wave.inputs["Scale"].default_value = scale
    wave.inputs["Distortion"].default_value = distortion
    wave.inputs["Detail"].default_value = 5.0
    wave.inputs["Detail Scale"].default_value = 1.7
    wave.inputs["Detail Roughness"].default_value = 0.72
    links.new(vector_socket, wave.inputs["Vector"])
    return wave


def connect_ramp(nodes, links, source, colors, name, x, y):
    ramp = node(nodes, "ShaderNodeValToRGB", name, x, y)
    ramp.color_ramp.interpolation = "EASE"
    first = ramp.color_ramp.elements[0]
    first.position, first.color = colors[0]
    last = ramp.color_ramp.elements[-1]
    last.position, last.color = colors[-1]
    for position, color in colors[1:-1]:
        element = ramp.color_ramp.elements.new(position)
        element.color = color
    links.new(source, ramp.inputs["Fac"])
    return ramp


def connect_roughness(nodes, links, source, shader, low: float, high: float, x: float, y: float):
    mapper = node(nodes, "ShaderNodeMapRange", "Roughness Variation", x, y)
    mapper.inputs["From Min"].default_value = 0.0
    mapper.inputs["From Max"].default_value = 1.0
    mapper.inputs["To Min"].default_value = low
    mapper.inputs["To Max"].default_value = high
    mapper.clamp = True
    links.new(source, mapper.inputs["Value"])
    links.new(mapper.outputs["Result"], shader.inputs["Roughness"])


def connect_micro_bump(nodes, links, vector_socket, shader, *, strength: float, distance: float,
                       noise_scale: float, wave_scale: float, x: float = -390, y: float = -280):
    micro = add_noise(nodes, links, vector_socket, "Fine Hammering", x - 210, y + 80,
                      noise_scale, detail=2.2, roughness=0.72, distortion=0.15)
    scratches = add_wave(nodes, links, vector_socket, "Directional Micro Scratches", x - 210, y - 100,
                         wave_scale, distortion=8.5, direction="X")
    multiply = node(nodes, "ShaderNodeMixRGB", "Irregular Scratch Mask", x, y)
    multiply.blend_type = "MULTIPLY"
    multiply.inputs[0].default_value = 0.30
    links.new(micro.outputs["Fac"], multiply.inputs[1])
    links.new(scratches.outputs["Color"], multiply.inputs[2])
    bump = node(nodes, "ShaderNodeBump", "Subtle Surface Relief", x + 210, y)
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    links.new(multiply.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])


def build_ivory(name: str, light_variant: bool = False):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    broad = add_noise(nodes, links, mapping.outputs["Vector"], "Forged Tonal Variation", -590, 210,
                      4.2, detail=5.0, roughness=0.70, distortion=0.28)
    colors = [
        (0.18, srgb("8B806B" if not light_variant else "A2967D")),
        (0.50, srgb("B9AD8F" if not light_variant else "D0C5A6")),
        (0.82, srgb("D5CBAE" if not light_variant else "E6DCC0")),
    ]
    ramp = connect_ramp(nodes, links, broad.outputs["Fac"], colors, "Warm Ivory Plate", -330, 220)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Metallic",), 0.66)
    input_value(shader, ("IOR",), 1.46)
    input_value(shader, ("Coat Weight", "Clearcoat"), 0.16)
    input_value(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.30)
    connect_roughness(nodes, links, broad.outputs["Fac"], shader, 0.27, 0.42, -60, 155)
    connect_micro_bump(nodes, links, mapping.outputs["Vector"], shader, strength=0.115,
                       distance=0.016, noise_scale=55.0, wave_scale=235.0)
    return material


def build_gold(name: str, aged: bool = False):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    broad = add_noise(nodes, links, mapping.outputs["Vector"], "Gold Patina", -590, 210,
                      5.8, detail=4.0, roughness=0.62, distortion=0.2)
    colors = [
        (0.14, srgb("5A3210" if aged else "765018")),
        (0.48, srgb("A66B18" if aged else "BE8526")),
        (0.84, srgb("D39A36" if aged else "E0B653")),
    ]
    ramp = connect_ramp(nodes, links, broad.outputs["Fac"], colors, "Warm Gold Alloy", -330, 220)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Metallic",), 0.93 if not aged else 0.87)
    input_value(shader, ("IOR",), 1.48)
    input_value(shader, ("Coat Weight", "Clearcoat"), 0.12)
    input_value(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.25)
    input_value(shader, ("Anisotropic IOR Level", "Anisotropic"), 0.22)
    connect_roughness(nodes, links, broad.outputs["Fac"], shader,
                      0.24 if not aged else 0.34, 0.36 if not aged else 0.52, -60, 155)
    connect_micro_bump(nodes, links, mapping.outputs["Vector"], shader, strength=0.075,
                       distance=0.010, noise_scale=95.0, wave_scale=310.0)
    return material


def build_steel(name: str, dark: bool = False):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    broad = add_noise(nodes, links, mapping.outputs["Vector"], "Steel Oxidation", -590, 210,
                      7.5, detail=3.5, roughness=0.60, distortion=0.12)
    colors = [
        (0.15, srgb("111820" if dark else "48535C")),
        (0.52, srgb("26313A" if dark else "7D8991")),
        (0.86, srgb("46515A" if dark else "BAC3C6")),
    ]
    ramp = connect_ramp(nodes, links, broad.outputs["Fac"], colors, "Brushed Steel", -330, 220)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Metallic",), 0.88 if dark else 0.94)
    input_value(shader, ("Anisotropic IOR Level", "Anisotropic"), 0.30)
    connect_roughness(nodes, links, broad.outputs["Fac"], shader,
                      0.36 if dark else 0.22, 0.55 if dark else 0.34, -60, 155)
    connect_micro_bump(nodes, links, mapping.outputs["Vector"], shader, strength=0.070,
                       distance=0.008, noise_scale=110.0, wave_scale=360.0)
    return material


def build_chain_cloth(name: str):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    warp = add_wave(nodes, links, mapping.outputs["Vector"], "Warp Threads", -590, 185,
                    92.0, distortion=1.2, direction="X")
    weft = add_wave(nodes, links, mapping.outputs["Vector"], "Weft Threads", -590, -5,
                    92.0, distortion=1.1, direction="Y")
    weave = node(nodes, "ShaderNodeMixRGB", "Interlaced Weave", -310, 80)
    weave.blend_type = "MULTIPLY"
    weave.inputs[0].default_value = 1.0
    links.new(warp.outputs["Color"], weave.inputs[1])
    links.new(weft.outputs["Color"], weave.inputs[2])
    ramp = connect_ramp(nodes, links, weave.outputs["Color"], [
        (0.25, srgb("060A0E")), (0.52, srgb("101B24")), (0.78, srgb("273640")),
    ], "Dark Mail and Cloth", -65, 170)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Metallic",), 0.24)
    input_value(shader, ("Roughness",), 0.72)
    input_value(shader, ("Sheen Weight", "Sheen"), 0.10)
    bump = node(nodes, "ShaderNodeBump", "Woven Relief", 320, -45)
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.018
    links.new(weave.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def build_leather(name: str):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    grain = add_noise(nodes, links, mapping.outputs["Vector"], "Leather Grain", -590, 205,
                      7.0, detail=8.0, roughness=0.78, distortion=0.34)
    pores = add_noise(nodes, links, mapping.outputs["Vector"], "Leather Pores", -590, -65,
                      120.0, detail=2.2, roughness=0.72, distortion=0.18)
    ramp = connect_ramp(nodes, links, grain.outputs["Fac"], [
        (0.18, srgb("21100A")), (0.50, srgb("4C2513")), (0.84, srgb("7B4827")),
    ], "Oiled Brown Leather", -310, 215)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Metallic",), 0.0)
    input_value(shader, ("Roughness",), 0.69)
    input_value(shader, ("Coat Weight", "Clearcoat"), 0.10)
    input_value(shader, ("Coat Roughness", "Clearcoat Roughness"), 0.56)
    bump = node(nodes, "ShaderNodeBump", "Leather Pore Relief", 290, -80)
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.025
    links.new(pores.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def build_wood(name: str):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    wave = node(nodes, "ShaderNodeTexWave", "Long Wood Grain", -580, 140)
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 5.2
    wave.inputs["Distortion"].default_value = 7.0
    wave.inputs["Detail"].default_value = 7.0
    wave.inputs["Detail Scale"].default_value = 1.8
    wave.inputs["Detail Roughness"].default_value = 0.72
    links.new(mapping.outputs["Vector"], wave.inputs["Vector"])
    ramp = connect_ramp(nodes, links, wave.outputs["Color"], [
        (0.12, srgb("3A1F0F")), (0.50, srgb("5B351A")), (0.88, srgb("76502D")),
    ], "Dark Oak", -300, 160)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Roughness",), 0.58)
    input_value(shader, ("Coat Weight", "Clearcoat"), 0.07)
    bump = node(nodes, "ShaderNodeBump", "Raised Wood Grain", 275, -50)
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.025
    links.new(wave.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def build_cyan(name: str):
    material, nodes, links, shader = reset_material(name)
    base = srgb("0A6972")
    glow = srgb("48D9DD")
    input_value(shader, ("Base Color",), base)
    input_value(shader, ("Metallic",), 0.12)
    input_value(shader, ("Roughness",), 0.29)
    input_value(shader, ("Emission Color", "Emission"), glow)
    input_value(shader, ("Emission Strength",), 1.35)
    return material


def build_flat_dark(name: str):
    material, _nodes, _links, shader = reset_material(name)
    input_value(shader, ("Base Color",), srgb("020508"))
    input_value(shader, ("Metallic",), 0.05)
    input_value(shader, ("Roughness",), 0.82)
    return material


def build_stone(name: str, wall: bool = False):
    material, nodes, links, shader = reset_material(name)
    mapping = add_texture_coordinates(nodes, links)
    noise = add_noise(nodes, links, mapping.outputs["Vector"], "Stone Variation", -590, 160,
                      3.2 if not wall else 2.4, detail=7.0, roughness=0.78, distortion=0.22)
    ramp = connect_ramp(nodes, links, noise.outputs["Fac"], [
        (0.16, srgb("111820" if wall else "20272B")),
        (0.52, srgb("25303A" if wall else "3A4142")),
        (0.84, srgb("45515A" if wall else "686660")),
    ], "Slate Stone", -310, 180)
    links.new(ramp.outputs["Color"], shader.inputs["Base Color"])
    input_value(shader, ("Roughness",), 0.82)
    bump = node(nodes, "ShaderNodeBump", "Stone Relief", 260, -30)
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.045
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return material


def replace_materials() -> dict[str, bpy.types.Material]:
    materials = {
        "ivory": build_ivory("HB_Ivory_Plate", False),
        "ivory_light": build_ivory("HB_Ivory_Highlight", True),
        "gold": build_gold("HB_Sun_Gold", False),
        "aged_gold": build_gold("HB_Aged_Gold", True),
        "steel": build_steel("HB_Claymore_Steel", False),
        "dark_iron": build_steel("HB_Dark_Iron", True),
        "chain_cloth": build_chain_cloth("HB_Underarmor_Navy"),
        "leather": build_leather("HB_Shield_Leather"),
        "wood": build_wood("HQ_Shield_Dark_Oak"),
        "cyan": build_cyan("HB_Spirit_Cyan"),
        "slit": build_flat_dark("HB_Helmet_Slit"),
        "floor": build_stone("HB_Neutral_Studio_Floor", False),
        "wall": build_stone("HQ_Courtyard_Wall", True),
    }
    return materials


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if not hasattr(obj.data, "materials"):
        return
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def rounded_box(name: str, location, dimensions, material, *, bevel=0.025, parent=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel_modifier = obj.modifiers.new("Soft worn edges", "BEVEL")
    bevel_modifier.width = bevel
    bevel_modifier.segments = 3
    assign_material(obj, material)
    if parent is not None:
        obj.parent = parent
        obj.matrix_parent_inverse.identity()
    return obj


def add_shield_back_details(materials: dict[str, bpy.types.Material]) -> list[str]:
    pivot = bpy.data.objects.get("HB_GreatShield_Pivot")
    if pivot is None:
        return []

    created = []
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HQ_Shield_Back_"):
            bpy.data.objects.remove(obj, do_unlink=True)

    for idx, z in enumerate((0.67, 1.35), start=1):
        brace = rounded_box(
            f"HQ_Shield_Back_Wood_Brace_{idx}",
            (0.635, -0.082, z),
            (0.605, 0.050, 0.072),
            materials["wood"],
            bevel=0.018,
            parent=pivot,
        )
        created.append(brace.name)
        for side in (-1, 1):
            bpy.ops.mesh.primitive_uv_sphere_add(
                segments=24,
                ring_count=12,
                location=(0.635 + side * 0.245, -0.047, z),
                scale=(0.020, 0.011, 0.020),
            )
            rivet = bpy.context.object
            rivet.name = f"HQ_Shield_Back_Metal_Rivet_{idx}_{'L' if side < 0 else 'R'}"
            assign_material(rivet, materials["dark_iron"])
            rivet.parent = pivot
            rivet.matrix_parent_inverse.identity()
            created.append(rivet.name)

    forearm = bpy.data.objects.get("HB_Shield_Forearm_Brace")
    if forearm is not None:
        assign_material(forearm, materials["dark_iron"])
    grip = bpy.data.objects.get("HB_Shield_Hand_Grip")
    if grip is not None:
        assign_material(grip, materials["leather"])
    return created


def remove_hq_objects() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith("HQ_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def aim_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_camera(name: str, location, focus: bpy.types.Object) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = CAMERA_LENS_MM
    data.sensor_width = 36.0
    data.clip_start = 0.05
    data.clip_end = 100.0
    data.dof.use_dof = True
    data.dof.focus_object = focus
    data.dof.aperture_fstop = 7.1
    data.dof.aperture_blades = 8
    camera = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(camera)
    camera.location = location
    aim_at(camera, CAMERA_TARGET)
    return camera


def create_area_light(name: str, location, energy: float, color, size: float, target=(0, 0, 1.05)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    aim_at(obj, Vector(target))
    return obj


def create_environment(materials):
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and not obj.name.startswith("HQ_"):
            obj.hide_render = True

    old_floor = bpy.data.objects.get("HB_Neutral_Studio_Floor")
    if old_floor is not None:
        old_floor.hide_render = True

    floor = rounded_box("HQ_Courtyard_Floor", (0.0, 0.0, -0.075), (12.0, 12.0, 0.14),
                        materials["floor"], bevel=0.035)
    positive_wall = rounded_box("HQ_Backdrop_PositiveY", (0.0, 3.45, 2.2), (10.0, 0.15, 4.5),
                                materials["wall"], bevel=0.05)
    negative_wall = rounded_box("HQ_Backdrop_NegativeY", (0.0, -3.45, 2.2), (10.0, 0.15, 4.5),
                                materials["wall"], bevel=0.05)

    pillars = []
    for wall_label, y in (("PositiveY", 3.34), ("NegativeY", -3.34)):
        for side in (-1, 1):
            pillar = rounded_box(
                f"HQ_Pillar_{wall_label}_{'L' if side < 0 else 'R'}",
                (side * 3.15, y, 2.1),
                (0.38, 0.24, 4.2),
                materials["floor"],
                bevel=0.045,
            )
            pillars.append(pillar)

    focus_data = None
    focus = bpy.data.objects.new("HQ_Camera_Focus", focus_data)
    bpy.context.collection.objects.link(focus)
    focus.location = CAMERA_TARGET

    front_camera = create_camera("HQ_Front_3Q_Camera", (3.17, -5.20, 1.32), focus)
    # The back silhouette is narrower than the raised-shield front silhouette,
    # so this camera sits slightly closer.  A small rightward aim offset keeps
    # the long claymore inside the square frame without changing the pose.
    back_camera = create_camera("HQ_Back_3Q_Camera", (-2.96, 4.86, 1.31), focus)
    aim_at(back_camera, Vector((0.22, 0.0, 1.04)))

    create_area_light("HQ_Key_Light", (-3.4, -4.0, 4.6), 720.0, (1.0, 0.80, 0.60), 3.4)
    create_area_light("HQ_Fill_Light", (4.2, -2.3, 2.9), 390.0, (0.48, 0.66, 1.0), 3.2)
    create_area_light("HQ_Back_Key_Light", (3.0, 4.1, 4.0), 690.0, (1.0, 0.73, 0.48), 3.0)
    create_area_light("HQ_Back_Fill_Light", (-4.0, 2.2, 2.7), 330.0, (0.48, 0.70, 1.0), 3.0)
    create_area_light("HQ_Top_Softbox", (0.0, 0.0, 5.2), 430.0, (1.0, 0.88, 0.72), 3.8)

    return {
        "floor": floor,
        "positive_wall": positive_wall,
        "negative_wall": negative_wall,
        "pillars": pillars,
        "front_camera": front_camera,
        "back_camera": back_camera,
    }


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 18
    scene.render.film_transparent = False
    scene.render.use_file_extension = True

    scene.eevee.taa_render_samples = 128
    scene.eevee.use_fast_gi = True
    scene.eevee.fast_gi_quality = 0.75
    scene.eevee.fast_gi_step_count = 16
    scene.eevee.fast_gi_ray_count = 4
    scene.eevee.fast_gi_distance = 4.0
    scene.eevee.shadow_ray_count = 4
    scene.eevee.shadow_step_count = 12
    scene.eevee.shadow_resolution_scale = 1.0

    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -0.65
    scene.view_settings.gamma = 1.0

    if scene.world is None:
        scene.world = bpy.data.worlds.new("HQ_Courtyard_World")
    scene.world.use_nodes = True
    world_nodes = scene.world.node_tree.nodes
    background = world_nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = srgb("08111A")
        background.inputs["Strength"].default_value = 0.20


def set_backdrop_visibility(env, front: bool) -> None:
    env["positive_wall"].hide_render = not front
    env["negative_wall"].hide_render = front
    for pillar in env["pillars"]:
        is_positive = "PositiveY" in pillar.name
        pillar.hide_render = (not is_positive) if front else is_positive


def render_view(env, *, front: bool, path: Path) -> float:
    scene = bpy.context.scene
    set_backdrop_visibility(env, front)
    scene.camera = env["front_camera"] if front else env["back_camera"]
    scene.render.filepath = str(path)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    return time.perf_counter() - started


def main() -> None:
    parse_cli()
    ensure_source_loaded()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    source_filepath = str(Path(bpy.data.filepath).resolve())
    source_frame = bpy.context.scene.frame_current
    rig = bpy.data.objects.get("HB_Sculpt_Rigify")
    source_action = None
    if rig and rig.animation_data and rig.animation_data.action:
        source_action = rig.animation_data.action.name

    remove_hq_objects()
    materials = replace_materials()
    shield_details = add_shield_back_details(materials)
    configure_scene()
    environment = create_environment(materials)

    # Save front-composition defaults.  The original pose and frame are retained.
    set_backdrop_visibility(environment, True)
    bpy.context.scene.camera = environment["front_camera"]
    bpy.context.scene.frame_set(source_frame)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), compress=True)

    front_seconds = render_view(environment, front=True, path=FRONT_RENDER)
    back_seconds = render_view(environment, front=False, path=BACK_RENDER)

    # Return the reusable blend to the front-view setup before final save.
    set_backdrop_visibility(environment, True)
    bpy.context.scene.camera = environment["front_camera"]
    bpy.context.scene.frame_set(source_frame)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), compress=True)

    manifest = {
        "source_blend": source_filepath,
        "output_blend": str(OUTPUT_BLEND),
        "renders": {
            "front_3q": str(FRONT_RENDER),
            "back_3q": str(BACK_RENDER),
        },
        "render": {
            "engine": "BLENDER_EEVEE",
            "resolution": [RENDER_SIZE, RENDER_SIZE],
            "taa_render_samples": 128,
            "camera_lens_mm": CAMERA_LENS_MM,
            "camera_pitch_note": "near-horizontal 3/4; front target=(0.05,0,1.04), back aim offset x=0.22",
            "front_seconds": round(front_seconds, 2),
            "back_seconds": round(back_seconds, 2),
            "estimated_five_stills_seconds": round(((front_seconds + back_seconds) / 2.0) * 5.0, 1),
        },
        "preservation": {
            "source_frame": source_frame,
            "source_action": source_action,
            "pose_or_action_edited": False,
            "mesh_topology_edited": False,
            "shell_modifiers_edited": False,
        },
        "look": {
            "ivory": "layered warm ivory, forged tonal variation, fine hammering and directional scratches",
            "gold": "warm metallic gold, restrained highlights, patina and micro-scratches",
            "joints": "dark navy mail/cloth with procedural crossed weave",
            "shield_back": "oiled leather grain, dark-oak braces, dark iron forearm brace and rivets",
            "runes": "restrained cyan emission strength 1.35",
            "environment": "dark slate courtyard floor and low-contrast masonry backdrop",
        },
        "added_shield_details": shield_details,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("HQ_LOOK_COMPLETE")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

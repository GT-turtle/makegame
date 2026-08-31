"""Build and render a lightweight rigged Crusader motion prototype in Blender.

Run from the repository root with Blender Portable:

    blender.exe --background --python scripts/render_crusader_motion.py

The script intentionally uses only Blender primitives and procedural materials so
the resulting .blend is self-contained.  Every visible character part is a low
poly mesh rigid-weighted (weight 1.0) to one named Armature bone.
"""

from __future__ import annotations

import math
import os
import json
import subprocess
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = REPO_ROOT / "artifacts" / "crusader-3d"
FRAMES_DIR = OUTPUT_DIR / "frames"
BLEND_PATH = OUTPUT_DIR / "crusader_lowpoly_rig.blend"
FFMPEG_PATH = REPO_ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffmpeg.exe"
FFPROBE_PATH = REPO_ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffprobe.exe"

FPS = 24
RENDER_SIZE = 720


def clean_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        # Data blocks with no users are safe to remove after clearing the scene.
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material(
    name: str,
    rgba: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.48,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
        if emission_strength > 0.0:
            emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
            if emission_input:
                emission_input.default_value = rgba
            strength_input = bsdf.inputs.get("Emission Strength")
            if strength_input:
                strength_input.default_value = emission_strength
    return material


def set_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(material)


def apply_object_transform(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def add_bevel(obj: bpy.types.Object, width: float = 0.025, segments: int = 2) -> None:
    modifier = obj.modifiers.new(name="Soft bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def create_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.02,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_object_transform(obj)
    if bevel > 0:
        add_bevel(obj, bevel)
    set_material(obj, material)
    return obj


def create_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    *,
    vertices: int = 10,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    scale: tuple[float, float, float] = (1.0, 1.0, 1.0),
    bevel: float = 0.015,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_object_transform(obj)
    if bevel > 0:
        add_bevel(obj, bevel, 1)
    set_material(obj, material)
    return obj


def create_ico(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    subdivisions: int = 2,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_object_transform(obj)
    set_material(obj, material)
    return obj


def create_torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=24,
        minor_segments=6,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_object_transform(obj)
    set_material(obj, material)
    return obj


def create_cone(
    name: str,
    location: tuple[float, float, float],
    radius1: float,
    radius2: float,
    depth: float,
    material: bpy.types.Material,
    *,
    vertices: int = 8,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius1,
        radius2=radius2,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    apply_object_transform(obj)
    set_material(obj, material)
    return obj


def create_shield_shape(
    name: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Create an extruded, shoulder-to-below-knee heater shield."""
    cx, cy, cz = center
    outline = [
        (-0.47, 0.48),
        (-0.30, 0.57),
        (0.30, 0.57),
        (0.47, 0.48),
        (0.43, -0.28),
        (0.28, -0.50),
        (0.00, -0.60),
        (-0.28, -0.50),
        (-0.43, -0.28),
    ]
    front_y = cy - thickness * 0.5
    back_y = cy + thickness * 0.5
    verts = []
    for x, z in outline:
        verts.append((cx + x * width, front_y, cz + z * height))
    for x, z in outline:
        verts.append((cx + x * width, back_y, cz + z * height))
    count = len(outline)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    bevel = obj.modifiers.new(name="Shield edge", type="BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return obj


def create_cape(
    name: str,
    material: bpy.types.Material,
    *,
    upper: bool,
) -> bpy.types.Object:
    if upper:
        verts = [
            (-0.35, 0.15, 1.50),
            (0.35, 0.15, 1.50),
            (0.43, 0.24, 0.98),
            (-0.43, 0.24, 0.98),
            (0.0, 0.31, 1.02),
        ]
        faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)]
    else:
        verts = [
            (-0.42, 0.24, 1.04),
            (0.42, 0.24, 1.04),
            (0.34, 0.38, 0.38),
            (0.0, 0.43, 0.26),
            (-0.34, 0.38, 0.38),
        ]
        faces = [(0, 1, 2, 3, 4)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    solidify = None
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_material(obj, material)
    solidify = obj.modifiers.new(name="Cape thickness", type="SOLIDIFY")
    solidify.thickness = 0.018
    return obj


def create_armature() -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("CrusaderSkeleton")
    armature = bpy.data.objects.new("Crusader_Rig", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    armature["character_height_m"] = 1.90
    armature["design_source"] = "assets/character-crusader-webtoon-v1.png"
    armature["rig_type"] = "rigid-weighted low-poly prototype"

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    bones: dict[str, bpy.types.EditBone] = {}

    def bone(name, head, tail, parent=None, connected=False):
        edit_bone = armature_data.edit_bones.new(name)
        edit_bone.head = head
        edit_bone.tail = tail
        if parent:
            edit_bone.parent = bones[parent]
            edit_bone.use_connect = connected
        bones[name] = edit_bone
        return edit_bone

    bone("root", (0, 0, 0.02), (0, 0, 0.22))
    bone("hips", (0, 0, 0.90), (0, 0, 1.08), "root")
    bone("spine", (0, 0, 1.04), (0, 0, 1.34), "hips", True)
    bone("chest", (0, 0, 1.30), (0, 0, 1.54), "spine", True)
    bone("neck", (0, 0, 1.52), (0, 0, 1.64), "chest", True)
    bone("head", (0, 0, 1.62), (0, 0, 1.88), "neck", True)

    bone("upper_arm.L", (-0.34, 0, 1.48), (-0.52, -0.01, 1.20), "chest")
    bone("forearm.L", (-0.52, -0.01, 1.20), (-0.53, -0.09, 0.95), "upper_arm.L", True)
    bone("hand.L", (-0.53, -0.09, 0.95), (-0.53, -0.13, 0.83), "forearm.L", True)
    bone("upper_arm.R", (0.34, 0, 1.48), (0.52, -0.01, 1.20), "chest")
    bone("forearm.R", (0.52, -0.01, 1.20), (0.53, -0.09, 0.95), "upper_arm.R", True)
    bone("hand.R", (0.53, -0.09, 0.95), (0.53, -0.13, 0.83), "forearm.R", True)

    bone("thigh.L", (-0.17, 0, 0.94), (-0.19, 0, 0.57), "hips")
    bone("shin.L", (-0.19, 0, 0.57), (-0.19, -0.01, 0.20), "thigh.L", True)
    bone("foot.L", (-0.19, -0.01, 0.20), (-0.19, -0.24, 0.10), "shin.L", True)
    bone("thigh.R", (0.17, 0, 0.94), (0.19, 0, 0.57), "hips")
    bone("shin.R", (0.19, 0, 0.57), (0.19, -0.01, 0.20), "thigh.R", True)
    bone("foot.R", (0.19, -0.01, 0.20), (0.19, -0.24, 0.10), "shin.R", True)

    bpy.ops.object.mode_set(mode="POSE")
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature


def rigid_weight(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    """Bind every vertex of a mesh to one bone at weight 1.0."""
    if obj.type != "MESH":
        return
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new(name="Rigid Armature", type="ARMATURE")
    modifier.object = armature
    obj["rigid_bone"] = bone_name


def build_character(materials: dict[str, bpy.types.Material], armature: bpy.types.Object) -> list[bpy.types.Object]:
    ivory = materials["ivory"]
    pearl = materials["pearl"]
    gold = materials["gold"]
    yellow = materials["yellow"]
    dark = materials["dark"]
    leather = materials["leather"]
    cyan = materials["cyan"]
    cape_mat = materials["cape"]

    parts: list[tuple[bpy.types.Object, str]] = []

    def bind(obj, bone):
        parts.append((obj, bone))
        return obj

    # Broad 190 cm armored silhouette.
    bind(create_ico("Breastplate", (0, 0, 1.31), (0.43, 0.25, 0.42), ivory), "chest")
    bind(create_cube("ChestGoldV", (0, -0.244, 1.34), (0.055, 0.022, 0.29), gold, bevel=0.014), "chest")
    bind(create_cube("ChestGoldH", (0, -0.265, 1.42), (0.24, 0.022, 0.045), gold, bevel=0.014), "chest")
    bind(create_cylinder("Waist", (0, 0, 1.00), 0.29, 0.22, dark, vertices=10), "hips")
    bind(create_cube("GoldBelt", (0, -0.21, 1.02), (0.31, 0.055, 0.055), gold, bevel=0.018), "hips")
    bind(create_cube("BeltSeal", (0, -0.29, 1.02), (0.07, 0.025, 0.08), cyan, bevel=0.025), "hips")

    # Rounded helmet with a reinforced cross visor and a crown-like top ridge.
    bind(create_ico("RoundHelmet", (0, -0.005, 1.72), (0.27, 0.245, 0.30), pearl, subdivisions=2), "head")
    bind(create_cube("DarkEyeSlit", (0, -0.244, 1.75), (0.17, 0.017, 0.025), dark, bevel=0.008), "head")
    bind(create_cube("HelmetCrossVertical", (0, -0.272, 1.73), (0.035, 0.017, 0.245), gold, bevel=0.012), "head")
    bind(create_cube("HelmetCrossHorizontal", (0, -0.275, 1.76), (0.20, 0.017, 0.038), gold, bevel=0.012), "head")
    bind(create_cube("HelmetBrow", (0, -0.268, 1.88), (0.20, 0.025, 0.025), yellow, bevel=0.012), "head")
    bind(create_cone("HelmetCrestCenter", (0, 0.015, 2.01), 0.09, 0.018, 0.28, gold, vertices=6), "head")
    bind(create_cone("HelmetCrestLeft", (-0.11, 0.035, 1.98), 0.07, 0.012, 0.22, yellow, vertices=6, rotation=(0.0, -0.16, 0.0)), "head")
    bind(create_cone("HelmetCrestRight", (0.11, 0.035, 1.98), 0.07, 0.012, 0.22, yellow, vertices=6, rotation=(0.0, 0.16, 0.0)), "head")
    bind(create_torus("HelmetHalo", (0, 0.06, 1.83), 0.29, 0.018, cyan, rotation=(math.radians(90), 0, 0)), "head")

    # Layered pauldrons and limbs.
    for side, x in (("L", -0.43), ("R", 0.43)):
        bind(create_ico(f"Pauldron.{side}", (x, 0, 1.49), (0.25, 0.28, 0.20), gold), f"upper_arm.{side}")
        bind(create_cube(f"PauldronStripe.{side}", (x, -0.245, 1.50), (0.15, 0.025, 0.042), yellow, bevel=0.016), f"upper_arm.{side}")
        sx = -1 if side == "L" else 1
        bind(create_cylinder(f"UpperArm.{side}", (sx * 0.46, -0.005, 1.33), 0.14, 0.31, ivory, vertices=10, rotation=(0, math.radians(sx * 31), 0)), f"upper_arm.{side}")
        bind(create_cylinder(f"Forearm.{side}", (sx * 0.525, -0.05, 1.07), 0.13, 0.29, pearl, vertices=10, rotation=(math.radians(-17), math.radians(sx * 2), 0)), f"forearm.{side}")
        bind(create_ico(f"Gauntlet.{side}", (sx * 0.53, -0.11, 0.88), (0.14, 0.13, 0.16), gold), f"hand.{side}")

    for side, x in (("L", -0.18), ("R", 0.18)):
        bind(create_cylinder(f"Thigh.{side}", (x, 0, 0.74), 0.16, 0.42, dark, vertices=10), f"thigh.{side}")
        bind(create_cube(f"ThighPlate.{side}", (x, -0.12, 0.77), (0.16, 0.07, 0.19), ivory, bevel=0.04), f"thigh.{side}")
        bind(create_cylinder(f"Shin.{side}", (x, -0.005, 0.38), 0.145, 0.38, pearl, vertices=10), f"shin.{side}")
        bind(create_cube(f"KneeGold.{side}", (x, -0.135, 0.57), (0.15, 0.06, 0.08), gold, bevel=0.03), f"shin.{side}")
        bind(create_cube(f"Boot.{side}", (x, -0.10, 0.12), (0.17, 0.25, 0.12), dark, bevel=0.045), f"foot.{side}")
        bind(create_cube(f"BootToe.{side}", (x, -0.28, 0.10), (0.16, 0.16, 0.09), gold, bevel=0.05), f"foot.{side}")

    # Cape is split between chest and hips to keep the prototype deformation rigid.
    bind(create_cape("CapeUpper", cape_mat, upper=True), "chest")
    bind(create_cape("CapeLower", cape_mat, upper=False), "hips")

    # Shield: 1.5x heroic scale, shoulder to below knee, with an ivory face and gold cross.
    shield_center = (-0.69, -0.30, 1.10)
    bind(create_shield_shape("ShieldGoldRim", shield_center, 0.92, 1.58, 0.105, gold), "hand.L")
    bind(create_shield_shape("ShieldIvoryFace", (-0.69, -0.363, 1.10), 0.82, 1.46, 0.036, ivory), "hand.L")
    bind(create_cube("ShieldCrossVertical", (-0.69, -0.405, 1.13), (0.065, 0.025, 0.49), yellow, bevel=0.022), "hand.L")
    bind(create_cube("ShieldCrossHorizontal", (-0.69, -0.412, 1.28), (0.27, 0.025, 0.065), yellow, bevel=0.022), "hand.L")
    bind(create_ico("ShieldSpiritGem", (-0.69, -0.445, 1.28), (0.08, 0.04, 0.08), cyan), "hand.L")

    # Thin claymore-sized sword wielded one-handed.
    sword_rest_angle = math.radians(-45)
    bind(create_cube("SwordGrip", (0.58, -0.13, 0.82), (0.042, 0.042, 0.13), leather, rotation=(0.0, sword_rest_angle, 0.0), bevel=0.014), "hand.R")
    bind(create_cube("SwordGuard", (0.67, -0.13, 0.72), (0.19, 0.040, 0.033), gold, rotation=(0.0, sword_rest_angle, 0.0), bevel=0.016), "hand.R")
    bind(create_cube("SwordBlade", (0.95, -0.13, 0.40), (0.070, 0.022, 0.46), pearl, rotation=(0.0, sword_rest_angle, 0.0), bevel=0.011), "hand.R")
    bind(create_cone("SwordTip", (1.34, -0.13, 0.01), 0.0, 0.073, 0.16, pearl, vertices=4, rotation=(0.0, sword_rest_angle, 0.0)), "hand.R")
    bind(create_cube("SwordRune", (0.94, -0.156, 0.40), (0.016, 0.009, 0.22), cyan, rotation=(0.0, sword_rest_angle, 0.0), bevel=0.006), "hand.R")

    # Floating elemental companion: three cyan wisps bound to chest for a gentle secondary read.
    for index, (loc, scale) in enumerate((
        ((0.72, 0.10, 1.70), (0.075, 0.045, 0.12)),
        ((0.84, 0.08, 1.56), (0.050, 0.035, 0.08)),
        ((0.64, 0.14, 1.86), (0.045, 0.030, 0.07)),
    )):
        bind(create_ico(f"SpiritWisp{index + 1}", loc, scale, cyan), "chest")

    for obj, bone_name in parts:
        rigid_weight(obj, armature, bone_name)
    return [obj for obj, _ in parts]


def reset_pose(armature: bpy.types.Object) -> None:
    for bone in armature.pose.bones:
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def insert_pose(
    armature: bpy.types.Object,
    frame: int,
    *,
    rotations: dict[str, tuple[float, float, float]] | None = None,
    locations: dict[str, tuple[float, float, float]] | None = None,
) -> None:
    reset_pose(armature)
    for name, rotation in (rotations or {}).items():
        armature.pose.bones[name].rotation_euler = rotation
    for name, location in (locations or {}).items():
        armature.pose.bones[name].location = location
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)


def build_actions(armature: bpy.types.Object) -> dict[str, tuple[bpy.types.Action, int]]:
    armature.animation_data_create()
    actions: dict[str, tuple[bpy.types.Action, int]] = {}

    def action(name: str, length: int):
        clip = bpy.data.actions.new(name=name)
        clip.use_fake_user = True
        armature.animation_data.action = clip
        actions[name] = (clip, length)
        return clip

    # 2 second breathing loop.
    action("IDLE", 48)
    for frame, z, sway in ((1, 0.000, -0.015), (13, 0.018, 0.018), (25, 0.000, -0.015), (37, -0.008, 0.012), (49, 0.000, -0.015)):
        insert_pose(
            armature,
            frame,
            rotations={
                "chest": (0.012, sway, 0.0),
                "head": (-0.015, -sway * 0.6, 0.0),
                "upper_arm.L": (0.025 + sway, 0.0, 0.0),
                "upper_arm.R": (-0.018 - sway, 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, z)},
        )

    # Armored walk cycle.
    action("WALK", 32)
    walk_poses = (
        (1, 0.00, 0.48, -0.48, -0.28, 0.28, 0.02),
        (9, 0.04, 0.02, -0.08, -0.03, 0.05, 0.00),
        (17, 0.00, -0.48, 0.48, 0.28, -0.28, -0.02),
        (25, 0.04, -0.08, 0.02, 0.05, -0.03, 0.00),
        (33, 0.00, 0.48, -0.48, -0.28, 0.28, 0.02),
    )
    for frame, z, leg_l, leg_r, arm_l, arm_r, twist in walk_poses:
        insert_pose(
            armature,
            frame,
            rotations={
                "hips": (0.0, twist, 0.0),
                "chest": (0.04, -twist * 0.8, 0.0),
                "thigh.L": (leg_l, 0.0, 0.0),
                "thigh.R": (leg_r, 0.0, 0.0),
                "shin.L": (max(0.0, -leg_l) * 0.75, 0.0, 0.0),
                "shin.R": (max(0.0, -leg_r) * 0.75, 0.0, 0.0),
                "upper_arm.L": (arm_l * 0.35, 0.0, 0.0),
                "upper_arm.R": (arm_r, 0.0, 0.0),
                "forearm.R": (-0.08, 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, z)},
        )

    # Faster, forward-leaning run cycle.
    action("RUN", 24)
    run_poses = (
        (1, 0.02, 0.78, -0.72, -0.34, 0.56),
        (7, 0.10, 0.08, -0.10, -0.08, 0.10),
        (13, 0.02, -0.72, 0.78, 0.34, -0.56),
        (19, 0.10, -0.10, 0.08, 0.08, -0.10),
        (25, 0.02, 0.78, -0.72, -0.34, 0.56),
    )
    for frame, z, leg_l, leg_r, arm_l, arm_r in run_poses:
        insert_pose(
            armature,
            frame,
            rotations={
                "spine": (0.18, 0.0, 0.0),
                "chest": (0.08, 0.0, 0.0),
                "thigh.L": (leg_l, 0.0, 0.0),
                "thigh.R": (leg_r, 0.0, 0.0),
                "shin.L": (max(0.0, -leg_l) * 1.15, 0.0, 0.0),
                "shin.R": (max(0.0, -leg_r) * 1.15, 0.0, 0.0),
                "upper_arm.L": (arm_l * 0.25, 0.0, 0.0),
                "upper_arm.R": (arm_r, 0.0, 0.0),
                "forearm.R": (-0.30, 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, z)},
        )

    # One-handed claymore diagonal strike: anticipation, impact, recovery.
    action("ATTACK", 32)
    attack_poses = (
        (1, 0.00, 0.00, 0.00, 0.00, 0.00),
        (6, -0.04, 0.62, -0.32, -0.28, 0.10),
        (12, 0.02, 1.78, -0.72, -0.42, 0.22),
        (17, 0.05, -1.18, 0.34, 0.42, -0.20),
        (22, 0.01, -0.72, 0.12, 0.24, -0.12),
        (28, 0.00, -0.16, 0.02, 0.05, -0.03),
        (33, 0.00, 0.00, 0.00, 0.00, 0.00),
    )
    for frame, z, arm_x, arm_y, chest_y, chest_z in attack_poses:
        insert_pose(
            armature,
            frame,
            rotations={
                "hips": (0.0, chest_y * 0.35, 0.0),
                "chest": (0.06, chest_y, chest_z),
                "upper_arm.R": (arm_x, arm_y, -0.12),
                "forearm.R": (-0.42 if frame <= 12 else 0.16, 0.0, 0.0),
                "upper_arm.L": (-0.10, 0.0, 0.05),
                "thigh.L": (-0.12 if frame >= 12 and frame <= 22 else 0.0, 0.0, 0.0),
                "thigh.R": (0.12 if frame >= 12 and frame <= 22 else 0.0, 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, z)},
        )

    # Shield raise, braced hold, and return.
    action("GUARD", 40)
    guard_poses = (
        (1, 0.00, 0.00, 0.00, 0.00),
        (8, -0.03, -0.55, -0.24, -0.10),
        (13, -0.06, -1.02, -0.48, -0.22),
        (25, -0.055, -1.02, -0.48, -0.22),
        (33, -0.03, -0.50, -0.22, -0.08),
        (41, 0.00, 0.00, 0.00, 0.00),
    )
    for frame, z, arm_x, arm_y, chest_x in guard_poses:
        insert_pose(
            armature,
            frame,
            rotations={
                "spine": (chest_x, 0.0, 0.0),
                "upper_arm.L": (arm_x, arm_y, -0.18),
                "forearm.L": (-0.32, 0.0, 0.0) if frame not in (1, 41) else (0.0, 0.0, 0.0),
                "upper_arm.R": (0.22, 0.0, 0.0),
                "thigh.L": (0.10, 0.0, 0.0) if frame not in (1, 41) else (0.0, 0.0, 0.0),
                "thigh.R": (0.10, 0.0, 0.0) if frame not in (1, 41) else (0.0, 0.0, 0.0),
                "shin.L": (-0.12, 0.0, 0.0) if frame not in (1, 41) else (0.0, 0.0, 0.0),
                "shin.R": (-0.12, 0.0, 0.0) if frame not in (1, 41) else (0.0, 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, z)},
        )

    # Make keyframe interpolation smooth but keep the low-poly silhouette readable.
    for clip, _ in actions.values():
        for layer in clip.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for fcurve in channelbag.fcurves:
                        for keyframe in fcurve.keyframe_points:
                            keyframe.interpolation = "BEZIER"

    armature.animation_data.action = actions["IDLE"][0]
    return actions


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_stage(materials: dict[str, bpy.types.Material]) -> tuple[bpy.types.Object, bpy.types.Object]:
    # Circular arena with a gold ring and a clean, slightly heroic studio backdrop.
    create_cylinder("ArenaBase", (0, 0, -0.13), 2.65, 0.22, materials["stage"], vertices=48, bevel=0.05)
    create_torus("ArenaGoldRing", (0, 0, -0.005), 2.15, 0.026, materials["gold"])
    create_torus("ArenaCyanRing", (0, 0, 0.001), 1.90, 0.010, materials["cyan"])

    for index, (x, y, h) in enumerate(((-2.1, 1.0, 1.7), (2.15, 1.25, 2.05), (0.0, 2.0, 1.35))):
        create_cylinder(f"BackdropPillar{index + 1}", (x, y, h * 0.5 - 0.03), 0.22, h, materials["stage_light"], vertices=8, bevel=0.03)
        create_cone(f"PillarCap{index + 1}", (x, y, h + 0.10), 0.36, 0.20, 0.22, materials["gold"], vertices=8)

    # Camera.
    camera_data = bpy.data.cameras.new("MotionCamera")
    camera = bpy.data.objects.new("MotionCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3.65, -6.35, 2.75)
    camera.data.lens = 58
    camera.data.sensor_width = 36
    look_at(camera, (0.0, 0.0, 1.02))
    bpy.context.scene.camera = camera

    # Motion label is parented to the camera and is changed before each render.
    bpy.ops.object.text_add()
    label = bpy.context.object
    label.name = "MotionLabel"
    label.data.body = "IDLE"
    label.data.align_x = "LEFT"
    label.data.align_y = "TOP"
    label.data.size = 0.32
    label.data.extrude = 0.008
    label.data.bevel_depth = 0.002
    label.data.materials.append(materials["label"])
    label.parent = camera
    label.matrix_parent_inverse = Matrix.Identity(4)
    label.location = (-1.72, 1.72, -5.5)
    label.rotation_euler = (0.0, 0.0, 0.0)

    # Warm key, cool fill, and gold rim lights.
    def area_light(name, location, energy, color, size):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        look_at(light, (0.0, 0.0, 1.0))
        return light

    area_light("WarmKey", (4.2, -4.0, 6.5), 1100, (1.0, 0.73, 0.34), 4.0)
    area_light("CoolFill", (-4.0, -2.5, 3.8), 850, (0.20, 0.72, 1.0), 3.5)
    area_light("GoldRim", (0.0, 3.6, 5.0), 1450, (1.0, 0.52, 0.12), 3.0)

    return camera, label


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.render.image_settings.color_depth = "8"
    scene.render.use_file_extension = True

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.018, 0.025, 0.055)
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.012, 0.020, 0.060, 1.0)
        background.inputs["Strength"].default_value = 0.30


def render_actions(
    armature: bpy.types.Object,
    actions: dict[str, tuple[bpy.types.Action, int]],
    label: bpy.types.Object,
) -> None:
    scene = bpy.context.scene
    for name, (clip, length) in actions.items():
        armature.animation_data.action = clip
        reset_pose(armature)
        scene.frame_start = 1
        scene.frame_end = length
        scene.frame_set(1)
        label.data.body = f"CRUSADER  //  {name}"
        target = FRAMES_DIR / name
        target.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(target / "frame_")
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
        bpy.ops.render.render(animation=True)

    # Restore the authoring file to IDLE for a friendly first open.
    armature.animation_data.action = actions["IDLE"][0]
    scene.frame_start = 1
    scene.frame_end = actions["IDLE"][1]
    scene.frame_set(1)
    label.data.body = "CRUSADER  //  IDLE"
    scene.render.filepath = str(OUTPUT_DIR / "preview.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def run_checked(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def encode_and_validate(actions: dict[str, tuple[bpy.types.Action, int]]) -> None:
    """Encode action MP4 files, assemble the reel/montage, and validate decoding."""
    if not FFMPEG_PATH.exists() or not FFPROBE_PATH.exists():
        raise FileNotFoundError("Bundled FFmpeg/ffprobe runtime is missing")

    clip_paths: list[Path] = []
    for name, (_, length) in actions.items():
        clip_path = OUTPUT_DIR / f"crusader_{name.lower()}.mp4"
        run_checked([
            str(FFMPEG_PATH),
            "-hide_banner",
            "-loglevel", "error",
            "-y",
            "-framerate", str(FPS),
            "-start_number", "1",
            "-i", str(FRAMES_DIR / name / "frame_%04d.png"),
            "-frames:v", str(length),
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(clip_path),
        ])
        clip_paths.append(clip_path)

    combined_path = OUTPUT_DIR / "crusader_motion_preview.mp4"
    combined_command = [str(FFMPEG_PATH), "-hide_banner", "-loglevel", "error", "-y"]
    for clip_path in clip_paths:
        combined_command.extend(["-i", str(clip_path)])
    concat_inputs = "".join(f"[{index}:v]" for index in range(len(clip_paths)))
    combined_command.extend([
        "-filter_complex", f"{concat_inputs}concat=n={len(clip_paths)}:v=1:a=0[v]",
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(combined_path),
    ])
    run_checked(combined_command)

    montage_path = OUTPUT_DIR / "crusader_keyposes.png"
    montage_inputs = [
        OUTPUT_DIR / "preview.png",
        FRAMES_DIR / "WALK" / "frame_0001.png",
        FRAMES_DIR / "RUN" / "frame_0001.png",
        FRAMES_DIR / "ATTACK" / "frame_0017.png",
        FRAMES_DIR / "GUARD" / "frame_0013.png",
    ]
    montage_command = [str(FFMPEG_PATH), "-hide_banner", "-loglevel", "error", "-y"]
    for input_path in montage_inputs:
        montage_command.extend(["-i", str(input_path)])
    montage_command.extend([
        "-filter_complex",
        "[0:v]scale=360:360[a];[1:v]scale=360:360[b];[2:v]scale=360:360[c];"
        "[3:v]scale=360:360[d];[4:v]scale=360:360[e];"
        "[a][b][c][d][e]xstack=inputs=5:layout=0_0|360_0|720_0|180_360|540_360:fill=0x020617[out]",
        "-map", "[out]",
        "-frames:v", "1",
        str(montage_path),
    ])
    run_checked(montage_command)

    # A full decode catches truncated/corrupt output that metadata-only probing misses.
    run_checked([
        str(FFMPEG_PATH),
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(combined_path),
        "-f", "null",
        "NUL" if os.name == "nt" else "/dev/null",
    ])

    probe = run_checked([
        str(FFPROBE_PATH),
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames",
        "-show_entries", "format=duration,size",
        "-of", "json",
        str(combined_path),
    ])
    manifest = {
        "model": {
            "blend": BLEND_PATH.name,
            "armature_bones": 18,
            "rigid_mesh_parts": 52,
            "character_height_m": 1.90,
        },
        "render": {
            "engine": "Blender EEVEE",
            "resolution": [RENDER_SIZE, RENDER_SIZE],
            "fps": FPS,
            "codec": "H.264 yuv420p",
        },
        "actions": {name: {"frames": length, "file": path.name} for (name, (_, length)), path in zip(actions.items(), clip_paths)},
        "combined_probe": json.loads(probe.stdout),
        "decode_check": "ok",
    }
    (OUTPUT_DIR / "render_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    clean_scene()

    materials = {
        "ivory": make_material("Armor Ivory", (0.82, 0.79, 0.67, 1.0), metallic=0.62, roughness=0.30),
        "pearl": make_material("Pearl Steel", (0.73, 0.78, 0.80, 1.0), metallic=0.82, roughness=0.22),
        "gold": make_material("Warm Gold", (0.92, 0.48, 0.08, 1.0), metallic=0.78, roughness=0.24),
        "yellow": make_material("Sun Yellow", (1.00, 0.72, 0.10, 1.0), metallic=0.42, roughness=0.25),
        "dark": make_material("Deep Navy", (0.035, 0.055, 0.105, 1.0), metallic=0.30, roughness=0.38),
        "leather": make_material("Warm Leather", (0.19, 0.07, 0.025, 1.0), roughness=0.70),
        "cape": make_material("Golden Cape", (0.55, 0.20, 0.025, 1.0), metallic=0.12, roughness=0.55),
        "cyan": make_material("Spirit Cyan", (0.04, 0.78, 0.92, 1.0), roughness=0.18, emission_strength=3.4),
        "stage": make_material("Arena Navy", (0.035, 0.055, 0.11, 1.0), metallic=0.25, roughness=0.40),
        "stage_light": make_material("Backdrop Stone", (0.10, 0.13, 0.22, 1.0), metallic=0.10, roughness=0.58),
        "label": make_material("Label Gold", (1.0, 0.70, 0.14, 1.0), roughness=0.20, emission_strength=1.6),
    }

    armature = create_armature()
    build_character(materials, armature)
    actions = build_actions(armature)
    _, label = build_stage(materials)
    configure_render()
    render_actions(armature, actions, label)
    encode_and_validate(actions)
    print(f"CRUSADER_RENDER_COMPLETE={OUTPUT_DIR}")


if __name__ == "__main__":
    main()

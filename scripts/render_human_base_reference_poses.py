"""Build five reference-driven static Crusader poses.

This script deliberately opens the already-built Crusader based on Blender's
official Human Base Mesh (Sculpting), keeps its visible anatomy and armour, and
adds five *single-frame* Rigify Actions.  It does not create animation clips.

Preview render::

    tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
      artifacts/human-base-sculpt-crusader-hq-look/human_base_sculpt_crusader_hq_look.blend \
      --python scripts/render_human_base_reference_poses.py

Final 1536 px render and package::

    tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
      artifacts/human-base-sculpt-crusader-hq-look/human_base_sculpt_crusader_hq_look.blend \
      --python scripts/render_human_base_reference_poses.py -- --final
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
BASE_BLEND = (
    ROOT
    / "artifacts"
    / "human-base-sculpt-crusader"
    / "human_base_sculpt_crusader.blend"
)
HQ_BLEND = (
    ROOT
    / "artifacts"
    / "human-base-sculpt-crusader-hq-look"
    / "human_base_sculpt_crusader_hq_look.blend"
)
SOURCE_BLEND = HQ_BLEND
OUT = ROOT / "artifacts" / "human-base-sculpt-crusader-reference-poses"
POSE_DIR = OUT / "poses"
BLEND_PATH = OUT / "human_base_sculpt_crusader_reference_poses.blend"
CONTACT_SHEET = OUT / "human_base_sculpt_crusader_reference_pose_sheet.png"
MANIFEST_PATH = OUT / "manifest.json"
CHECKSUM_PATH = OUT / "checksums.sha256"
ZIP_PATH = OUT / "human-base-sculpt-crusader-reference-poses.zip"
FFMPEG = (
    ROOT
    / "tools"
    / "runtime"
    / "ffmpeg-9.0.1-essentials_build"
    / "bin"
    / "ffmpeg.exe"
)

RIG_NAME = "HB_Sculpt_Rigify"
BODY_NAME = "HB_Sculpt_Male_190cm"
POSE_NAMES = (
    "REF_IDLE_MID",
    "REF_GUARD_MID",
    "REF_RUN_MID",
    "REF_WALK_MID",
    "REF_ATTACK_MID",
)
POSE_LABELS = {
    "REF_IDLE_MID": "1  IDLE",
    "REF_GUARD_MID": "2  GUARD",
    "REF_RUN_MID": "3  RUN",
    "REF_WALK_MID": "4  WALK",
    "REF_ATTACK_MID": "5  ATTACK",
}
REFERENCE_FILES = {
    "REF_IDLE_MID": "01-idle.jpg",
    "REF_GUARD_MID": "02-guard.jpg",
    "REF_RUN_MID": "03-run.jpg",
    "REF_WALK_MID": "04-walk.jpg",
    "REF_ATTACK_MID": "05-attack.jpg",
}

# Rest-space control origins from the generated Rigify skeleton.  Targets below
# are expressed in armature/world space, which makes silhouette art direction
# much clearer than guessing bone-local translation channels.
REST_TARGETS = {
    "hand_ik.L": Vector((0.4226, -0.0714, 0.9974)),
    "hand_ik.R": Vector((-0.4225, -0.0714, 0.9974)),
    "upper_arm_ik_target.L": Vector((0.6286, 0.4582, 1.3089)),
    "upper_arm_ik_target.R": Vector((-0.6267, 0.4597, 1.3082)),
    "foot_ik.L": Vector((0.1934, 0.0663, 0.0783)),
    "foot_ik.R": Vector((-0.1932, 0.0663, 0.0783)),
    "thigh_ik_target.L": Vector((0.9824, 0.0864, 0.6068)),
    "thigh_ik_target.R": Vector((-0.9814, 0.0971, 0.6077)),
}

TRANSFORM_CONTROLS = (
    "root",
    "torso",
    "hips",
    "chest",
    "spine_fk",
    "spine_fk.001",
    "spine_fk.002",
    "spine_fk.003",
    "neck",
    "head",
    "shoulder.L",
    "shoulder.R",
    "upper_arm_fk.L",
    "forearm_fk.L",
    "hand_fk.L",
    "upper_arm_fk.R",
    "forearm_fk.R",
    "hand_fk.R",
    "hand_ik.L",
    "hand_ik.R",
    "upper_arm_ik_target.L",
    "upper_arm_ik_target.R",
    "thigh_fk.L",
    "shin_fk.L",
    "foot_fk.L",
    "toe_fk.L",
    "thigh_fk.R",
    "shin_fk.R",
    "foot_fk.R",
    "toe_fk.R",
    "foot_ik.L",
    "foot_ik.R",
    "thigh_ik_target.L",
    "thigh_ik_target.R",
)

LIMB_PARENT_CONTROLS = (
    "upper_arm_parent.L",
    "upper_arm_parent.R",
    "thigh_parent.L",
    "thigh_parent.R",
)


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--final", action="store_true", help="render 1536 px stills and package them")
    parser.add_argument("--size", type=int, default=0, help="override square render size")
    parser.add_argument("--package-only", action="store_true", help="refresh manifest, checksums and ZIP from existing final files")
    return parser.parse_args(arguments)


def require_scene() -> tuple[bpy.types.Object, bpy.types.Object]:
    # The HQ look is a non-destructive derivative of BASE_BLEND: same official
    # body, rig, armour topology and Actions, with only materials/presentation
    # additions.  Prefer it whenever available so the five renders match the
    # approved forged-metal look exactly.
    current = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    allowed_current_files = {HQ_BLEND.resolve(), BLEND_PATH.resolve()}
    if HQ_BLEND.exists() and current not in allowed_current_files:
        bpy.ops.wm.open_mainfile(filepath=str(HQ_BLEND))
    rig = bpy.data.objects.get(RIG_NAME)
    body = bpy.data.objects.get(BODY_NAME)
    if rig is None or body is None:
        raise RuntimeError(f"Open the finished Human Base Mesh Crusader first: {SOURCE_BLEND}")
    missing = sorted((set(TRANSFORM_CONTROLS) | set(LIMB_PARENT_CONTROLS)).difference(rig.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"Rigify controls missing: {missing}")
    return body, rig


def clear_pose(rig: bpy.types.Object) -> None:
    """Return every transform control to its generated Rigify rest transform."""

    for name in TRANSFORM_CONTROLS:
        bone = rig.pose.bones[name]
        bone.rotation_mode = "QUATERNION"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    for name in LIMB_PARENT_CONTROLS:
        parent = rig.pose.bones[name]
        parent["IK_FK"] = 0.0
        if "pole_vector" in parent:
            parent["pole_vector"] = True
    bpy.context.view_layer.update()


def set_control_euler(rig: bpy.types.Object, name: str, degrees: tuple[float, float, float]) -> None:
    bone = rig.pose.bones[name]
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = tuple(math.radians(value) for value in degrees)


def set_control_location(rig: bpy.types.Object, name: str, value: tuple[float, float, float]) -> None:
    rig.pose.bones[name].location = value


def rotate_torso_world(
    rig: bpy.types.Object,
    *,
    forward_degrees: float,
    twist_degrees: float,
    roll_degrees: float,
) -> None:
    """Rotate the Rigify torso master in readable world directions."""

    bone = rig.pose.bones["torso"]
    bpy.context.view_layer.update()
    pivot = bone.matrix.translation.copy()
    rest_rotation = rig.data.bones["torso"].matrix_local.to_3x3()
    # World X pitches the vertical silhouette toward -Y; world Z twists; world
    # Y rolls side-to-side.  Using world axes avoids reusing opaque legacy Euler
    # values whose meaning changes with Rigify bone roll.
    delta = Euler(
        (
            math.radians(forward_degrees),
            math.radians(roll_degrees),
            math.radians(twist_degrees),
        ),
        "XYZ",
    ).to_matrix()
    desired = (delta @ rest_rotation).to_4x4()
    desired.translation = pivot
    bone.matrix = desired
    bpy.context.view_layer.update()


def place_world_control(
    rig: bpy.types.Object,
    name: str,
    target: tuple[float, float, float],
    world_delta_degrees: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    """Place a free Rigify IK/pole control with an intuitive world-space delta."""

    bone = rig.pose.bones[name]
    rest = rig.data.bones[name].matrix_local.copy()
    rest_rotation = rest.to_3x3()
    delta = Euler(tuple(math.radians(value) for value in world_delta_degrees), "XYZ").to_matrix()
    desired = (delta @ rest_rotation).to_4x4()
    desired.translation = Vector(target)
    bone.matrix = desired
    bpy.context.view_layer.update()


def rotation_from_vector_pair(
    rest_primary: Vector,
    rest_secondary: Vector,
    desired_primary: Vector,
    desired_secondary_hint: Vector,
) -> Matrix:
    """Return a stable world rotation matching a primary and roll axis."""

    rest_primary = rest_primary.normalized()
    rest_secondary = (rest_secondary - rest_primary * rest_secondary.dot(rest_primary)).normalized()
    rest_third = rest_primary.cross(rest_secondary).normalized()
    desired_primary = desired_primary.normalized()
    desired_secondary = desired_secondary_hint - desired_primary * desired_secondary_hint.dot(desired_primary)
    if desired_secondary.length < 1.0e-5:
        desired_secondary = Vector((0.0, 0.0, 1.0)) - desired_primary * desired_primary.z
    desired_secondary.normalize()
    desired_third = desired_primary.cross(desired_secondary).normalized()
    rest_basis = Matrix((rest_primary, rest_secondary, rest_third)).transposed()
    desired_basis = Matrix((desired_primary, desired_secondary, desired_third)).transposed()
    return desired_basis @ rest_basis.inverted()


def place_oriented_control(
    rig: bpy.types.Object,
    name: str,
    target: tuple[float, float, float],
    world_rotation: Matrix,
) -> None:
    bone = rig.pose.bones[name]
    rest_rotation = rig.data.bones[name].matrix_local.to_3x3()
    desired = (world_rotation @ rest_rotation).to_4x4()
    desired.translation = Vector(target)
    bone.matrix = desired
    bpy.context.view_layer.update()


def place_sword_hand(
    rig: bpy.types.Object,
    target: tuple[float, float, float],
    sword_direction: tuple[float, float, float],
) -> None:
    # The claymore was modelled from this hand-space world vector.  Solving the
    # vector explicitly is essential: arbitrary wrist Euler values made the old
    # previews look static and occasionally pointed the blade through the floor.
    rest_axis = Vector((-0.665, -0.035, -0.746)).normalized()
    rest_guard = Vector((rest_axis.z, 0.0, -rest_axis.x)).normalized()
    desired_axis = Vector(sword_direction).normalized()
    # Keep the crossguard visually broad in the camera plane while the requested
    # blade direction remains exact.
    guard_hint = Vector((1.0, 0.0, 0.0))
    rotation = rotation_from_vector_pair(rest_axis, rest_guard, desired_axis, guard_hint)
    place_oriented_control(rig, "hand_ik.R", target, rotation)


def shield_rotation(yaw_degrees: float, top_forward_degrees: float) -> Matrix:
    """Solve a shield face direction and top-edge pitch in world coordinates."""

    yaw = math.radians(yaw_degrees)
    pitch = math.radians(top_forward_degrees)
    horizontal_normal = Vector((math.sin(yaw), -math.cos(yaw), 0.0)).normalized()
    desired_normal = (horizontal_normal * math.cos(pitch) - Vector((0.0, 0.0, 1.0)) * math.sin(pitch)).normalized()
    desired_up = (Vector((0.0, 0.0, 1.0)) * math.cos(pitch) + horizontal_normal * math.sin(pitch)).normalized()
    rest_normal = Vector((0.0, -1.0, 0.0))
    rest_up = Vector((0.0, 0.0, 1.0))
    return rotation_from_vector_pair(rest_normal, rest_up, desired_normal, desired_up)


def place_shield_hand(
    rig: bpy.types.Object,
    target: tuple[float, float, float],
    *,
    yaw_degrees: float,
    top_forward_degrees: float,
) -> None:
    place_oriented_control(
        rig,
        "hand_ik.L",
        target,
        shield_rotation(yaw_degrees, top_forward_degrees),
    )


def key_complete_pose(rig: bpy.types.Object, frame: int = 1) -> None:
    for name in TRANSFORM_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path="location", frame=frame, group=name)
        bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="scale", frame=frame, group=name)
    for name in LIMB_PARENT_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path='["IK_FK"]', frame=frame, group=name)
        if "pole_vector" in bone:
            bone.keyframe_insert(data_path='["pole_vector"]', frame=frame, group=name)


def new_pose_action(rig: bpy.types.Object, name: str) -> bpy.types.Action:
    old = bpy.data.actions.get(name)
    if old is not None:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    action["frame_count"] = 1
    action["loop"] = False
    action["pose_type"] = "reference_mid_pose"
    action["reference_image"] = REFERENCE_FILES[name]
    action["source_asset"] = "Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0"
    rig.animation_data_create()
    rig.animation_data.action = action
    return action


def feet(
    rig: bpy.types.Object,
    left_offset: tuple[float, float, float],
    right_offset: tuple[float, float, float],
    *,
    root_z: float,
    left_rot=(0.0, 0.0, 0.0),
    right_rot=(0.0, 0.0, 0.0),
    left_knee=(0.72, -0.32, 0.56),
    right_knee=(-0.72, -0.30, 0.56),
) -> None:
    # Reference analysis records Rigify foot offsets.  The vertical entries
    # counter the root displacement for planted poses and lift the passing foot
    # in walk/run; adding root_z reconstructs their evaluated world targets.
    left_target = tuple(REST_TARGETS["foot_ik.L"][axis] + left_offset[axis] + (root_z if axis == 2 else 0.0) for axis in range(3))
    right_target = tuple(REST_TARGETS["foot_ik.R"][axis] + right_offset[axis] + (root_z if axis == 2 else 0.0) for axis in range(3))
    place_world_control(rig, "foot_ik.L", left_target, left_rot)
    place_world_control(rig, "foot_ik.R", right_target, right_rot)
    place_world_control(rig, "thigh_ik_target.L", left_knee)
    place_world_control(rig, "thigh_ik_target.R", right_knee)


def arms(
    rig: bpy.types.Object,
    *,
    left_hand: tuple[float, float, float],
    right_hand: tuple[float, float, float],
    left_elbow: tuple[float, float, float],
    right_elbow: tuple[float, float, float],
    shield_yaw=12.0,
    shield_top_forward=5.0,
    sword_direction=(-0.18, -0.10, 0.98),
) -> None:
    place_shield_hand(
        rig,
        left_hand,
        yaw_degrees=shield_yaw,
        top_forward_degrees=shield_top_forward,
    )
    place_sword_hand(rig, right_hand, sword_direction)
    place_world_control(rig, "upper_arm_ik_target.L", left_elbow)
    place_world_control(rig, "upper_arm_ik_target.R", right_elbow)


def finish_pose(rig: bpy.types.Object, name: str) -> bpy.types.Action:
    key_complete_pose(rig)
    action = rig.animation_data.action
    action.frame_start = 1
    action.frame_end = 1
    action.use_frame_range = True
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return action


def pose_idle(rig: bpy.types.Object) -> bpy.types.Action:
    """Alert but composed: wide base, shield forward, sword held upright."""

    new_pose_action(rig, "REF_IDLE_MID")
    clear_pose(rig)
    root_z = -0.055
    set_control_location(rig, "root", (0.0, 0.0, root_z))
    rotate_torso_world(rig, forward_degrees=4.0, twist_degrees=-4.0, roll_degrees=1.5)
    set_control_euler(rig, "spine_fk.003", (2.0, -1.0, 0.5))
    set_control_euler(rig, "head", (-2.0, 1.0, -1.0))
    feet(
        rig,
        (0.07, 0.13, 0.055),
        (-0.07, -0.18, 0.055),
        root_z=root_z,
        left_rot=(-2.0, 0.0, -5.0),
        right_rot=(2.0, 0.0, 5.0),
    )
    arms(
        rig,
        left_hand=(0.39, -0.26, 1.36),
        right_hand=(-0.42, -0.23, 1.31),
        left_elbow=(0.54, -0.04, 1.12),
        right_elbow=(-0.64, -0.01, 1.38),
        shield_yaw=12.0,
        shield_top_forward=5.0,
        sword_direction=(-0.18, -0.10, 0.98),
    )
    return finish_pose(rig, "REF_IDLE_MID")


def pose_guard(rig: bpy.types.Object) -> bpy.types.Action:
    """Low, broad defensive brace with the shield thrust ahead of the chest."""

    new_pose_action(rig, "REF_GUARD_MID")
    clear_pose(rig)
    root_z = -0.16
    set_control_location(rig, "root", (0.0, 0.0, root_z))
    rotate_torso_world(rig, forward_degrees=9.0, twist_degrees=-8.0, roll_degrees=2.0)
    set_control_euler(rig, "spine_fk.002", (2.0, -2.0, 1.0))
    set_control_euler(rig, "spine_fk.003", (3.0, -2.0, 1.0))
    set_control_euler(rig, "head", (-6.0, 3.0, -2.0))
    feet(
        rig,
        (0.11, -0.26, 0.16),
        (-0.11, 0.20, 0.16),
        root_z=root_z,
        left_rot=(-4.0, 1.0, -10.0),
        right_rot=(4.0, -1.0, 10.0),
        left_knee=(0.72, -0.45, 0.47),
        right_knee=(-0.72, -0.26, 0.47),
    )
    arms(
        rig,
        left_hand=(0.21, -0.55, 1.23),
        right_hand=(-0.40, 0.01, 1.03),
        left_elbow=(0.42, -0.22, 1.00),
        right_elbow=(-0.57, 0.12, 1.15),
        shield_yaw=18.0,
        shield_top_forward=10.0,
        sword_direction=(-0.35, 0.62, -0.70),
    )
    return finish_pose(rig, "REF_GUARD_MID")


def pose_run(rig: bpy.types.Object) -> bpy.types.Action:
    """Suspended passing stride: torso commits forward, equipment trails."""

    new_pose_action(rig, "REF_RUN_MID")
    clear_pose(rig)
    root_z = 0.03
    set_control_location(rig, "root", (0.0, 0.0, root_z))
    rotate_torso_world(rig, forward_degrees=24.0, twist_degrees=3.0, roll_degrees=-3.0)
    set_control_euler(rig, "spine_fk.003", (4.0, 1.0, -1.0))
    set_control_euler(rig, "head", (-12.0, -2.0, 2.0))
    feet(
        rig,
        (0.03, 0.27, 0.25),
        (-0.02, -0.30, -0.005),
        root_z=root_z,
        left_rot=(-24.0, 1.0, -3.0),
        right_rot=(7.0, -1.0, 3.0),
        left_knee=(0.60, -0.18, 0.62),
        right_knee=(-0.64, -0.47, 0.58),
    )
    arms(
        rig,
        left_hand=(0.43, -0.20, 1.18),
        right_hand=(-0.40, 0.03, 0.98),
        left_elbow=(0.56, -0.02, 1.02),
        right_elbow=(-0.57, 0.18, 1.15),
        shield_yaw=60.0,
        shield_top_forward=2.0,
        sword_direction=(-0.30, 0.78, -0.55),
    )
    return finish_pose(rig, "REF_RUN_MID")


def pose_walk(rig: bpy.types.Object) -> bpy.types.Action:
    """Deliberate patrol step with shield covering the upper body."""

    new_pose_action(rig, "REF_WALK_MID")
    clear_pose(rig)
    root_z = -0.015
    set_control_location(rig, "root", (0.0, 0.0, root_z))
    rotate_torso_world(rig, forward_degrees=3.0, twist_degrees=-5.0, roll_degrees=1.0)
    set_control_euler(rig, "spine_fk.003", (2.0, -2.0, 0.5))
    set_control_euler(rig, "head", (-2.0, 3.0, -1.0))
    feet(
        rig,
        (0.0, 0.18, 0.095),
        (0.0, -0.22, 0.015),
        root_z=root_z,
        left_rot=(-5.0, 0.0, -4.0),
        right_rot=(5.0, 0.0, 4.0),
        left_knee=(0.68, -0.05, 0.58),
        right_knee=(-0.68, -0.42, 0.58),
    )
    arms(
        rig,
        left_hand=(0.22, -0.29, 1.26),
        right_hand=(-0.38, -0.01, 0.99),
        left_elbow=(0.43, -0.08, 1.05),
        right_elbow=(-0.56, 0.14, 1.14),
        shield_yaw=25.0,
        shield_top_forward=4.0,
        sword_direction=(-0.28, 0.75, -0.60),
    )
    return finish_pose(rig, "REF_WALK_MID")


def pose_attack(rig: bpy.types.Object) -> bpy.types.Action:
    """Reference attack midpoint: forward lunge, leading shield, blade overhead."""

    new_pose_action(rig, "REF_ATTACK_MID")
    clear_pose(rig)
    root_z = -0.10
    set_control_location(rig, "root", (0.0, 0.0, root_z))
    rotate_torso_world(rig, forward_degrees=12.0, twist_degrees=14.0, roll_degrees=-5.0)
    set_control_euler(rig, "spine_fk.002", (2.0, 2.0, -1.0))
    set_control_euler(rig, "spine_fk.003", (4.0, 4.0, -1.0))
    set_control_euler(rig, "head", (-7.0, -8.0, 4.0))
    feet(
        rig,
        (0.07, -0.27, 0.10),
        (-0.07, 0.24, 0.10),
        root_z=root_z,
        left_rot=(-5.0, 1.0, -10.0),
        right_rot=(6.0, -1.0, 10.0),
        left_knee=(0.72, -0.45, 0.52),
        right_knee=(-0.76, -0.06, 0.54),
    )
    arms(
        rig,
        left_hand=(0.44, -0.39, 1.24),
        right_hand=(-0.40, -0.28, 1.58),
        left_elbow=(0.58, -0.16, 1.03),
        right_elbow=(-0.66, -0.02, 1.43),
        shield_yaw=30.0,
        shield_top_forward=12.0,
        sword_direction=(-0.58, -0.08, -0.81),
    )
    return finish_pose(rig, "REF_ATTACK_MID")


def create_pose_actions(rig: bpy.types.Object) -> dict[str, bpy.types.Action]:
    creators = (pose_idle, pose_guard, pose_run, pose_walk, pose_attack)
    actions = {action.name: action for action in (creator(rig) for creator in creators)}
    for action in actions.values():
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for curve in channelbag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "CONSTANT"
    return actions


def shader_input(shader, names: tuple[str, ...]):
    for name in names:
        if name in shader.inputs:
            return shader.inputs[name]
    return None


def rebuild_surface_material(
    material: bpy.types.Material,
    *,
    base: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    noise_scale: float,
    bump_strength: float,
    bump_distance: float,
    roughness_variation: float,
    emission_strength: float = 0.0,
) -> None:
    """Give existing armour assignments fine, render-scale surface variation."""

    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (580, 40)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (270, 40)
    shader.inputs["Base Color"].default_value = base
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    coat = shader_input(shader, ("Coat Weight", "Clearcoat"))
    if coat:
        coat.default_value = 0.08 if metallic > 0.3 else 0.025
    if emission_strength:
        emission = shader_input(shader, ("Emission Color", "Emission"))
        if emission:
            emission.default_value = base
        strength = shader_input(shader, ("Emission Strength",))
        if strength:
            strength.default_value = emission_strength
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])

    texcoord = nodes.new("ShaderNodeTexCoord")
    texcoord.location = (-620, -70)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-410, -70)
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.72
    links.new(texcoord.outputs["Generated"], noise.inputs["Vector"])

    bump = nodes.new("ShaderNodeBump")
    bump.location = (30, -150)
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = bump_distance
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])

    rough_map = nodes.new("ShaderNodeMapRange")
    rough_map.location = (-115, 130)
    rough_map.inputs["From Min"].default_value = 0.0
    rough_map.inputs["From Max"].default_value = 1.0
    rough_map.inputs["To Min"].default_value = max(0.02, roughness - roughness_variation)
    rough_map.inputs["To Max"].default_value = min(1.0, roughness + roughness_variation)
    links.new(noise.outputs["Fac"], rough_map.inputs["Value"])
    links.new(rough_map.outputs["Result"], shader.inputs["Roughness"])
    material.diffuse_color = base


def improve_materials() -> None:
    specifications = {
        "HB_Ivory_Plate": ((0.49, 0.43, 0.31, 1), 0.72, 0.33, 135.0, 0.075, 0.0020, 0.08, 0.0),
        "HB_Ivory_Highlight": ((0.73, 0.65, 0.48, 1), 0.68, 0.30, 150.0, 0.060, 0.0017, 0.07, 0.0),
        "HB_Sun_Gold": ((0.66, 0.31, 0.040, 1), 0.84, 0.27, 210.0, 0.050, 0.0014, 0.09, 0.0),
        "HB_Aged_Gold": ((0.24, 0.085, 0.015, 1), 0.78, 0.39, 120.0, 0.080, 0.0018, 0.11, 0.0),
        "HB_Dark_Iron": ((0.018, 0.024, 0.034, 1), 0.72, 0.48, 185.0, 0.105, 0.0019, 0.10, 0.0),
        "HB_Claymore_Steel": ((0.38, 0.43, 0.46, 1), 0.88, 0.24, 260.0, 0.045, 0.0012, 0.08, 0.0),
        "HB_Underarmor_Navy": ((0.010, 0.017, 0.033, 1), 0.02, 0.86, 95.0, 0.24, 0.0012, 0.05, 0.0),
        "HB_Shield_Leather": ((0.085, 0.028, 0.012, 1), 0.0, 0.80, 26.0, 0.28, 0.0030, 0.10, 0.0),
        "HB_Spirit_Cyan": ((0.012, 0.42, 0.58, 1), 0.18, 0.24, 80.0, 0.025, 0.0007, 0.04, 1.35),
    }
    for name, values in specifications.items():
        material = bpy.data.materials.get(name)
        if material is not None:
            rebuild_surface_material(
                material,
                base=values[0],
                metallic=values[1],
                roughness=values[2],
                noise_scale=values[3],
                bump_strength=values[4],
                bump_distance=values[5],
                roughness_variation=values[6],
                emission_strength=values[7],
            )


def remove_old_stage(*, preserve_hq: bool) -> None:
    for obj in list(bpy.context.scene.objects):
        remove = obj.type == "CAMERA" or obj.name.startswith("REF_Studio")
        if not preserve_hq:
            remove = remove or obj.type == "LIGHT" or obj.name.startswith("HB_Neutral_Studio_Floor")
        if remove:
            bpy.data.objects.remove(obj, do_unlink=True)


def flat_material(name: str, color, roughness=0.9):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    material.diffuse_color = color
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_area(name, location, energy, color, size, target=(0.0, 0.0, 1.0)):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    point_at(obj, Vector(target))
    return obj


def build_cyclorama(material: bpy.types.Material) -> bpy.types.Object:
    # Cross-section has a gently rounded floor-to-wall transition.  This removes
    # the old hard horizon while retaining grounded contact shadows.
    profile = ((-5.5, -0.035), (1.65, -0.035), (2.05, 0.08), (2.35, 0.44), (2.48, 0.95), (2.50, 4.2))
    vertices = []
    for x in (-7.0, 7.0):
        vertices.extend((x, y, z) for y, z in profile)
    width = len(profile)
    faces = []
    for index in range(width - 1):
        faces.append((index, index + 1, width + index + 1, width + index))
    mesh = bpy.data.meshes.new("REF_Studio_Cyclorama_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("REF_Studio_Cyclorama", mesh)
    bpy.context.collection.objects.link(obj)
    assign_material(obj, material)
    bevel = obj.modifiers.new("Soft studio transition", "BEVEL")
    bevel.width = 0.10
    bevel.segments = 5
    return obj


def configure_stage(size: int) -> bpy.types.Object:
    preserve_hq = bpy.data.objects.get("HQ_Courtyard_Floor") is not None
    remove_old_stage(preserve_hq=preserve_hq)
    if preserve_hq:
        positive = bpy.data.objects.get("HQ_Backdrop_PositiveY")
        negative = bpy.data.objects.get("HQ_Backdrop_NegativeY")
        if positive:
            positive.hide_render = False
        if negative:
            negative.hide_render = True
        for obj in bpy.data.objects:
            if obj.name.startswith("HQ_Pillar_PositiveY"):
                obj.hide_render = False
            elif obj.name.startswith("HQ_Pillar_NegativeY"):
                obj.hide_render = True
    else:
        floor = flat_material("REF_Studio_Slate", (0.075, 0.086, 0.105, 1), roughness=0.92)
        build_cyclorama(floor)

    camera_data = bpy.data.cameras.new("REF_Studio_Camera")
    camera = bpy.data.objects.new("REF_Studio_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 68
    camera.data.sensor_width = 36
    camera.data.dof.use_dof = False
    bpy.context.scene.camera = camera

    if not preserve_hq:
        add_area("REF_Key_Warm", (-3.8, -4.5, 5.2), 1180, (1.0, 0.78, 0.55), 3.5)
        add_area("REF_Fill_Cool", (4.1, -3.0, 3.4), 780, (0.54, 0.70, 1.0), 3.7)
        add_area("REF_Rim_Gold", (0.5, 2.4, 4.5), 1120, (1.0, 0.52, 0.20), 3.0)
        add_area("REF_Front_Softbox", (0.0, -4.5, 2.2), 370, (0.92, 0.96, 1.0), 2.8)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 18
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.resolution_percentage = 100
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 128 if preserve_hq else 64
        scene.eevee.use_fast_gi = True
        scene.eevee.fast_gi_quality = 0.75
        scene.eevee.fast_gi_step_count = 16
        scene.eevee.fast_gi_ray_count = 4
        scene.eevee.fast_gi_distance = 4.0
        scene.eevee.shadow_ray_count = 4
        scene.eevee.shadow_step_count = 12
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.009, 0.014, 0.026, 1)
    background.inputs["Strength"].default_value = 0.20
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.65 if preserve_hq else 0.0
    return camera


def character_bounds() -> list[Vector]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    excluded_prefixes = (
        "REF_Studio",
        "HQ_Courtyard",
        "HQ_Backdrop",
        "HQ_Pillar",
        "HB_Neutral_Studio_Floor",
    )
    for obj in bpy.context.scene.objects:
        if obj.hide_render or obj.name.startswith(excluded_prefixes):
            continue
        # Evaluated bevelled Curve bounds are unreliable after nested bone
        # parenting (they can be 2-3x too large).  Every silhouette-defining
        # piece -- body, armour, shield and claymore blade -- is a Mesh, so mesh
        # bounds produce stable close framing without clipping decoration.
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        matrix = evaluated.matrix_world
        points.extend(matrix @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise RuntimeError("No visible character geometry found")
    return points


def frame_camera(camera: bpy.types.Object, *, fill=0.82) -> None:
    """Fit evaluated armour, shield and sword into 82% of a square frame."""

    points = character_bounds()
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    target = (minimum + maximum) * 0.5
    # A mild sword-side three-quarter view keeps the shield from hiding the
    # chest while preserving its size and curvature.
    forward = Vector((0.36, 0.92, -0.15)).normalized()  # camera -> target
    world_up = Vector((0.0, 0.0, 1.0))
    right = forward.cross(world_up).normalized()
    up = right.cross(forward).normalized()
    relative = [point - target for point in points]
    half_width = max(abs(point.dot(right)) for point in relative)
    half_height = max(abs(point.dot(up)) for point in relative)
    half_depth = max(abs(point.dot(forward)) for point in relative)
    fov = camera.data.angle
    distance = (
        max(half_width, half_height) / max(0.05, fill * math.tan(fov * 0.5))
        + half_depth * 0.20
    )
    camera.location = target - forward * distance
    point_at(camera, target)
    camera.data.lens = 68


def assign_action(rig: bpy.types.Object, action: bpy.types.Action) -> None:
    rig.animation_data_create()
    rig.animation_data.action = action
    if action.slots:
        try:
            rig.animation_data.action_slot = action.slots[0]
        except (AttributeError, RuntimeError, TypeError):
            pass
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def render_poses(rig: bpy.types.Object, actions: dict[str, bpy.types.Action], camera: bpy.types.Object) -> list[Path]:
    POSE_DIR.mkdir(parents=True, exist_ok=True)
    paths = []
    fill_by_pose = {
        "REF_IDLE_MID": 0.90,
        "REF_GUARD_MID": 0.94,
        "REF_RUN_MID": 0.90,
        "REF_WALK_MID": 0.98,
        "REF_ATTACK_MID": 0.93,
    }
    for name in POSE_NAMES:
        assign_action(rig, actions[name])
        frame_camera(camera, fill=fill_by_pose[name])
        path = POSE_DIR / f"{name.lower()}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths


def make_contact_sheet(paths: list[Path]) -> None:
    if not FFMPEG.exists():
        raise RuntimeError(f"FFmpeg is missing: {FFMPEG}")
    command = [str(FFMPEG), "-y"]
    for path in paths:
        command += ["-i", str(path)]
    filters = []
    for index, name in enumerate(POSE_NAMES):
        label = POSE_LABELS[name]
        filters.append(
            f"[{index}:v]pad=iw:ih+96:0:0:color=0x08101a,"
            f"drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':"
            f"text='{label}':x=36:y=h-th-22:fontsize=52:fontcolor=white:"
            f"box=1:boxcolor=0x08101a@0.76:boxborderw=18[v{index}]"
        )
    filters.append(
        "[v0][v1][v2][v3][v4]xstack=inputs=5:"
        "layout=0_0|w0_0|w0+w1_0|w0_h0|w0+w1_h0:fill=0x08101a[out]"
    )
    command += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-frames:v",
        "1",
        str(CONTACT_SHEET),
    ]
    subprocess.run(command, check=True, capture_output=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def write_manifest(size: int, body: bpy.types.Object, rig: bpy.types.Object, paths: list[Path], final: bool) -> None:
    report = {
        "source": "Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0",
        "source_blend": str(SOURCE_BLEND),
        "visible_body": body.name,
        "rig": rig.name,
        "rig_bones": len(rig.data.bones),
        "render_size": [size, size],
        "animation_rendered": False,
        "actions": {
            name: {
                "frames": 1,
                "frame_range": [1, 1],
                "reference": str(
                    BASE_BLEND.parent / "pose-references" / REFERENCE_FILES[name]
                ),
            }
            for name in POSE_NAMES
        },
        "images": [str(path) for path in paths],
        "contact_sheet": str(CONTACT_SHEET),
        "final": final,
    }
    MANIFEST_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def package(paths: list[Path]) -> None:
    targets = [BLEND_PATH, MANIFEST_PATH, CONTACT_SHEET, Path(__file__), *paths]
    CHECKSUM_PATH.write_text(
        "\n".join(f"{sha256(path)}  {path.relative_to(ROOT).as_posix()}" for path in targets) + "\n",
        encoding="ascii",
    )
    targets.append(CHECKSUM_PATH)
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in targets:
            archive.write(path, path.relative_to(ROOT))
    (OUT / (ZIP_PATH.name + ".sha256")).write_text(
        f"{sha256(ZIP_PATH)}  {ZIP_PATH.name}\n", encoding="ascii"
    )


def validate(body: bpy.types.Object, rig: bpy.types.Object, actions: dict[str, bpy.types.Action], paths: list[Path]) -> None:
    undeformed_height = max(vertex.co.z for vertex in body.data.vertices) - min(vertex.co.z for vertex in body.data.vertices)
    assert 1.89 <= undeformed_height <= 1.91, undeformed_height
    assert len(rig.data.bones) >= 200
    assert set(POSE_NAMES) == set(actions)
    assert bpy.data.objects["HB_GreatShield_Pivot"].parent_bone == "DEF-hand.L"
    assert bpy.data.objects["HB_ThinClaymore_Pivot"].parent_bone == "DEF-hand.R"
    assert bpy.data.objects["HB_Helmet_Pivot"].parent_bone == "DEF-spine.006"
    for name, action in actions.items():
        assert tuple(round(value) for value in action.frame_range) == (1, 1), (name, action.frame_range)
    for path in paths:
        if not path.exists() or path.stat().st_size < 50_000:
            raise RuntimeError(f"Render is missing or implausibly small: {path}")


def main() -> None:
    options = parse_args()
    if options.package_only:
        body, rig = require_scene()
        actions = {name: bpy.data.actions[name] for name in POSE_NAMES}
        paths = [POSE_DIR / f"{name.lower()}.png" for name in POSE_NAMES]
        write_manifest(1536, body, rig, paths, True)
        validate(body, rig, actions, paths)
        package(paths)
        print(json.dumps({"status": "ok", "package_only": True, "zip": str(ZIP_PATH)}, ensure_ascii=False))
        return
    size = options.size or (1536 if options.final else 1024)
    OUT.mkdir(parents=True, exist_ok=True)
    body, rig = require_scene()
    actions = create_pose_actions(rig)
    if bpy.data.objects.get("HQ_Courtyard_Floor") is None:
        improve_materials()
    camera = configure_stage(size)
    paths = render_poses(rig, actions, camera)
    make_contact_sheet(paths)
    assign_action(rig, actions["REF_IDLE_MID"])
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    write_manifest(size, body, rig, paths, options.final)
    validate(body, rig, actions, paths)
    if options.final:
        package(paths)
    print(
        json.dumps(
            {
                "status": "ok",
                "size": size,
                "contact_sheet": str(CONTACT_SHEET),
                "poses": [str(path) for path in paths],
                "blend": str(BLEND_PATH),
                "packaged": options.final,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

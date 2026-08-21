"""Create a reusable five-action library for the official Human Base Mesh rig.

Run from the repository root with the project-local Blender build::

    tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
        --python scripts/create_human_base_sculpt_actions.py

The input is the Rigify-bound, 1.90 m ``Body Male - Realistic`` sculpting
asset created by ``create_human_base_sculpt_rig.py``.  The output deliberately
contains no armour or weapon geometry.  Arms are posed so a claymore can be
attached to the right hand and a tall shield to the left forearm later.
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = (
    ROOT
    / "artifacts"
    / "human-base-sculpt-rig"
    / "human_base_sculpt_male_190cm_rigify.blend"
)
OUT = ROOT / "artifacts" / "human-base-sculpt-actions"
FRAMES = OUT / "frames"
BLEND_PATH = OUT / "human_base_sculpt_actions.blend"
REPORT_PATH = OUT / "human_base_sculpt_actions_report.json"
KEYPOSE_SHEET = OUT / "human_base_sculpt_action_keyposes.png"
CONTACT_SHEET = OUT / "human_base_sculpt_locomotion_contacts.png"
COMBAT_SHEET = OUT / "human_base_sculpt_combat_sequence.png"
FFMPEG = (
    ROOT
    / "tools"
    / "runtime"
    / "ffmpeg-9.0.1-essentials_build"
    / "bin"
    / "ffmpeg.exe"
)

RIG_NAME = "HumanBaseSculpt.Rig"
BODY_NAME = "HumanBaseSculpt.Body"

ACTION_SPECS = {
    "IDLE": {"length": 48, "loop": True},
    "WALK": {"length": 32, "loop": True},
    "RUN": {"length": 24, "loop": True},
    "ATTACK": {"length": 32, "loop": False},
    "GUARD": {"length": 40, "loop": False},
}

# Only generated Rigify control bones are animated.  The DEF/ORG/MCH bones are
# constraint outputs and must never be keyed directly.
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

HAND_REST_WORLD = {
    "L": Vector((0.423, -0.071, 0.997)),
    "R": Vector((-0.423, -0.071, 0.997)),
}
ARM_POLE_REST_WORLD = {
    "L": Vector((0.629, 0.458, 1.309)),
    "R": Vector((-0.627, 0.460, 1.308)),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_controls(rig: bpy.types.Object) -> None:
    required = set(TRANSFORM_CONTROLS) | set(LIMB_PARENT_CONTROLS)
    missing = sorted(required.difference(rig.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"Generated Rigify controls are missing: {missing}")


def reset_control_transforms(rig: bpy.types.Object) -> None:
    for name in TRANSFORM_CONTROLS:
        bone = rig.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def set_limb_modes(
    rig: bpy.types.Object,
    *,
    arm_l: float,
    arm_r: float,
    leg_l: float,
    leg_r: float,
    arm_poles: bool = False,
) -> None:
    """Set Rigify limb modes (1.0 FK, 0.0 IK) and pole-vector selection."""

    values = {
        "upper_arm_parent.L": arm_l,
        "upper_arm_parent.R": arm_r,
        "thigh_parent.L": leg_l,
        "thigh_parent.R": leg_r,
    }
    for name, value in values.items():
        parent = rig.pose.bones[name]
        parent["IK_FK"] = value
        if "pole_vector" in parent:
            parent["pole_vector"] = bool(arm_poles and name.startswith("upper_arm"))


def key_custom_properties(rig: bpy.types.Object, frame: int) -> None:
    for name in LIMB_PARENT_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path='["IK_FK"]', frame=frame, group=name)
        if "pole_vector" in bone:
            bone.keyframe_insert(data_path='["pole_vector"]', frame=frame, group=name)


def key_pose(
    rig: bpy.types.Object,
    frame: int,
    *,
    modes: tuple[float, float, float, float],
    rotations: dict[str, tuple[float, float, float]] | None = None,
    locations: dict[str, tuple[float, float, float]] | None = None,
    arm_poles: bool = False,
) -> None:
    """Reset the named controls, apply one pose, then key deterministic curves."""

    reset_control_transforms(rig)
    set_limb_modes(
        rig,
        arm_l=modes[0],
        arm_r=modes[1],
        leg_l=modes[2],
        leg_r=modes[3],
        arm_poles=arm_poles,
    )
    for name, value in (rotations or {}).items():
        rig.pose.bones[name].rotation_euler = value
    for name, value in (locations or {}).items():
        rig.pose.bones[name].location = value

    # Key only the controls that may be copied to a later armored builder.  A
    # fixed channel set makes every Action directly interchangeable.
    for name in TRANSFORM_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)
    key_custom_properties(rig, frame)


def ik_offset(rest: Vector, world_target: tuple[float, float, float]) -> tuple[float, float, float]:
    offset = Vector(world_target) - rest
    return tuple(float(value) for value in offset)


def new_action(rig: bpy.types.Object, name: str) -> bpy.types.Action:
    spec = ACTION_SPECS[name]
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    action["frame_count"] = int(spec["length"])
    action["loop"] = bool(spec["loop"])
    action["source_rig"] = RIG_NAME
    action["source_asset"] = "Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0"
    rig.animation_data.action = action
    return action


def create_idle(rig: bpy.types.Object) -> bpy.types.Action:
    action = new_action(rig, "IDLE")
    modes = (1.0, 1.0, 1.0, 1.0)
    poses = (
        (1, 0.000, -0.010, 0.000),
        (13, 0.005, 0.012, 0.008),
        (25, 0.000, -0.008, 0.000),
        (37, -0.003, 0.008, -0.006),
        (48, 0.000, -0.010, 0.000),
    )
    for frame, rise, chest, sway in poses:
        key_pose(
            rig,
            frame,
            modes=modes,
            rotations={
                "spine_fk.003": (math.radians(1.4), sway, chest),
                "head": (math.radians(-0.8), -sway * 0.45, -chest * 0.25),
                "upper_arm_fk.L": (math.radians(-2.0), 0.0, math.radians(2.0)),
                "upper_arm_fk.R": (math.radians(1.0), 0.0, math.radians(-2.0)),
                "forearm_fk.L": (math.radians(-7.0), 0.0, 0.0),
                "forearm_fk.R": (math.radians(-5.0), 0.0, 0.0),
            },
            locations={"root": (0.0, 0.0, rise)},
        )
    return action


def create_walk(rig: bpy.types.Object) -> bpy.types.Action:
    action = new_action(rig, "WALK")
    modes = (1.0, 1.0, 0.0, 0.0)
    # In-place walk.  Foot IK targets are world-axis aligned and keep contact
    # soles at z=0.  X stays on each anatomical lane, so legs never cross.
    poses = (
        # frame, root_z, left(y,z,pitch), right(y,z,pitch), sway
        (1, 0.000, (-0.205, 0.000, math.radians(5)), (0.175, 0.010, math.radians(-9)), -0.030),
        (5, 0.013, (-0.135, -0.013, 0.0), (0.095, 0.070, math.radians(-12)), -0.018),
        (9, 0.025, (-0.035, -0.025, 0.0), (-0.020, 0.105, math.radians(-2)), 0.000),
        (13, 0.012, (0.090, -0.012, math.radians(-4)), (-0.135, 0.055, math.radians(7)), 0.020),
        (17, 0.000, (0.175, 0.010, math.radians(-9)), (-0.205, 0.000, math.radians(5)), 0.030),
        (21, 0.013, (0.095, 0.070, math.radians(-12)), (-0.135, -0.013, 0.0), 0.018),
        (25, 0.025, (-0.020, 0.105, math.radians(-2)), (-0.035, -0.025, 0.0), 0.000),
        (29, 0.012, (-0.135, 0.055, math.radians(7)), (0.090, -0.012, math.radians(-4)), -0.020),
        (32, 0.000, (-0.205, 0.000, math.radians(5)), (0.175, 0.010, math.radians(-9)), -0.030),
    )
    for frame, root_z, left, right, sway in poses:
        phase = math.sin((frame - 1) / 31.0 * math.tau)
        root_comp = -root_z
        key_pose(
            rig,
            frame,
            modes=modes,
            rotations={
                "spine_fk.003": (math.radians(2.5), sway * 0.20, -sway),
                "head": (math.radians(-1.5), -sway * 0.12, sway * 0.35),
                "upper_arm_fk.L": (phase * math.radians(22), 0.0, math.radians(2)),
                "upper_arm_fk.R": (-phase * math.radians(22), 0.0, math.radians(-2)),
                "forearm_fk.L": (math.radians(-13) - max(0.0, -phase) * math.radians(10), 0.0, 0.0),
                "forearm_fk.R": (math.radians(-13) - max(0.0, phase) * math.radians(10), 0.0, 0.0),
                "foot_ik.L": (left[2], 0.0, 0.0),
                "foot_ik.R": (right[2], 0.0, 0.0),
            },
            locations={
                "root": (0.0, 0.0, root_z),
                "foot_ik.L": (0.0, left[0], left[1] + root_comp),
                "foot_ik.R": (0.0, right[0], right[1] + root_comp),
            },
        )
    return action


def create_run(rig: bpy.types.Object) -> bpy.types.Action:
    action = new_action(rig, "RUN")
    modes = (1.0, 1.0, 0.0, 0.0)
    poses = (
        (1, 0.035, (-0.280, 0.000, math.radians(7)), (0.205, 0.080, math.radians(-14)), -0.035),
        (4, 0.060, (-0.150, 0.015, math.radians(-2)), (0.105, 0.150, math.radians(-15)), -0.018),
        (7, 0.105, (0.010, 0.125, math.radians(-11)), (-0.060, 0.185, math.radians(-3)), 0.000),
        (10, 0.065, (0.145, 0.165, math.radians(-10)), (-0.220, 0.070, math.radians(8)), 0.022),
        (13, 0.035, (0.205, 0.080, math.radians(-14)), (-0.280, 0.000, math.radians(7)), 0.035),
        (16, 0.060, (0.105, 0.150, math.radians(-15)), (-0.150, 0.015, math.radians(-2)), 0.018),
        (19, 0.105, (-0.060, 0.185, math.radians(-3)), (0.010, 0.125, math.radians(-11)), 0.000),
        (22, 0.065, (-0.220, 0.070, math.radians(8)), (0.145, 0.165, math.radians(-10)), -0.022),
        (24, 0.035, (-0.280, 0.000, math.radians(7)), (0.205, 0.080, math.radians(-14)), -0.035),
    )
    for frame, root_z, left, right, sway in poses:
        phase = math.sin((frame - 1) / 23.0 * math.tau)
        root_comp = -root_z
        key_pose(
            rig,
            frame,
            modes=modes,
            rotations={
                "spine_fk.003": (math.radians(10.5), sway * 0.15, -sway * 0.85),
                "head": (math.radians(-5.0), -sway * 0.10, sway * 0.25),
                "upper_arm_fk.L": (phase * math.radians(39), 0.0, math.radians(3)),
                "upper_arm_fk.R": (-phase * math.radians(39), 0.0, math.radians(-3)),
                "forearm_fk.L": (math.radians(-31) - max(0.0, -phase) * math.radians(18), 0.0, 0.0),
                "forearm_fk.R": (math.radians(-31) - max(0.0, phase) * math.radians(18), 0.0, 0.0),
                "foot_ik.L": (left[2], 0.0, 0.0),
                "foot_ik.R": (right[2], 0.0, 0.0),
            },
            locations={
                "root": (0.0, 0.0, root_z),
                "foot_ik.L": (0.0, left[0], left[1] + root_comp),
                "foot_ik.R": (0.0, right[0], right[1] + root_comp),
            },
        )
    return action


def create_attack(rig: bpy.types.Object) -> bpy.types.Action:
    action = new_action(rig, "ATTACK")
    modes = (0.0, 0.0, 0.0, 0.0)
    # The right wrist travels from the character's upper-right to lower-left.
    # Left arm remains in front of the torso as a defensive shield carrier.
    poses = (
        # frame, right hand target, right hand rot, torso twist, root z
        (1, (-0.42, -0.15, 1.08), (0.00, 0.00, 0.00), -0.03, 0.000),
        (6, (-0.52, -0.13, 1.42), (-0.15, 0.15, -0.18), -0.16, -0.020),
        (12, (-0.43, -0.17, 1.72), (-0.30, 0.30, -0.35), -0.34, 0.005),
        (17, (0.10, -0.34, 1.28), (0.40, -0.30, 0.30), 0.16, 0.025),
        (21, (0.40, -0.28, 0.86), (0.70, -0.50, 0.55), 0.34, 0.010),
        (26, (0.30, -0.22, 0.80), (0.55, -0.30, 0.38), 0.20, -0.010),
        (32, (-0.42, -0.15, 1.08), (0.00, 0.00, 0.00), -0.03, 0.000),
    )
    # Wrist and elbow share nearly the same X coordinate, keeping the left
    # forearm vertical as a stable socket for the tall shield.
    left_guard = (0.36, -0.20, 1.43)
    left_pole = (0.44, -0.11, 1.08)
    right_pole_by_frame = {
        1: (-0.54, 0.10, 1.28),
        6: (-0.65, 0.04, 1.42),
        12: (-0.60, -0.01, 1.52),
        17: (-0.38, -0.02, 1.30),
        21: (-0.08, -0.02, 1.00),
        26: (-0.02, 0.02, 0.98),
        32: (-0.54, 0.10, 1.28),
    }
    for frame, right_target, hand_rot, twist, root_z in poses:
        key_pose(
            rig,
            frame,
            modes=modes,
            arm_poles=True,
            rotations={
                "spine_fk.003": (math.radians(5.0), twist, -twist * 0.35),
                "head": (math.radians(-2.0), -twist * 0.22, twist * 0.12),
                "hand_ik.R": hand_rot,
                "hand_ik.L": (math.radians(-10), math.radians(4), math.radians(18)),
                "foot_ik.L": (math.radians(-2), 0.0, math.radians(-4)),
                "foot_ik.R": (math.radians(2), 0.0, math.radians(5)),
            },
            locations={
                "root": (0.0, 0.0, root_z),
                "hand_ik.R": ik_offset(HAND_REST_WORLD["R"], right_target),
                "hand_ik.L": ik_offset(HAND_REST_WORLD["L"], left_guard),
                "upper_arm_ik_target.R": ik_offset(ARM_POLE_REST_WORLD["R"], right_pole_by_frame[frame]),
                "upper_arm_ik_target.L": ik_offset(ARM_POLE_REST_WORLD["L"], left_pole),
                "foot_ik.L": (0.0, -0.115, -root_z),
                "foot_ik.R": (0.0, 0.105, -root_z),
            },
        )
    return action


def create_guard(rig: bpy.types.Object) -> bpy.types.Action:
    action = new_action(rig, "GUARD")
    modes = (0.0, 0.0, 0.0, 0.0)
    poses = (
        # frame, left hand, left pole, brace, root_z
        (1, (0.37, -0.14, 1.18), (0.53, 0.02, 1.15), 0.00, 0.000),
        (8, (0.37, -0.18, 1.35), (0.46, -0.08, 1.10), 0.55, -0.018),
        (13, (0.36, -0.20, 1.48), (0.44, -0.12, 1.08), 1.00, -0.040),
        (25, (0.36, -0.21, 1.46), (0.44, -0.13, 1.07), 1.00, -0.042),
        (32, (0.37, -0.18, 1.36), (0.46, -0.08, 1.10), 0.58, -0.020),
        (40, (0.37, -0.14, 1.18), (0.53, 0.02, 1.15), 0.00, 0.000),
    )
    for frame, left_target, left_pole, brace, root_z in poses:
        right_target = (-0.38, -0.17, 1.05 + brace * 0.07)
        right_pole = (-0.55, 0.05, 1.22)
        key_pose(
            rig,
            frame,
            modes=modes,
            arm_poles=True,
            rotations={
                "spine_fk.003": (math.radians(3.0 + brace * 5.0), -brace * 0.05, brace * math.radians(3.0)),
                "head": (math.radians(-1.5), brace * 0.025, -brace * math.radians(2.0)),
                # Wrist orientation keeps the forearm shield socket vertical.
                "hand_ik.L": (math.radians(-18), math.radians(6), math.radians(78 * brace)),
                "hand_ik.R": (math.radians(5), math.radians(-4), math.radians(-8)),
                "foot_ik.L": (math.radians(-2), 0.0, math.radians(-5)),
                "foot_ik.R": (math.radians(1), 0.0, math.radians(6)),
            },
            locations={
                "root": (0.0, 0.0, root_z),
                "hand_ik.L": ik_offset(HAND_REST_WORLD["L"], left_target),
                "hand_ik.R": ik_offset(HAND_REST_WORLD["R"], right_target),
                "upper_arm_ik_target.L": ik_offset(ARM_POLE_REST_WORLD["L"], left_pole),
                "upper_arm_ik_target.R": ik_offset(ARM_POLE_REST_WORLD["R"], right_pole),
                "foot_ik.L": (0.0, -0.125, -root_z),
                "foot_ik.R": (0.0, 0.115, -root_z),
            },
        )
    return action


def set_curve_interpolation(actions: dict[str, bpy.types.Action]) -> None:
    """Use clamped Bezier transforms and stepped Rigify mode switches."""

    for action in actions.values():
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for curve in channelbag.fcurves:
                        is_mode = "IK_FK" in curve.data_path or "pole_vector" in curve.data_path
                        for point in curve.keyframe_points:
                            point.interpolation = "CONSTANT" if is_mode else "BEZIER"
                            if not is_mode:
                                point.handle_left_type = "AUTO_CLAMPED"
                                point.handle_right_type = "AUTO_CLAMPED"


def configure_preview_scene() -> bpy.types.Object:
    scene = bpy.context.scene
    camera = bpy.data.objects.get("Preview Camera")
    if camera is None:
        data = bpy.data.cameras.new("Preview Camera")
        camera = bpy.data.objects.new("Preview Camera", data)
        bpy.context.scene.collection.objects.link(camera)
    camera.location = (2.75, -4.35, 1.34)
    camera.data.lens = 67
    direction = Vector((0.0, 0.0, 1.00)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 420
    scene.render.resolution_y = 520
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    return camera


def render_pose(
    rig: bpy.types.Object,
    action: bpy.types.Action,
    frame: int,
    path: Path,
) -> None:
    scene = bpy.context.scene
    rig.animation_data.action = action
    scene.frame_start = 1
    scene.frame_end = int(action["frame_count"])
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def ffmpeg_stack(inputs: list[Path], output: Path, columns: int) -> None:
    if not FFMPEG.exists():
        raise FileNotFoundError(f"Project-local FFmpeg is missing: {FFMPEG}")
    if len(inputs) % columns:
        raise ValueError("The contact-sheet input count must divide evenly into columns")
    command = [str(FFMPEG), "-y"]
    for path in inputs:
        command.extend(["-i", str(path)])
    rows = len(inputs) // columns
    graph: list[str] = []
    for row in range(rows):
        labels = "".join(f"[{row * columns + column}:v]" for column in range(columns))
        graph.append(f"{labels}hstack=inputs={columns}[row{row}]")
    if rows == 1:
        graph.append("[row0]copy[out]")
    else:
        labels = "".join(f"[row{row}]" for row in range(rows))
        graph.append(f"{labels}vstack=inputs={rows}[out]")
    command.extend(
        [
            "-filter_complex",
            ";".join(graph),
            "-map",
            "[out]",
            "-frames:v",
            "1",
            str(output),
        ]
    )
    subprocess.run(command, check=True, capture_output=True)


def render_previews(rig: bpy.types.Object, actions: dict[str, bpy.types.Action]) -> dict:
    configure_preview_scene()
    representative = {
        "IDLE": 13,
        "WALK": 9,
        "RUN": 7,
        "ATTACK": 17,
        "GUARD": 25,
    }
    keypose_paths: list[Path] = []
    for name, frame in representative.items():
        path = FRAMES / f"keypose_{name.lower()}_{frame:03d}.png"
        render_pose(rig, actions[name], frame, path)
        keypose_paths.append(path)
    ffmpeg_stack(keypose_paths, KEYPOSE_SHEET, columns=5)

    contacts = (
        ("WALK", 1),
        ("WALK", 9),
        ("WALK", 17),
        ("WALK", 25),
        ("RUN", 1),
        ("RUN", 7),
        ("RUN", 13),
        ("RUN", 19),
    )
    contact_paths: list[Path] = []
    for name, frame in contacts:
        path = FRAMES / f"contact_{name.lower()}_{frame:03d}.png"
        render_pose(rig, actions[name], frame, path)
        contact_paths.append(path)
    ffmpeg_stack(contact_paths, CONTACT_SHEET, columns=4)

    combat = (
        ("ATTACK", 6),
        ("ATTACK", 12),
        ("ATTACK", 17),
        ("ATTACK", 21),
        ("GUARD", 8),
        ("GUARD", 13),
        ("GUARD", 25),
        ("GUARD", 32),
    )
    combat_paths: list[Path] = []
    for name, frame in combat:
        path = FRAMES / f"combat_{name.lower()}_{frame:03d}.png"
        render_pose(rig, actions[name], frame, path)
        combat_paths.append(path)
    ffmpeg_stack(combat_paths, COMBAT_SHEET, columns=4)
    return {
        "representative_frames": representative,
        "keypose_sheet": str(KEYPOSE_SHEET),
        "locomotion_contact_frames": {
            "WALK": [1, 9, 17, 25],
            "RUN": [1, 7, 13, 19],
        },
        "contact_sheet": str(CONTACT_SHEET),
        "combat_sequence_frames": {
            "ATTACK": [6, 12, 17, 21],
            "GUARD": [8, 13, 25, 32],
        },
        "combat_sequence_sheet": str(COMBAT_SHEET),
    }


def main() -> None:
    if not SOURCE_BLEND.exists():
        raise FileNotFoundError(f"Rigged Human Base Mesh input is missing: {SOURCE_BLEND}")
    OUT.mkdir(parents=True, exist_ok=True)
    FRAMES.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND), load_ui=False)
    rig = bpy.data.objects.get(RIG_NAME)
    body = bpy.data.objects.get(BODY_NAME)
    if rig is None or rig.type != "ARMATURE":
        raise RuntimeError(f"Expected generated Rigify armature {RIG_NAME!r}")
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Expected official Human Base Mesh body {BODY_NAME!r}")
    require_controls(rig)

    # This output is an intentionally clean action library.  The source pose
    # test remains untouched in its original .blend.
    rig.animation_data_create()
    rig.animation_data.action = None
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)

    actions = {
        "IDLE": create_idle(rig),
        "WALK": create_walk(rig),
        "RUN": create_run(rig),
        "ATTACK": create_attack(rig),
        "GUARD": create_guard(rig),
    }
    set_curve_interpolation(actions)
    preview = render_previews(rig, actions)

    rig.animation_data.action = actions["IDLE"]
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 48
    bpy.context.scene.frame_set(1)

    readme = bpy.data.texts.get("HUMAN_BASE_SCULPT_ACTIONS_README.txt")
    if readme is None:
        readme = bpy.data.texts.new("HUMAN_BASE_SCULPT_ACTIONS_README.txt")
    else:
        readme.clear()
    readme.write(
        "Official Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0.\n"
        "Five generated Rigify Actions: IDLE 48, WALK 32, RUN 24, ATTACK 32, GUARD 40.\n"
        "Assign with: rig.animation_data_create(); rig.animation_data.action = bpy.data.actions['IDLE']\n"
        "Action curves target generated Rigify controls only; DEF/ORG/MCH bones are not keyed.\n"
        "ATTACK uses right-arm IK for an upper-right to lower-left cut. GUARD uses left-arm IK and pole control for a vertical forearm shield wall.\n"
    )

    report = {
        "blender_version": bpy.app.version_string,
        "source": {
            "blend": str(SOURCE_BLEND),
            "sha256": sha256(SOURCE_BLEND),
            "asset": "Blender Human Base Meshes v1.4.1 / Body Male - Realistic",
            "license": "CC0",
        },
        "output": {
            "blend": str(BLEND_PATH),
            "report": str(REPORT_PATH),
            **preview,
        },
        "rig": RIG_NAME,
        "body": BODY_NAME,
        "actions": {
            name: {
                "frame_start": 1,
                "frame_end": int(spec["length"]),
                "frame_count": int(spec["length"]),
                "loop": bool(spec["loop"]),
            }
            for name, spec in ACTION_SPECS.items()
        },
        "controls": {
            "transform_controls": list(TRANSFORM_CONTROLS),
            "limb_mode_controls": list(LIMB_PARENT_CONTROLS),
            "right_weapon_hand": "hand_ik.R (ATTACK) / hand_fk.R (locomotion)",
            "left_shield_arm": "hand_ik.L + upper_arm_ik_target.L (ATTACK/GUARD)",
            "feet": "foot_ik.L/R (WALK/RUN/ATTACK/GUARD)",
        },
        "assignment": {
            "slot_identifier": "OBHumanBaseSculpt.Rig",
            "same_file": "action = bpy.data.actions['IDLE']; rig.animation_data_create(); rig.animation_data.action = action; rig.animation_data.action_slot = action.slots[0]",
            "other_file": "Append the five Action datablocks, assign the chosen Action, then set action_slot = action.slots[0] on a Rigify rig with the same control names.",
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print("HUMAN_BASE_SCULPT_ACTIONS", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()

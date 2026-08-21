"""Render small FK pose studies against the saved Crusader v2 scene."""

from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "crusader-3d-v2" / "pose-tests"
OUT.mkdir(parents=True, exist_ok=True)

rig = bpy.data.objects["Crusader_CC0_Rig_v2"]
scene = bpy.context.scene
scene.render.resolution_x = 420
scene.render.resolution_y = 420
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
label = bpy.data.objects.get("ActionLabel")
if label:
    label.data.body = ""


def reset():
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def render(name, rotations):
    reset()
    for bone_name, rotation in rotations.items():
        rig.pose.bones[bone_name].rotation_euler = rotation
    bpy.context.view_layer.update()
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)


guard_variants = {
    "guard_a_current": {"UArmR.001": (-0.76, -0.32, -0.10), "LArmR.002": (-0.22, 0.0, 0.0)},
    "guard_b_x": {"UArmR.001": (-0.46, 0.0, 0.0), "LArmR.002": (-0.18, 0.0, 0.0)},
    "guard_c_y": {"UArmR.001": (0.0, -0.46, 0.0), "LArmR.002": (-0.18, 0.0, 0.0)},
    "guard_d_z": {"UArmR.001": (0.0, 0.0, -0.46), "LArmR.002": (-0.18, 0.0, 0.0)},
    "guard_e_xz": {"UArmR.001": (-0.36, 0.0, 0.38), "LArmR.002": (-0.20, 0.0, 0.0)},
    "guard_f_xy": {"UArmR.001": (-0.34, 0.22, 0.0), "LArmR.002": (-0.20, 0.0, 0.0)},
}

attack_variants = {
    "attack_a_current": {"UArmR": (1.35, -0.48, -0.07), "LArmR": (-0.30, 0.0, 0.0)},
    "attack_b_xposy": {"UArmR": (1.00, 0.30, 0.0), "LArmR": (-0.15, 0.0, 0.0)},
    "attack_c_xy": {"UArmR": (0.72, -0.80, 0.22), "LArmR": (-0.12, 0.0, 0.0)},
    "attack_d_xy": {"UArmR": (0.48, 0.72, 0.18), "LArmR": (-0.12, 0.0, 0.0)},
    "attack_e_yz": {"UArmR": (0.20, -0.92, -0.32), "LArmR": (-0.10, 0.0, 0.0)},
    "attack_f_xz": {"UArmR": (0.95, 0.0, 0.58), "LArmR": (-0.18, 0.0, 0.0)},
    "attack_g_safe_diagonal": {"UArmR": (0.85, 0.02, 0.44), "LArmR": (-0.14, 0.0, 0.0)},
    "attack_h_safe_diagonal": {"UArmR": (0.88, 0.02, 0.36), "LArmR": (-0.12, 0.0, 0.0)},
    "attack_i_clear_shield": {"UArmR": (1.02, 0.0, 0.62), "LArmR": (-0.18, 0.0, 0.0), "UArmR.001": (0.0, 0.25, 0.0)},
}

for name, rotations in guard_variants.items():
    render(name, rotations)
for name, rotations in attack_variants.items():
    render(name, rotations)

print(f"POSE_TESTS={OUT}")

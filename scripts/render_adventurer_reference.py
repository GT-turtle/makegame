"""Render neutral inspection views of the CC0 Armored Adventurer source."""

from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import render_crusader_motion as base  # noqa: E402
import render_crusader_motion_v2 as v2  # noqa: E402

OUT = ROOT / "artifacts" / "crusader-3d-v2"
OUT.mkdir(parents=True, exist_ok=True)

rig = bpy.data.objects["The Armored Adventurer"]
rig.scale = tuple(value * 1.1905 for value in rig.scale)
rig.name = "Adventurer_CC0_Rig_190cm"

materials = v2.build_materials()
camera, label = v2.build_neutral_stage(materials)
label.hide_render = True
try:
    base.configure_render()
except TypeError:
    # This source blend stores the legacy AgX look labels without the prefix.
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    base.configure_render.__globals__["RENDER_SIZE"] = 720
    scene_settings = bpy.context.scene
    scene_settings.render.engine = "BLENDER_EEVEE"
    scene_settings.render.resolution_x = 720
    scene_settings.render.resolution_y = 720
    scene_settings.render.resolution_percentage = 100
    scene_settings.render.image_settings.file_format = "PNG"
    scene_settings.render.fps = 24
scene = bpy.context.scene
if scene.world is None:
    scene.world = bpy.data.worlds.new("NeutralWorld")
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get("Background")
background.inputs["Color"].default_value = (0.075, 0.082, 0.090, 1.0)
background.inputs["Strength"].default_value = 0.45

camera.location = (3.85, -7.55, 1.12)
camera.data.lens = 78
base.look_at(camera, (0.0, 0.0, 1.02))
scene.render.filepath = str(OUT / "adventurer_reference_front_3q.png")
bpy.ops.render.render(write_still=True)

camera.location = (-3.85, 7.55, 1.12)
base.look_at(camera, (0.0, 0.02, 1.02))
scene.render.filepath = str(OUT / "adventurer_reference_back_3q.png")
bpy.ops.render.render(write_still=True)

rig["source"] = "BlendKit The Armored Adventurer CC0"
rig["scaled_height_m"] = 1.90
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / "adventurer_reference_190cm.blend"))
print("ADVENTURER_REFERENCE_COMPLETE")

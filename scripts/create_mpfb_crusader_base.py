"""Create a reusable, human-proportioned MPFB male base with a Rigify control rig.

Run from the repository root:
  tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
    --python scripts/create_mpfb_crusader_base.py

The MPFB extension is installed in Blender's project-local portable profile.
"""

from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "mpfb-test"
BLEND_PATH = OUT / "crusader_mpfb_190cm_rigify.blend"
PREVIEW_PATH = OUT / "crusader_mpfb_190cm_preview.png"
REPORT_PATH = OUT / "crusader_mpfb_190cm_report.json"


def enable_addon(module: str) -> None:
    """Enable an add-on for this headless Blender process."""
    if module in bpy.context.preferences.addons:
        return
    result = bpy.ops.preferences.addon_enable(module=module)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not enable Blender add-on {module!r}: {result}")


def clear_scene() -> None:
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def make_material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.5):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return mat


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_preview_scene(human: bpy.types.Object) -> None:
    # A neutral slate material keeps this as a character-form preview, not a skin render.
    human.data.materials.clear()
    human.data.materials.append(make_material("Preview bodysuit", (0.20, 0.28, 0.36, 1.0), metallic=0.0, roughness=0.72))
    for polygon in human.data.polygons:
        polygon.use_smooth = True

    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.15, depth=0.12, location=(0.0, 0.0, -0.07))
    plinth = bpy.context.object
    plinth.name = "Preview plinth"
    plinth.data.materials.append(make_material("Warm stone", (0.20, 0.17, 0.12, 1.0), metallic=0.0, roughness=0.85))

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.028, 0.042, 0.065, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.34

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        point_at(obj, (0.0, 0.0, 1.0))
        return obj

    area("Key", (-3.0, -4.2, 4.8), 900.0, 3.0, (1.0, 0.80, 0.55))
    area("Fill", (3.6, -2.2, 2.7), 650.0, 2.6, (0.45, 0.68, 1.0))
    area("Rim", (0.0, 3.4, 3.8), 1000.0, 2.2, (1.0, 0.85, 0.48))

    cam_data = bpy.data.cameras.new("Preview Camera")
    cam = bpy.data.objects.new("Preview Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (3.05, -5.7, 2.35)
    cam.data.lens = 62
    point_at(cam, (0.0, 0.0, 1.02))
    bpy.context.scene.camera = cam

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    enable_addon("rigify")
    enable_addon("bl_ext.user_default.mpfb")

    from bl_ext.user_default.mpfb.services import HumanService, RigService, SystemService, TargetService

    if not SystemService.check_for_rigify():
        raise RuntimeError("Rigify enabled but MPFB cannot see its operators")

    clear_scene()

    macro = TargetService.get_default_macro_info_dict()
    macro.update(
        {
            "gender": 1.0,
            "age": 0.48,
            "muscle": 0.82,
            "weight": 0.61,
            "proportions": 0.62,
            # Calibrated against the installed MPFB 2.0.17 base: about 1.90 m.
            "height": 0.6485,
            "cupsize": 0.5,
            "firmness": 0.5,
            "race": {"asian": 0.15, "caucasian": 0.75, "african": 0.10},
        }
    )

    human = HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=False,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro,
    )
    human.name = "Crusader.Body.MPFB"

    metarig = HumanService.add_builtin_rig(human, "rigify.human", import_weights=True)
    metarig.name = "Crusader.Metarig"
    generated = RigService.generate_rigify_rig(metarig, name="Crusader.Rig", meta_rig_action="hide")
    if generated is None:
        raise RuntimeError("MPFB created its meta-rig, but Rigify rejected it")

    generated.name = "Crusader.Rig"
    generated.show_in_front = True

    # Keep human and generated control rig easy to find when the file is appended elsewhere.
    collection = bpy.data.collections.new("CRUSADER_MALE_BASE")
    bpy.context.scene.collection.children.link(collection)
    for obj in (human, generated):
        for existing in list(obj.users_collection):
            existing.objects.unlink(obj)
        collection.objects.link(obj)

    build_preview_scene(human)

    report = {
        "mpfb_version": "2.0.17",
        "human_object": human.name,
        "rig_object": generated.name,
        "metarig_object": metarig.name,
        "height_m": round(float(human.dimensions.z), 5),
        "dimensions_m": [round(float(v), 5) for v in human.dimensions],
        "vertices": len(human.data.vertices),
        "polygons": len(human.data.polygons),
        "shape_keys": len(human.data.shape_keys.key_blocks) if human.data.shape_keys else 0,
        "metarig_bones": len(metarig.data.bones),
        "generated_rig_bones": len(generated.data.bones),
        "armature_modifiers": [
            {"name": mod.name, "object": mod.object.name if mod.object else None}
            for mod in human.modifiers
            if mod.type == "ARMATURE"
        ],
        "macro": macro,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")

    readme = bpy.data.texts.new("MPFB_BASE_README.txt")
    readme.write(
        "Generated headlessly with MPFB 2.0.17 and Blender 5.2 LTS.\n"
        "Append collection CRUSADER_MALE_BASE to reuse the skinned human and Crusader.Rig.\n"
        "Crusader.Metarig is retained but hidden. Preview-only lights/camera/plinth are outside the reusable collection.\n"
    )

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    bpy.ops.render.render(write_still=True)
    # Save once more so the render result and final scene state are in the blend.
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    print("MPFB_BASE", json.dumps(report, ensure_ascii=False))
    print("MPFB_BASE blend", BLEND_PATH)
    print("MPFB_BASE preview", PREVIEW_PATH)
    print("MPFB_BASE report", REPORT_PATH)


if __name__ == "__main__":
    main()

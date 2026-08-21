"""Build the quality-reference Crusader render from reusable Blender assets.

The scene keeps Blender's official Human Base Mesh Rigify source and its
user-approved ``REF_IDLE_MID`` action.  A more detailed, licensed plate/mail
donor is posed from that action to establish the final visual standard.  The
script creates project-specific helmet, shield, sword, lighting and materials;
it never edits game code or the application version.

Run with Blender 5.2 or newer::

    blender --background --python scripts/create_hbm_crusader_hq_v2.py -- --draft
    blender --background --python scripts/create_hbm_crusader_hq_v2.py -- --final
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
import time
import zipfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
HBM_BLEND = ROOT / "artifacts" / "human-base-sculpt-crusader-reference-poses" / "human_base_sculpt_crusader_reference_poses.blend"
DONOR_BLEND = ROOT / "tools" / "runtime" / "asset-sources" / "hq-knight-rigged-baseline" / "hq-rigged-knight.blend"
HELMET_BLEND = ROOT / "tools" / "runtime" / "asset-sources" / "hq-knight-roblox-armour" / "hq-knight-roblox-armour.blend"
TARGET_IMAGE = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "target-concept-idle-v1.png"
OUT = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "actual"
BLEND_OUT = OUT / "human_base_crusader_hq_v2.blend"
RENDER_OUT = OUT / "crusader_hq_v2_idle_2048.png"
DRAFT_OUT = OUT / "crusader_hq_v2_idle_draft_1024.png"
REPORT_OUT = OUT / "build_report.json"
LICENSE_OUT = OUT / "SOURCES_AND_LICENSES.md"
README_OUT = OUT / "README.md"
ZIP_OUT = OUT / "human-base-crusader-hq-v2.zip"

CHAR_COLLECTION = "HQV2_CHARACTER"
GEAR_COLLECTION = "HQV2_PROJECT_GEAR"
STAGE_COLLECTION = "HQV2_STAGE"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", action="store_true")
    parser.add_argument("--final", action="store_true")
    parser.add_argument("--size", type=int, default=0)
    return parser.parse_args(argv)


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


def new_collection(name: str) -> bpy.types.Collection:
    old = bpy.data.collections.get(name)
    if old:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(old)
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    if obj.name not in collection.objects:
        collection.objects.link(obj)
    for current in list(obj.users_collection):
        if current != collection:
            current.objects.unlink(obj)


def append_donor() -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(DONOR_BLEND), link=False) as (data_from, data_to):
        wanted = [name for name in data_from.objects if not name.startswith("WGT-")]
        data_to.objects = wanted
    appended = [obj for obj in bpy.data.objects if obj not in before]
    rig = next((obj for obj in appended if obj.type == "ARMATURE" and obj.name.startswith("Rigged knight")), None)
    if rig is None:
        raise RuntimeError("Detailed donor rig did not append")
    collection = new_collection(CHAR_COLLECTION)
    useful = []
    for obj in appended:
        # Cameras, lights and generator helpers from the donor are not part of
        # the reusable character.
        if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith("WGT-"):
            obj.hide_render = True
            continue
        link_only(obj, collection)
        useful.append(obj)
    rig.name = "HQV2_Armour_Retarget_Rig"
    rig.data.name = "HQV2_Armour_Retarget_RigData"
    rig.show_in_front = False
    rig.hide_render = True
    # The donor is a 2.10 m scan/rig.  0.90 retains its adult eight-head
    # silhouette while landing the visible height at the 1.90 m HBM target.
    rig.scale = (0.90, 0.90, 0.90)
    rig.location = (0.0, 0.0, 0.0)
    return rig, useful


def hide_original_hbm_character() -> None:
    rig = bpy.data.objects.get("HB_Sculpt_Rigify")
    if rig:
        rig.hide_render = True
        rig.hide_viewport = True
    for obj in bpy.data.objects:
        if obj.name.startswith(("HB_", "HumanBaseSculpt.")):
            if obj.name.startswith(("HB_Neutral_Studio_Floor",)):
                continue
            obj.hide_render = True
    # The official HBM objects stay embedded in the blend for comparison and
    # future transfer; only the visual quality-reference render hides them.


def material_principled(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
    bump_strength: float = 0.12,
    bump_scale: float = 95.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (220, 0)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.06 if metallic else 0.01
    noise = nodes.new("ShaderNodeTexNoise")
    noise.location = (-560, -120)
    noise.inputs["Scale"].default_value = bump_scale
    noise.inputs["Detail"].default_value = 5.0
    noise.inputs["Roughness"].default_value = 0.7
    noise.inputs["Distortion"].default_value = 0.12
    bump = nodes.new("ShaderNodeBump")
    bump.location = (-60, -140)
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.0013
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if emission is not None and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def material_emission(name: str, color: tuple[float, float, float, float], strength: float = 0.22) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = strength
    links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


def create_project_materials() -> dict[str, bpy.types.Material]:
    return {
        "ivory": material_principled("HQV2_Ivory_Hammered_Steel", (0.62, 0.54, 0.41, 1), metallic=0.82, roughness=0.56, bump_strength=0.22, bump_scale=125.0),
        "shield_face": material_principled("HQV2_Weathered_Ivory_Shield_Face", (0.63, 0.53, 0.37, 1), metallic=0.28, roughness=0.62, bump_strength=0.38, bump_scale=92.0),
        "steel": material_principled("HQV2_Dark_Articulated_Steel", (0.075, 0.095, 0.12, 1), metallic=0.93, roughness=0.50, bump_strength=0.14, bump_scale=135.0),
        "gold": material_principled("HQV2_Aged_Sun_Gold", (0.52, 0.25, 0.045, 1), metallic=0.90, roughness=0.45, bump_strength=0.10, bump_scale=110.0),
        "leather": material_principled("HQV2_Oiled_Brown_Leather", (0.075, 0.023, 0.010, 1), metallic=0.0, roughness=0.55, bump_strength=0.34, bump_scale=72.0),
        "dark": material_principled("HQV2_Visor_Black", (0.004, 0.006, 0.010, 1), metallic=0.50, roughness=0.38, bump_strength=0.08, bump_scale=140.0),
        "cyan": material_principled("HQV2_Spirit_Cyan", (0.005, 0.22, 0.32, 1), metallic=0.16, roughness=0.15, bump_strength=0.03, bump_scale=90.0, emission=(0.02, 0.72, 1.0, 1), emission_strength=4.5),
        "stone": material_principled("HQV2_Stone", (0.035, 0.045, 0.055, 1), metallic=0.0, roughness=0.83, bump_strength=0.45, bump_scale=18.0),
        "wall": material_emission("HQV2_Unlit_Dark_Stone_Wall", (0.028, 0.036, 0.046, 1), 0.34),
    }


def retint_donor_materials(mats: dict[str, bpy.types.Material]) -> None:
    """Use the donor's detailed geometry/UV assets with project palette.

    Chain, cloth, leather and skin keep their packed 2K source textures.  Only
    generic plate materials are replaced, which makes the silhouette read as
    the yellow/ivory Crusader without flattening the mail detail.
    """
    treated: set[bpy.types.Material] = set()
    for obj in bpy.data.collections[CHAR_COLLECTION].objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            name = slot.material.name.lower() if slot.material else ""
            if "steel" in name and slot.material not in treated:
                # Keep every packed donor texture (2K base colour, metallic,
                # roughness and normal).  A screen tint is inserted only in
                # front of the donor's PBR group, preserving all surface data.
                mat = slot.material
                treated.add(mat)
                if not mat.use_nodes or not mat.node_tree:
                    continue
                nodes = mat.node_tree.nodes
                links = mat.node_tree.links
                pbr = next((node for node in nodes if node.type == "GROUP" and "Base Color" in node.inputs), None)
                if pbr is None:
                    continue
                incoming = next((link for link in links if link.to_node == pbr and link.to_socket.name == "Base Color"), None)
                if incoming is None:
                    continue
                source_socket = incoming.from_socket
                links.remove(incoming)
                tint = nodes.new("ShaderNodeMixRGB")
                tint.name = "HQV2 Warm Ivory Retint (keeps 2K PBR)"
                tint.label = "Warm ivory; donor PBR preserved"
                tint.blend_type = "SCREEN"
                tint.inputs[0].default_value = 0.42
                tint.inputs[2].default_value = (0.46, 0.32, 0.14, 1.0)
                tint.location = (pbr.location.x - 210, pbr.location.y + 110)
                links.new(source_socket, tint.inputs[1])
                links.new(tint.outputs[0], pbr.inputs["Base Color"])
            elif "skin" in name:
                # The head and hands remain mostly covered, but retain the
                # donor's packed skin material instead of a flat substitute.
                continue


def remove_source_head_and_right_hand() -> None:
    """Remove exposed donor skin under the closed helmet and gauntlet.

    Selection is made from the existing Rigify vertex groups, so UVs, packed
    textures, the rest of the body and every armor object remain untouched.
    """
    candidate = None
    for obj in bpy.data.collections[CHAR_COLLECTION].objects:
        if obj.type == "MESH" and len(obj.data.vertices) > 20000 and obj.vertex_groups:
            candidate = obj
            break
    if candidate is None:
        return
    right_group_indices = {
        group.index for group in candidate.vertex_groups
        if group.name == "DEF-hand.R"
        or (group.name.startswith("DEF-f_") and group.name.endswith(".R"))
        or (group.name.startswith("DEF-thumb") and group.name.endswith(".R"))
        or (group.name.startswith("DEF-palm") and group.name.endswith(".R"))
    }
    if not right_group_indices:
        return
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")
    candidate.select_set(True)
    bpy.context.view_layer.objects.active = candidate
    for vertex in candidate.data.vertices:
        hand_weight = sum(link.weight for link in vertex.groups if link.group in right_group_indices)
        # Rest-space z > 1.72 is the bald donor head.  All authored plate,
        # pauldrons and gorget meshes are separate objects and remain intact.
        vertex.select = hand_weight > 0.34 or vertex.co.z > 1.72
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")
    candidate.select_set(False)


def smooth_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> bpy.types.Object:
    if obj.type == "MESH":
        for poly in obj.data.polygons:
            poly.use_smooth = True
        bevel = obj.modifiers.new("HQV2 forged edge", "BEVEL")
        bevel.width = width
        bevel.segments = segments
        bevel.limit_method = "ANGLE"
    return obj


def rounded_box(name: str, location, dimensions, material, *, bevel=0.012, rotation=(0, 0, 0), collection=None):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    smooth_bevel(obj, bevel, 4)
    if collection:
        link_only(obj, collection)
    return obj


def create_outline_curve(name: str, points: list[tuple[float, float, float]], bevel: float, material, collection):
    curve = bpy.data.curves.new(name + "Data", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 5
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def create_shield(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    collection = bpy.data.collections[GEAR_COLLECTION]
    before = set(collection.objects)
    cx, cy, cz = 0.58, -0.21, 0.91
    curve_scale = 1.32
    outline = [
        (-0.28, 0.62), (-0.22, 0.72), (0.22, 0.72), (0.28, 0.62),
        (0.25, -0.24), (0.14, -0.55), (0.0, -0.74), (-0.14, -0.55), (-0.25, -0.24),
    ]
    verts = []
    for depth in (-0.032, 0.032):
        for x, z in outline:
            bow = -0.070 * curve_scale * (1.0 - min(1.0, (x / 0.30) ** 2))
            verts.append((cx + x, cy + depth + bow, cz + z))
    n = len(outline)
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        faces.append((i, (i + 1) % n, n + (i + 1) % n, n + i))
    mesh = bpy.data.meshes.new("HQV2_ShieldFaceMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    shield = bpy.data.objects.new("HQV2_Thin_Curved_Greatshield", mesh)
    collection.objects.link(shield)
    shield.data.materials.append(mats["shield_face"])
    shield_solid = shield.modifiers.new("HQV2_ShieldShell", "SOLIDIFY")
    shield_solid.thickness = 0.0075
    shield_solid.offset = 1.0
    shield_solid.use_rim = True
    smooth_bevel(shield, 0.010, 4)
    front_y = cy - 0.083
    rim_points = [
        (cx + x * 0.98, front_y - 0.018 * (1.0 - min(1.0, (x / 0.30) ** 2)), cz + z * 1.01)
        for x, z in outline
    ]
    create_outline_curve("HQV2_Shield_AgedGold_Rim", rim_points, 0.018, mats["gold"], collection)
    rounded_box("HQV2_Shield_Cross_V", (cx, front_y - 0.012, cz + 0.02), (0.042, 0.024, 0.77), mats["gold"], bevel=0.012, collection=collection)
    rounded_box("HQV2_Shield_Cross_H", (cx, front_y - 0.014, cz + 0.09), (0.40, 0.026, 0.044), mats["gold"], bevel=0.012, collection=collection)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.026, location=(cx, front_y - 0.030, cz + 0.09))
    gem = bpy.context.object
    gem.name = "HQV2_Shield_Spirit_Gem"
    gem.scale = (1.0, 0.42, 1.0)
    gem.data.materials.append(mats["cyan"])
    link_only(gem, collection)
    # Subtle forged rivets make the construction readable at game-camera
    # distance without turning the shield into decorative jewellery.
    rivet_points = []
    for x, z in outline[:-1]:
        rivet_points.append((cx + x * 0.92, front_y - 0.028, cz + z * 0.92))
    for z in (-0.38, -0.12, 0.18, 0.43):
        rivet_points.extend(((cx - 0.235, front_y - 0.028, cz + z), (cx + 0.235, front_y - 0.028, cz + z)))
    for index, point in enumerate(rivet_points):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.010, location=point)
        rivet = bpy.context.object
        rivet.name = f"HQV2_Shield_Rivet_{index+1:02d}"
        rivet.scale = (1.0, 0.55, 1.0)
        rivet.data.materials.append(mats["gold"])
        link_only(rivet, collection)
    # Back leather field gives the shield actual layered construction.
    rounded_box("HQV2_Shield_Back_Leather", (cx, cy + 0.047, cz + 0.03), (0.43, 0.026, 0.83), mats["leather"], bevel=0.030, collection=collection)
    # Keep height, reduce width by 7%, and yaw the shield outward.  This still
    # protects shoulder-to-below-knee but reveals more of the armored body.
    pivot = Vector((cx, cy, cz))
    transform = (
        Matrix.Translation(pivot)
        @ Matrix.Rotation(math.radians(-18.0), 4, "Z")
        @ Matrix.Diagonal((0.88, 0.88, 1.04, 1.0))
        @ Matrix.Translation(-pivot)
    )
    for obj in list(collection.objects):
        if obj not in before:
            obj.matrix_world = transform @ obj.matrix_world
    return shield


def create_plate_capsule(name: str, a: Vector, b: Vector, radius: float, material, collection, *, depth_ratio=0.80):
    direction = b - a
    length = max(0.04, direction.length)
    axis = direction.normalized()
    front = Vector((0.0, -1.0, 0.0))
    front = front - axis * front.dot(axis)
    if front.length < 1.0e-4:
        front = Vector((0.0, 0.0, 1.0))
    front.normalize()
    side = axis.cross(front).normalized()
    # A tapered, shallow convex plate following the front of the limb.  This
    # avoids the bulbous toy look of a full ellipsoid while still reading from
    # the game camera as real cuisse/vambrace construction.
    rows = ((0.0, 0.88), (0.48, 1.0), (1.0, 0.74))
    depth = max(0.014, radius * 0.19 * depth_ratio)
    verts = []
    for layer in (0.0, -depth):
        for t, width_factor in rows:
            center = a.lerp(b, t) + front * (radius * 0.58 + (0.018 if t == 0.48 and layer == 0.0 else 0.0) + layer)
            width = radius * width_factor
            verts.extend((center - side * width, center + side * width))
    faces = [
        (0, 1, 3, 2), (2, 3, 5, 4),
        (6, 8, 9, 7), (8, 10, 11, 9),
        (0, 6, 7, 1), (4, 5, 11, 10),
        (0, 2, 8, 6), (1, 7, 9, 3),
        (2, 4, 10, 8), (3, 9, 11, 5),
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.name = name
    obj.data.materials.append(material)
    collection.objects.link(obj)
    smooth_bevel(obj, min(0.009, radius * 0.08), 4)
    return obj


def create_plate_band(name: str, center: Vector, direction: Vector, radius: float, material, collection):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=0.0040, major_segments=40, minor_segments=10, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())
    obj.data.materials.append(material)
    link_only(obj, collection)
    return obj


def add_articulated_limb_armor(mats: dict[str, bpy.types.Material]) -> None:
    """Fill the cloth-tube gaps with cuisses, poleyns and arm articulation."""
    collection = bpy.data.collections[GEAR_COLLECTION]
    rig = bpy.data.objects["HQV2_Armour_Retarget_Rig"]
    donor_plate = next((m for m in bpy.data.materials if "steel" in m.name.lower() and m.use_nodes), mats["ivory"])
    # Slightly bulk the donor's existing authored pauldrons/vambraces; geometry
    # and packed textures remain untouched.
    for obj in bpy.data.collections[CHAR_COLLECTION].objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith(("FinalBaseMesh_001.", "FinalBaseMesh_013.", "FinalBaseMesh_006.")):
            # 5~8% scale-out gives a hand-painted "plate edge" feel instead
            # of cloth-tight silhouette while preserving proportions.
            obj.scale = (obj.scale[0] * 1.058, obj.scale[1] * 1.062, obj.scale[2] * 1.048)

    def world_head(name: str) -> Vector:
        return rig.matrix_world @ rig.pose.bones[name].head

    def world_tail(name: str) -> Vector:
        return rig.matrix_world @ rig.pose.bones[name].tail

    # Arm shielding: add dedicated rerebrace and cuff to keep the guard side more
    # visually present in front-view battle poses.
    for side in ("L", "R"):
        # Arm coverage pieces.
        upper_a = world_head(f"DEF-upper_arm.{side}")
        upper_b = world_tail(f"DEF-upper_arm.{side}.001")
        upper_vec = upper_b - upper_a
        create_plate_capsule(
            f"HQV2_Rerebrace_{side}",
            upper_a + upper_vec * 0.14,
            upper_a + upper_vec * 0.78,
            0.085,
            donor_plate,
            collection,
            depth_ratio=0.80,
        )
        fore_a = world_head(f"DEF-forearm.{side}")
        fore_b = world_tail(f"DEF-forearm.{side}.001")
        fore_vec = fore_b - fore_a
        create_plate_capsule(
            f"HQV2_Vambrace_{side}",
            fore_a + fore_vec * 0.18,
            fore_a + fore_vec * 0.78,
            0.074,
            donor_plate,
            collection,
            depth_ratio=0.76,
        )
        create_plate_band(f"HQV2_Vambrace_Cuff_{side}", fore_a + fore_vec * 0.82, fore_vec, 0.065, mats["gold"], collection)
        if side == "L":
            # Left side is the shield-bearing arm in this front pose: add a
            # slightly wider elbow guard to strengthen torso coverage.
            upper_dir = upper_vec.normalized()
            elbow_guard = create_plate_capsule(
                "HQV2_Shield_ElbowGuard_L",
                world_tail(f"DEF-upper_arm.L.001") - upper_dir * 0.05,
                world_head(f"DEF-forearm.L") + upper_dir * 0.05,
                0.100,
                donor_plate,
                collection,
                depth_ratio=0.66,
            )
            elbow_guard.name = "HQV2_Shield_ElbowGuard_L"
            elbow_guard.scale = (1.09, 1.09, 1.07)
            for c in elbow_guard.children_recursive:
                if c and c.type == "MESH":
                    c.select_set(False)

    # Lower body articulation.
    for side in ("L", "R"):
        thigh_start = world_head(f"DEF-thigh.{side}")
        thigh_end = world_tail(f"DEF-thigh.{side}.001")
        thigh_vec = thigh_end - thigh_start
        a = thigh_start + thigh_vec * 0.12
        b = thigh_start + thigh_vec * 0.78
        create_plate_capsule(f"HQV2_Cuisse_{side}", a, b, 0.111, donor_plate, collection, depth_ratio=0.72)
        create_plate_band(f"HQV2_Cuisse_UpperBand_{side}", a + (b - a) * 0.10, b - a, 0.093, mats["gold"], collection)
        create_plate_band(f"HQV2_Cuisse_LowerBand_{side}", a + (b - a) * 0.88, b - a, 0.089, mats["gold"], collection)
        knee = world_head(f"DEF-shin.{side}")
        knee_axis = (world_tail(f"DEF-thigh.{side}.001") - world_head(f"DEF-thigh.{side}.001")).normalized()
        create_plate_capsule(
            f"HQV2_Articulated_Poleyn_{side}",
            knee - knee_axis * 0.060,
            knee + knee_axis * 0.065,
            0.112,
            donor_plate,
            collection,
            depth_ratio=0.62,
        )


def thicken_near_body_plates() -> None:
    """Add a subtle shell so major armor read as plates rather than tight cloth."""
    for obj in bpy.data.collections[CHAR_COLLECTION].objects:
        if obj.type != "MESH":
            continue
        name = obj.name.lower()
        if any(token in name for token in ("skin", "eyes", "cloth", "fingers", "hand", "head", "face")):
            continue
        if any(token in name for token in ("greatshield", "sword", "gem")):
            continue
        if obj.modifiers.get("HQV2_Air_Gap"):
            continue
        has_plate_mat = any(
            slot.material
            and (
                slot.material.name.lower().startswith("hqv2_") or
                any(key in slot.material.name.lower() for key in ("steel", "gold", "leather", "stone", "visor", "dark"))
            )
            for slot in obj.material_slots
        )
        if not has_plate_mat and obj.data.vertices.__len__() < 500:
            continue
        gap = obj.modifiers.new("HQV2_Air_Gap", "SOLIDIFY")
        gap.thickness = 0.0032
        gap.offset = 1.0
        gap.use_rim = False
        gap.thickness = max(0.0018, obj.dimensions.x * 0.015)
        gap.offset = 1.0
        # Keep only a subtle shell so the figure stays readable at UI distance.
        if obj.dimensions.length > 0.9:
            gap.thickness = min(0.0085, gap.thickness * 1.1)
            gap.use_rim = False
            # Add a touch of bevel for hand-painted edge separation.
            bevel = obj.modifiers.new("HQV2_Air_Bevel", "BEVEL")
            bevel.width = 0.0018
            bevel.segments = 1
            bevel.limit_method = "NONE"


def add_cuirass_details(mats: dict[str, bpy.types.Material]) -> None:
    collection = bpy.data.collections[GEAR_COLLECTION]
    # Thin forged relief, not broad decorative bars.  The warm gold and tiny
    # spirit stone establish the Crusader palette while retaining worn steel.
    rounded_box("HQV2_Cuirass_Cross_V", (0.0, -0.193, 1.392), (0.026, 0.018, 0.205), mats["gold"], bevel=0.006, collection=collection)
    rounded_box("HQV2_Cuirass_Cross_H", (0.0, -0.196, 1.438), (0.135, 0.019, 0.026), mats["gold"], bevel=0.006, collection=collection)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=0.012, location=(0.0, -0.209, 1.438))
    gem = bpy.context.object
    gem.name = "HQV2_Cuirass_Tiny_Spirit_Stone"
    gem.scale = (1.0, 0.45, 1.0)
    gem.data.materials.append(mats["cyan"])
    link_only(gem, collection)
    for side in (-1.0, 1.0):
        for index, z in enumerate((1.270, 1.355, 1.520)):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.008, location=(0.205 * side, -0.164, z))
            rivet = bpy.context.object
            rivet.name = f"HQV2_Cuirass_Rivet_{'L' if side < 0 else 'R'}_{index+1}"
            rivet.scale = (1.0, 0.55, 1.0)
            rivet.data.materials.append(mats["gold"])
            link_only(rivet, collection)


def create_blade(name: str, base: Vector, direction: Vector, length: float, width: float, depth: float, material, collection):
    d = direction.normalized()
    z = d
    helper = Vector((0, 1, 0))
    x = helper.cross(z).normalized()
    y = z.cross(x).normalized()
    half = width * 0.5
    hd = depth * 0.5
    shoulders = base + z * (length * 0.90)
    tip = base + z * length
    verts = [
        base - x * half - y * hd, base + x * half - y * hd,
        shoulders - x * half * 0.88 - y * hd, shoulders + x * half * 0.88 - y * hd,
        tip - y * hd,
        base - x * half + y * hd, base + x * half + y * hd,
        shoulders - x * half * 0.88 + y * hd, shoulders + x * half * 0.88 + y * hd,
        tip + y * hd,
    ]
    faces = [(0, 1, 3, 2), (5, 7, 8, 6), (0, 5, 6, 1), (2, 3, 8, 7), (0, 2, 7, 5), (1, 6, 8, 3), (2, 4, 9, 7), (3, 8, 9, 4)]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("HQV2 blade edge", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 2
    return obj, (x, y, z)


def create_sword(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    collection = bpy.data.collections[GEAR_COLLECTION]
    rig = bpy.data.objects["HQV2_Armour_Retarget_Rig"]
    hand = rig.pose.bones["DEF-hand.R"]
    hand_center = (rig.matrix_world @ hand.head + rig.matrix_world @ hand.tail) * 0.5
    direction = Vector((-0.17, -0.05, 0.985)).normalized()
    grip_bottom = hand_center - direction * 0.145
    guard_center = grip_bottom + direction * 0.30
    blade, axes = create_blade("HQV2_Thin_Claymore_Blade", guard_center + direction * 0.012, direction, 1.00, 0.073, 0.017, mats["steel"], collection)
    x, y, z = axes
    # Cylinders are aligned to local Z, then rotated to the desired axis.
    def cylinder(name, center, radius, depth, material, axis, vertices=32):
        bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
        obj = bpy.context.object
        obj.name = name
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(axis)
        obj.data.materials.append(material)
        smooth_bevel(obj, min(radius * 0.18, 0.006), 3)
        link_only(obj, collection)
        return obj
    grip = cylinder("HQV2_Claymore_Leather_Grip", grip_bottom + direction * 0.145, 0.022, 0.29, mats["leather"], direction)
    guard = cylinder("HQV2_Claymore_Gold_Crossguard", guard_center, 0.016, 0.34, mats["gold"], x)
    cylinder("HQV2_Claymore_Gold_Pommel", grip_bottom - direction * 0.035, 0.036, 0.065, mats["gold"], direction)
    # A closed articulated gauntlet is intentionally modelled over the source
    # hand.  It places the hilt inside the grip instead of leaving an open,
    # mannequin-like palm next to the weapon.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.072, location=hand_center)
    fist = bpy.context.object
    fist.name = "HQV2_Right_Closed_Gauntlet"
    fist.scale = (1.08, 0.72, 0.92)
    fist.rotation_euler = (0.12, -0.18, 0.05)
    fist.data.materials.append(mats["ivory"])
    link_only(fist, collection)
    for index, offset in enumerate((-0.045, -0.015, 0.015, 0.045)):
        rounded_box(
            f"HQV2_Right_Knuckle_{index+1}",
            (hand_center.x + offset, hand_center.y - 0.055, hand_center.z + 0.010),
            (0.026, 0.021, 0.034), mats["gold"], bevel=0.006, collection=collection,
        )
    return blade


def create_project_helmet(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    collection = bpy.data.collections[GEAR_COLLECTION]
    before = set(collection.objects)
    # A compact rounded shell, 29 cm wide and 35 cm tall, replaces the donor's
    # exposed-face helmet.  The near-eight-head body proportion is retained.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.0, location=(0.0, -0.002, 1.765))
    dome = bpy.context.object
    dome.name = "HQV2_Compact_Rounded_Great_Helm"
    dome.scale = (0.145, 0.155, 0.178)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    dome.data.materials.append(mats["ivory"])
    smooth_bevel(dome, 0.0025, 2)
    link_only(dome, collection)
    # Bow the closed visor around the face instead of using a flat plate.
    z_rows = (1.610, 1.675, 1.785, 1.868)
    widths = (0.112, 0.132, 0.142, 0.122)
    cols = 8
    verts = []
    for z, width in zip(z_rows, widths):
        for i in range(cols + 1):
            x = -width + 2.0 * width * i / cols
            ratio = min(1.0, abs(x / max(width, 1.0e-6)))
            y = -0.018 - 0.140 * math.sqrt(max(0.0, 1.0 - ratio * ratio))
            verts.append((x, y, z))
    faces = []
    for row in range(len(z_rows) - 1):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + 1 + cols + 1, a + cols + 1))
    mesh = bpy.data.meshes.new("HQV2_Closed_Visor_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    visor = bpy.data.objects.new("HQV2_Closed_Bowed_Visor", mesh)
    collection.objects.link(visor)
    visor.data.materials.append(mats["ivory"])
    solid = visor.modifiers.new("Forged visor thickness", "SOLIDIFY")
    solid.thickness = 0.018
    solid.offset = -0.2
    smooth_bevel(visor, 0.010, 4)
    # Camera faces -Y.  Gold is restrained to the cross and rolled brow.
    rounded_box("HQV2_Helmet_Cross_V", (0.0, -0.177, 1.738), (0.029, 0.021, 0.232), mats["gold"], bevel=0.007, collection=collection)
    rounded_box("HQV2_Helmet_Cross_H", (0.0, -0.176, 1.790), (0.205, 0.022, 0.029), mats["gold"], bevel=0.007, collection=collection)
    rounded_box("HQV2_Helmet_Visor_Slit_L", (-0.057, -0.190, 1.790), (0.071, 0.009, 0.012), mats["dark"], bevel=0.003, collection=collection)
    rounded_box("HQV2_Helmet_Visor_Slit_R", (0.057, -0.190, 1.790), (0.071, 0.009, 0.012), mats["dark"], bevel=0.003, collection=collection)
    # Mouth vents, cut-looking dark slots rather than a visible face.
    for index, x in enumerate((-0.055, -0.0275, 0.0, 0.0275, 0.055)):
        rounded_box(f"HQV2_Helmet_MouthVent_{index+1}", (x, -0.178, 1.668), (0.009, 0.009, 0.032), mats["dark"], bevel=0.0025, rotation=(0.0, math.radians(-7.0 * x / 0.055) if x else 0.0, 0.0), collection=collection)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.132, minor_radius=0.010, major_segments=48, minor_segments=12, location=(0.0, -0.008, 1.606))
    neck = bpy.context.object
    neck.name = "HQV2_Helmet_Fitted_Neck_Roll"
    neck.data.materials.append(mats["gold"])
    link_only(neck, collection)
    # A rolled crown ridge and hinge caps keep the silhouette from looking
    # featureless while staying period-neutral.
    ridge_points = [(0.0, -0.012 + 0.002 * math.cos(t), 1.920 - 0.155 * (t / math.pi)) for t in [i * math.pi / 10 for i in range(11)]]
    ridge_curve = bpy.data.curves.new("HQV2_Helmet_Crown_Ridge_Data", "CURVE")
    ridge_curve.dimensions = "3D"
    ridge_curve.bevel_depth = 0.008
    ridge_curve.bevel_resolution = 4
    spline = ridge_curve.splines.new("POLY")
    spline.points.add(len(ridge_points) - 1)
    for point, co in zip(spline.points, ridge_points):
        point.co = (*co, 1.0)
    ridge = bpy.data.objects.new("HQV2_Helmet_Crown_Ridge", ridge_curve)
    collection.objects.link(ridge)
    ridge.data.materials.append(mats["gold"])
    for side in (-1.0, 1.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.014, location=(0.142 * side, -0.010, 1.735))
        hinge = bpy.context.object
        hinge.name = f"HQV2_Helmet_Hinge_{'L' if side < 0 else 'R'}"
        hinge.scale = (0.45, 1.0, 1.0)
        hinge.data.materials.append(mats["gold"])
        link_only(hinge, collection)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.011, location=(0.0, -0.190, 1.895))
    gem = bpy.context.object
    gem.name = "HQV2_Helmet_Spirit_Gem"
    gem.scale = (1.0, 0.40, 1.0)
    gem.data.materials.append(mats["cyan"])
    link_only(gem, collection)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.145, radius2=0.125, depth=0.070, location=(0.0, -0.003, 1.570))
    gorget = bpy.context.object
    gorget.name = "HQV2_Closed_Chain_Gorget"
    gorget.data.materials.append(mats["dark"])
    smooth_bevel(gorget, 0.006, 3)
    link_only(gorget, collection)
    # Seat the finished helmet lower on the shoulders: crown stays compact and
    # the chin/neck opening disappears behind the fitted gorget.
    for obj in list(collection.objects):
        if obj not in before:
            obj.location.z -= 0.025
    helmet_pivot = Vector((0.0, -0.002, 1.720))
    compact = Matrix.Translation(helmet_pivot) @ Matrix.Diagonal((0.91, 0.91, 0.91, 1.0)) @ Matrix.Translation(-helmet_pivot)
    for obj in list(collection.objects):
        if obj not in before and obj != gorget:
            obj.matrix_world = compact @ obj.matrix_world
    return dome


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_stage(mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    # Remove old presentation elements, keeping the source character data.
    for obj in list(bpy.data.objects):
        if obj.name.startswith(("HQ_", "REF_Studio_Camera")):
            bpy.data.objects.remove(obj, do_unlink=True)
    collection = new_collection(STAGE_COLLECTION)
    floor = rounded_box("HQV2_Stone_Floor", (0, 0, -0.07), (12, 12, 0.14), mats["stone"], bevel=0.025, collection=collection)
    rounded_box("HQV2_Stone_Wall", (0, 5.0, 2.2), (10.5, 0.18, 4.5), mats["wall"], bevel=0.04, collection=collection)
    for x in (-2.75, 2.75):
        rounded_box(f"HQV2_Stone_Pillar_{x:+.0f}", (x, 4.82, 2.0), (0.42, 0.34, 4.0), mats["stone"], bevel=0.035, collection=collection)
    focus = bpy.data.objects.new("HQV2_Camera_Focus", None)
    collection.objects.link(focus)
    focus.location = (0.04, 0.0, 1.02)
    camera_data = bpy.data.cameras.new("HQV2_CameraData")
    camera_data.lens = 78.0
    camera_data.sensor_width = 36.0
    camera_data.dof.use_dof = True
    camera_data.dof.focus_object = focus
    camera_data.dof.aperture_fstop = 8.0
    camera = bpy.data.objects.new("HQV2_Hero_Camera", camera_data)
    collection.objects.link(camera)
    camera.location = (2.45, -5.95, 1.08)
    point_at(camera, focus.location)
    bpy.context.scene.camera = camera
    def area(name, location, energy, color, size, target=(0, 0, 1.0)):
        data = bpy.data.lights.new(name + "Data", "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        point_at(obj, Vector(target))
        return obj
    area("HQV2_Key", (-3.5, -4.0, 4.7), 830, (1.0, 0.78, 0.54), 3.8, (0, 0, 1.2))
    area("HQV2_Fill", (4.2, -2.5, 3.0), 620, (0.48, 0.68, 1.0), 3.6, (0, 0, 1.0))
    area("HQV2_Rim", (2.5, 3.2, 3.9), 620, (1.0, 0.78, 0.48), 4.2, (0, 0, 1.35))
    area("HQV2_Top", (0, 0, 5.0), 520, (1.0, 0.88, 0.72), 3.5, (0, 0, 0.8))
    return camera


def configure_render(size: int) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 16
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.eevee.taa_render_samples = 128 if size <= 1024 else 256
    scene.eevee.use_fast_gi = True
    scene.eevee.fast_gi_quality = 1.0
    scene.eevee.fast_gi_step_count = 24
    scene.eevee.fast_gi_ray_count = 6
    scene.eevee.fast_gi_distance = 4.0
    scene.eevee.shadow_ray_count = 6
    scene.eevee.shadow_step_count = 16
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -0.40
    scene.view_settings.gamma = 1.0
    if scene.world is None:
        scene.world = bpy.data.worlds.new("HQV2_World")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.006, 0.010, 0.016, 1)
        bg.inputs["Strength"].default_value = 0.14


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def write_notes(render_size: int, render_seconds: float) -> None:
    LICENSE_OUT.write_text(
        """# Sources and licenses\n\n"
        "- **Human Base Meshes v1.4.1** — Blender Foundation demo asset, `Body Male - Realistic`; CC0. "
        "Source: https://www.blender.org/download/demo-files/\n"
        "- **Rigged knight** — BlendKit asset; `royalty_free` in the official API metadata captured locally. "
        "Its packed 2K PBR meshes are used as the detailed visual armor donor. The original donor `.blend` is **not** redistributed in the delivery ZIP.\n"
        "- Project-specific rounded great helm, shield, sword, cross emblems, spirit gems, materials, stage and build script were created for this prototype.\n\n"
        "See the local official API snapshots under `tools/runtime/asset-sources/` for exact IDs, authors and terms.\n",
        encoding="utf-8",
    )
    README_OUT.write_text(
        """# Human Base Crusader HQ v2\n\n"
        "This is a single-frame quality reference for the Crusader. It preserves the official HBM rig/action source in the Blender file and drives the detailed visual armor from the approved idle action.\n\n"
        "Open `human_base_crusader_hq_v2.blend`, choose frame 1, and render with `HQV2_Hero_Camera`.\n"
        "Rebuild with Blender 5.2+: `blender --background --python scripts/create_hbm_crusader_hq_v2.py -- --final`.\n\n"
        "The ZIP intentionally excludes third-party donor source `.blend` files. Keep the local donor files in `tools/runtime/asset-sources/` when rebuilding.\n",
        encoding="utf-8",
    )
    report = {
        "name": "Human Base Crusader HQ v2 idle quality reference",
        "source_hbm": str(HBM_BLEND),
        "source_detailed_armor": str(DONOR_BLEND),
        "source_helmet": "project-specific procedural rounded great helm",
        "target_concept": str(TARGET_IMAGE),
        "output_blend": str(BLEND_OUT),
        "output_render": str(RENDER_OUT if render_size >= 2048 else DRAFT_OUT),
        "render": {"engine": "BLENDER_EEVEE", "resolution": [render_size, render_size], "samples": 256 if render_size > 1024 else 128, "seconds": round(render_seconds, 2), "camera_lens_mm": 78},
        "character": {"nominal_height_cm": 190, "pose": "REF_IDLE_MID", "visible_rig": "HQV2_Armour_Retarget_Rig", "official_hbm_rig_retained": "HB_Sculpt_Rigify", "adult_proportion": "near eight heads, reduced helmet silhouette, long legs"},
        "licenses": {"human_base_mesh": "CC0", "detailed_armor_donor": "BlendKit royalty_free", "project_gear": "project-created", "donor_sources_in_zip": False},
    }
    REPORT_OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def package() -> None:
    with zipfile.ZipFile(ZIP_OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in (BLEND_OUT, RENDER_OUT, REPORT_OUT, LICENSE_OUT, README_OUT, TARGET_IMAGE, Path(__file__)):
            if path.exists():
                arc = path.name if path.parent == OUT else f"references/{path.name}" if path == TARGET_IMAGE else f"scripts/{path.name}"
                zf.write(path, arc)
    (OUT / (ZIP_OUT.name + ".sha256")).write_text(f"{sha256(ZIP_OUT)}  {ZIP_OUT.name}\n", encoding="ascii")


def main() -> None:
    args = parse_args()
    size = args.size or (2048 if args.final else 1024)
    OUT.mkdir(parents=True, exist_ok=True)
    if not HBM_BLEND.exists() or not DONOR_BLEND.exists():
        raise FileNotFoundError("Required local source blend is missing")
    bpy.ops.wm.open_mainfile(filepath=str(HBM_BLEND))
    hbm_rig = bpy.data.objects["HB_Sculpt_Rigify"]
    idle = bpy.data.actions["REF_IDLE_MID"]
    assign_action(hbm_rig, idle)
    gear = new_collection(GEAR_COLLECTION)
    donor_rig, donor_objects = append_donor()
    assign_action(donor_rig, idle)
    hide_original_hbm_character()
    mats = create_project_materials()
    retint_donor_materials(mats)
    remove_source_head_and_right_hand()
    create_project_helmet(mats)
    add_articulated_limb_armor(mats)
    thicken_near_body_plates()
    add_cuirass_details(mats)
    create_shield(mats)
    create_sword(mats)
    create_stage(mats)
    configure_render(size)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    render_path = RENDER_OUT if size >= 2048 else DRAFT_OUT
    bpy.context.scene.render.filepath = str(render_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT), compress=True)
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True)
    elapsed = time.perf_counter() - started
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT), compress=True)
    write_notes(size, elapsed)
    if size >= 2048:
        package()
    print("HQV2_RESULT", json.dumps({"render": str(render_path), "blend": str(BLEND_OUT), "size": size, "seconds": round(elapsed, 2)}))


if __name__ == "__main__":
    main()

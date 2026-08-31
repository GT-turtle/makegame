"""Build the Crusader on Blender's official Human Base Mesh (Sculpting).

The only visible anatomy in this file is the CC0 ``Body Male - Realistic``
sculpt and its eyes.  Armour shells are copied from that body's sculpt face
sets so the silhouette follows a real human rather than procedural capsules.

Preview (default)::

    blender --background artifacts/human-base-sculpt-rig/\
      human_base_sculpt_male_190cm_rigify.blend \
      --python scripts/render_human_base_sculpt_crusader.py

Full animation render (after art approval)::

    blender --background artifacts/human-base-sculpt-rig/\
      human_base_sculpt_male_190cm_rigify.blend \
      --python scripts/render_human_base_sculpt_crusader.py -- --full
"""

from __future__ import annotations

import argparse
import bmesh
import hashlib
import json
import math
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = ROOT / "artifacts" / "human-base-sculpt-rig" / "human_base_sculpt_male_190cm_rigify.blend"
ACTION_BLEND = ROOT / "artifacts" / "human-base-sculpt-actions" / "human_base_sculpt_actions.blend"
OUT = ROOT / "artifacts" / "human-base-sculpt-crusader"
FRAMES = OUT / "frames"
BODY_NAME = "HumanBaseSculpt.Body"
RIG_NAME = "HumanBaseSculpt.Rig"
EYE_NAMES = ("HumanBaseSculpt.Eye.L", "HumanBaseSculpt.Eye.R")
FPS = 24
SIZE = 720
ACTION_ORDER = ("IDLE", "WALK", "RUN", "ATTACK", "GUARD")
ACTION_LENGTHS = {"IDLE": 48, "WALK": 32, "RUN": 24, "ATTACK": 32, "GUARD": 40}


def args_from_blender() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="render all five action clips")
    parser.add_argument("--keyposes", action="store_true", help="render the five representative action poses")
    return parser.parse_args(arguments)


def material(name, color, *, metallic=0.0, roughness=0.55, emission=0.0):
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.08 if metallic else 0.02
        shader.inputs["Coat Roughness"].default_value = min(1.0, roughness + 0.08)
    if emission:
        key = "Emission Color" if "Emission Color" in shader.inputs else "Emission"
        shader.inputs[key].default_value = color
        shader.inputs["Emission Strength"].default_value = emission
    mat.diffuse_color = color
    return mat


def build_materials():
    # Visual allocation target: ivory 50%, sun-gold 32%, dark cloth/iron 15%, cyan 3%.
    return {
        "under": material("HB_Underarmor_Navy", (0.018, 0.028, 0.052, 1), roughness=0.82),
        "ivory": material("HB_Ivory_Plate", (0.73, 0.69, 0.57, 1), metallic=0.58, roughness=0.38),
        "ivory_light": material("HB_Ivory_Highlight", (0.90, 0.86, 0.73, 1), metallic=0.45, roughness=0.34),
        "gold": material("HB_Sun_Gold", (0.92, 0.48, 0.055, 1), metallic=0.70, roughness=0.32),
        "gold_dark": material("HB_Aged_Gold", (0.46, 0.20, 0.035, 1), metallic=0.68, roughness=0.42),
        "iron": material("HB_Dark_Iron", (0.028, 0.034, 0.044, 1), metallic=0.64, roughness=0.48),
        "slit": material("HB_Helmet_Slit", (0.003, 0.005, 0.008, 1), metallic=0.05, roughness=0.48),
        "leather": material("HB_Shield_Leather", (0.13, 0.060, 0.025, 1), metallic=0.0, roughness=0.88),
        "cyan": material("HB_Spirit_Cyan", (0.02, 0.75, 0.92, 1), metallic=0.12, roughness=0.26, emission=2.2),
        "blade": material("HB_Claymore_Steel", (0.62, 0.66, 0.66, 1), metallic=0.84, roughness=0.28),
    }


def smooth(obj):
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def bevel(obj, width=0.006, segments=3, name="Rolled forged edge"):
    modifier = obj.modifiers.new(name, "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    return modifier


def set_single_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.material_index = 0


def clean_source_scene():
    keep = {BODY_NAME, RIG_NAME, *EYE_NAMES}
    for obj in list(bpy.context.scene.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def reorder_body_modifiers(body, rig):
    armature = next((m for m in body.modifiers if m.type == "ARMATURE"), None)
    if armature is None:
        armature = body.modifiers.new("Armature", "ARMATURE")
        armature.object = rig
    armature.object = rig
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    try:
        bpy.ops.object.modifier_move_to_index(modifier=armature.name, index=0)
    finally:
        body.select_set(False)
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            modifier.levels = min(2, modifier.total_levels)
            modifier.sculpt_levels = min(2, modifier.total_levels)
            modifier.render_levels = min(2, modifier.total_levels)


def surface_shell(
    name,
    body,
    rig,
    mat,
    face_sets,
    *,
    z_min=None,
    z_max=None,
    x_min=None,
    x_max=None,
    offset=0.012,
    thickness=0.011,
    bevel_width=0.004,
):
    """Copy a weighted official-body region and finish it as a plate shell."""
    attribute = body.data.attributes.get(".sculpt_face_set")
    if attribute is None:
        raise RuntimeError("Official sculpt face-set attribute is missing")
    selected = set()
    for polygon in body.data.polygons:
        center = polygon.center
        if attribute.data[polygon.index].value not in set(face_sets):
            continue
        if z_min is not None and center.z < z_min:
            continue
        if z_max is not None and center.z > z_max:
            continue
        if x_min is not None and center.x < x_min:
            continue
        if x_max is not None and center.x > x_max:
            continue
        selected.add(polygon.index)
    if not selected:
        raise RuntimeError(f"No polygons selected for {name}")

    shell = body.copy()
    shell.data = body.data.copy()
    shell.name = name
    shell.data.name = name + "Mesh"
    bpy.context.collection.objects.link(shell)
    shell.animation_data_clear()
    while shell.modifiers:
        shell.modifiers.remove(shell.modifiers[0])

    bm = bmesh.new()
    bm.from_mesh(shell.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.index not in selected], context="FACES")
    bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")
    bm.to_mesh(shell.data)
    bm.free()
    shell.data.update()
    set_single_material(shell, mat)

    shell.parent = rig
    arm = shell.modifiers.new("Armature", "ARMATURE")
    arm.object = rig
    shrink = shell.modifiers.new("Fit to official sculpt", "SHRINKWRAP")
    shrink.target = body
    shrink.wrap_method = "NEAREST_SURFACEPOINT"
    shrink.wrap_mode = "OUTSIDE"
    shrink.offset = offset
    solid = shell.modifiers.new("Plate thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 1.0
    solid.use_rim = True
    edge = shell.modifiers.new("Rolled armor edge", "BEVEL")
    edge.width = bevel_width
    edge.segments = 3
    smooth(shell)
    return shell


def box(name, location, dimensions, mat, bevel_width=0.006):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_single_material(obj, mat)
    bevel(obj, bevel_width, 3)
    smooth(obj)
    return obj


def sphere(name, location, scale, mat, segments=40, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_single_material(obj, mat)
    smooth(obj)
    return obj


def cylinder_between(name, start, end, radius, mat, vertices=32):
    start = Vector(start)
    end = Vector(end)
    delta = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(start + end) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    set_single_material(obj, mat)
    bevel(obj, min(radius * 0.28, 0.008), 3)
    smooth(obj)
    return obj


def curve(name, points, depth, mat, *, cyclic=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = depth
    data.bevel_resolution = 4
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    return obj


def ellipse_points(z, radius_x, radius_y, center_y, *, count=56):
    return [
        (
            radius_x * math.cos(math.tau * index / count),
            center_y + radius_y * math.sin(math.tau * index / count),
            z,
        )
        for index in range(count)
    ]


def parent_keep_world(child, parent):
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def parent_to_bone_keep_world(child, rig, bone_name):
    if bone_name not in rig.data.bones:
        raise RuntimeError(f"Missing attachment bone {bone_name}")
    world = child.matrix_world.copy()
    child.parent = rig
    child.parent_type = "BONE"
    child.parent_bone = bone_name
    child.matrix_world = world


def assembly_pivot(name, location, rig, bone_name):
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = location
    parent_to_bone_keep_world(pivot, rig, bone_name)
    return pivot


def attach(parts, pivot):
    for obj in parts:
        parent_keep_world(obj, pivot)


def lathed_helm(name, mat):
    """Round great helm with straight walls and a shallow domed crown."""
    profile = (
        # Broad brow, almost vertical cheek, stepped crown: forged great helm.
        (1.565, 0.120, 0.127, -0.024),
        (1.595, 0.137, 0.145, -0.026),
        (1.680, 0.145, 0.153, -0.028),
        (1.785, 0.145, 0.151, -0.026),
        (1.858, 0.126, 0.137, -0.020),
        (1.915, 0.080, 0.092, -0.012),
        (1.940, 0.020, 0.024, -0.004),
    )
    segments = 64
    vertices = []
    for z, rx, ry, center_y in profile:
        for index in range(segments):
            angle = math.tau * index / segments
            x = math.cos(angle) * rx
            y = center_y + math.sin(angle) * ry
            # Subtle facial flattening supports a believable visor panel.
            if math.sin(angle) < -0.70:
                y = max(y, center_y - ry * 0.965)
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(profile) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((ring * segments + index, ring * segments + nxt, (ring + 1) * segments + nxt, (ring + 1) * segments + index))
    faces.append(tuple(range(segments))[::-1])
    top_center = len(vertices)
    vertices.append((0.0, -0.004, 1.946))
    last = (len(profile) - 1) * segments
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((last + index, last + nxt, top_center))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    solid = obj.modifiers.new("Forged helm thickness", "SOLIDIFY")
    solid.thickness = 0.008
    solid.offset = -1.0
    bevel(obj, 0.004, 3)
    smooth(obj)
    return obj


def build_helmet(mats, rig):
    parts = [lathed_helm("HB_Round_Great_Helm", mats["ivory_light"])]
    # Complete brow and jaw seams reveal the assembled plate panels in all views.
    parts.append(curve("HB_Helmet_Gold_Brow", ellipse_points(1.805, 0.1455, 0.1515, -0.026), 0.006, mats["gold"], cyclic=True))
    parts.append(curve("HB_Helmet_Jaw_Seam", ellipse_points(1.590, 0.136, 0.144, -0.026), 0.0045, mats["gold_dark"], cyclic=True))
    parts.extend([
        box("HB_Helmet_Cross_Gold_H", (0.0, -0.176, 1.766), (0.255, 0.023, 0.050), mats["gold"], 0.009),
        box("HB_Helmet_Cross_Gold_V", (0.0, -0.178, 1.690), (0.052, 0.024, 0.228), mats["gold"], 0.009),
        box("HB_Helmet_Cross_Slit_H", (0.0, -0.190, 1.766), (0.218, 0.013, 0.020), mats["slit"], 0.004),
        box("HB_Helmet_Cross_Slit_V", (0.0, -0.192, 1.690), (0.018, 0.013, 0.150), mats["slit"], 0.004),
        sphere("HB_Helmet_Forehead_Rune", (0.0, -0.191, 1.842), (0.018, 0.009, 0.023), mats["cyan"], 28, 14),
    ])
    # Crown and side seams.
    parts.append(curve("HB_Helmet_Crown_Ridge", [(0.0, -0.166, 1.820), (0.0, -0.125, 1.910), (0.0, -0.010, 1.958), (0.0, 0.105, 1.910), (0.0, 0.128, 1.820)], 0.007, mats["gold"]))
    parts.append(curve("HB_Helmet_Cheek_Seam_L", [(-0.110, -0.145, 1.775), (-0.126, -0.138, 1.700), (-0.118, -0.130, 1.620)], 0.004, mats["gold_dark"]))
    parts.append(curve("HB_Helmet_Cheek_Seam_R", [(0.110, -0.145, 1.775), (0.126, -0.138, 1.700), (0.118, -0.130, 1.620)], 0.004, mats["gold_dark"]))
    parts.append(sphere("HB_Helmet_Side_Pivot_L", (-0.144, -0.010, 1.710), (0.012, 0.014, 0.012), mats["gold"], 28, 14))
    parts.append(sphere("HB_Helmet_Side_Pivot_R", (0.144, -0.010, 1.710), (0.012, 0.014, 0.012), mats["gold"], 28, 14))
    # Small functional rivets along the brow; spheres are decoration, never joints.
    for idx, x in enumerate((-0.112, -0.082, -0.052, 0.052, 0.082, 0.112)):
        parts.append(sphere(f"HB_Helmet_Rivet_{idx+1}", (x, -0.177, 1.814), (0.008, 0.006, 0.008), mats["gold_dark"], 24, 12))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.136, minor_radius=0.009, major_segments=64, minor_segments=10, location=(0.0, -0.025, 1.565))
    ring = bpy.context.object
    ring.name = "HB_Helmet_Neck_Ring"
    ring.scale.y = 1.05
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    set_single_material(ring, mats["gold"])
    smooth(ring)
    parts.append(ring)
    pivot = assembly_pivot("HB_Helmet_Pivot", (0.0, -0.02, 1.73), rig, "DEF-spine.006")
    attach(parts, pivot)
    return [pivot, *parts]


def shield_mesh(name, center, mat, *, scale=1.0, y_shift=0.0, thickness=0.045):
    cx, cy, cz = center
    # 1.40 m tall, 0.72 m wide rounded heater outline.
    rows = ((0.70, 0.25), (0.62, 0.34), (0.34, 0.36), (-0.08, 0.34), (-0.43, 0.25), (-0.66, 0.08), (-0.70, 0.0))
    columns = (-1.0, -0.5, 0.0, 0.5, 1.0)
    vertices = []
    for z_off, half_width in rows:
        for column in columns:
            x = cx + half_width * column * scale
            # Edges fall back; the center boss projects forward toward -Y.
            y = cy + y_shift + 0.105 * abs(column) ** 1.65
            z = cz + z_off * scale
            vertices.append((x, y, z))
    faces = []
    width = len(columns)
    for row in range(len(rows) - 1):
        for column in range(width - 1):
            a = row * width + column
            b = a + 1
            c = (row + 1) * width + column + 1
            d = c - 1
            faces.append((a, d, c, b))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    smooth(obj)
    solid = obj.modifiers.new("Shield thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    bevel(obj, 0.014 if scale > 0.95 else 0.009, 4)
    return obj


def build_shield(mats, rig):
    center = (0.635, -0.30, 1.01)
    # Leather-backed core and slightly smaller ivory face form a real layered shield.
    back = shield_mesh("HB_GreatShield_LeatherBack", center, mats["leather"], scale=1.0, y_shift=0.055, thickness=0.050)
    rim = shield_mesh("HB_GreatShield_GoldRim", center, mats["gold"], scale=1.0, y_shift=-0.006, thickness=0.035)
    face = shield_mesh("HB_GreatShield_IvoryFace", center, mats["ivory_light"], scale=0.925, y_shift=-0.034, thickness=0.025)
    parts = [back, rim, face]
    parts.extend([
        box("HB_Shield_Cross_V", (0.635, -0.425, 1.035), (0.067, 0.026, 0.78), mats["gold"], 0.016),
        box("HB_Shield_Cross_H", (0.635, -0.432, 1.195), (0.46, 0.028, 0.073), mats["gold"], 0.017),
        sphere("HB_Shield_Spirit_Rune", (0.635, -0.462, 1.195), (0.035, 0.015, 0.035), mats["cyan"], 32, 16),
        cylinder_between("HB_Shield_Forearm_Brace", (0.36, -0.120, 1.10), (0.77, -0.120, 1.10), 0.021, mats["gold_dark"], 24),
        cylinder_between("HB_Shield_Hand_Grip", (0.48, -0.105, 0.88), (0.48, -0.105, 1.11), 0.019, mats["leather"], 24),
    ])
    # Fasteners read in the back three-quarter view.
    for idx, (x, z) in enumerate(((0.40, 1.10), (0.74, 1.10), (0.48, 0.89), (0.48, 1.10))):
        parts.append(sphere(f"HB_Shield_Back_Rivet_{idx+1}", (x, -0.105, z), (0.010, 0.006, 0.010), mats["gold"], 20, 10))
    pivot = assembly_pivot("HB_GreatShield_Pivot", (0.43, -0.07, 1.00), rig, "DEF-hand.L")
    attach(parts, pivot)
    return [pivot, *parts]


def tapered_blade(name, start, end, width, thickness, mat):
    start = Vector(start)
    end = Vector(end)
    axis = (end - start).normalized()
    normal = Vector((0.0, 1.0, 0.0))
    side = normal.cross(axis).normalized()
    shoulder = start.lerp(end, 0.08)
    half = width * 0.5
    points = (start - side * half * 0.72, start + side * half * 0.72, shoulder + side * half, end, shoulder - side * half)
    vertices = []
    for y_offset in (-thickness * 0.5, thickness * 0.5):
        vertices.extend((point.x, point.y + y_offset, point.z) for point in points)
    count = len(points)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for idx in range(count):
        nxt = (idx + 1) % count
        faces.append((idx, nxt, count + nxt, count + idx))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    bevel(obj, 0.0045, 3)
    return smooth(obj)


def build_claymore(mats, rig):
    hand = Vector((-0.425, -0.075, 1.00))
    axis = Vector((-0.665, -0.035, -0.746)).normalized()
    grip_start = hand - axis * 0.24
    grip_end = hand + axis * 0.08
    blade_start = grip_end + axis * 0.015
    blade_end = blade_start + axis * 1.15
    perpendicular = Vector((axis.z, 0.0, -axis.x)).normalized()
    guard_center = blade_start - axis * 0.025
    parts = [
        cylinder_between("HB_Claymore_Grip", grip_start, grip_end, 0.024, mats["leather"], 28),
        cylinder_between("HB_Claymore_Crossguard", guard_center - perpendicular * 0.19, guard_center + perpendicular * 0.19, 0.021, mats["gold"], 28),
        cylinder_between("HB_Claymore_Pommel", grip_start - axis * 0.055, grip_start + axis * 0.012, 0.035, mats["gold_dark"], 28),
        tapered_blade("HB_Thin_Claymore_Blade", blade_start, blade_end, 0.095, 0.021, mats["blade"]),
        cylinder_between("HB_Claymore_Cyan_Fuller", blade_start + axis * 0.12 - Vector((0.0, 0.013, 0.0)), blade_start + axis * 0.49 - Vector((0.0, 0.013, 0.0)), 0.0045, mats["cyan"], 14),
    ]
    pivot = assembly_pivot("HB_ThinClaymore_Pivot", hand, rig, "DEF-hand.R")
    attach(parts, pivot)
    return [pivot, *parts]


def elliptical_band(name, z_top, z_bottom, rx_top, rx_bottom, ry_top, ry_bottom, mat, *, thickness=0.008):
    """A forged elliptical lame that wraps the waist without a shorts silhouette."""
    segments = 64
    vertices = []
    for z, rx, ry in ((z_top, rx_top, ry_top), (z_bottom, rx_bottom, ry_bottom)):
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append((math.cos(angle) * rx, math.sin(angle) * ry - 0.010, z))
    faces = []
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((index, nxt, segments + nxt, segments + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    solid = obj.modifiers.new("Lame thickness", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    bevel(obj, 0.004, 3)
    return smooth(obj)


def tasset_lame(name, center_x, z_top, z_bottom, width_top, width_bottom, mat):
    """A gently bowed trapezoid plate; three overlap on each thigh."""
    columns = (-1.0, -0.5, 0.0, 0.5, 1.0)
    vertices = []
    for z, width in ((z_top, width_top), (z_bottom, width_bottom)):
        for column in columns:
            x = center_x + column * width * 0.5
            y = -0.158 + 0.026 * abs(column) ** 1.6
            point_drop = (1.0 - abs(column)) * 0.012 if z == z_bottom else 0.0
            vertices.append((x, y, z - point_drop))
    faces = []
    for index in range(len(columns) - 1):
        faces.append((index, index + 1, len(columns) + index + 1, len(columns) + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    solid = obj.modifiers.new("Tasset plate thickness", "SOLIDIFY")
    solid.thickness = 0.010
    solid.offset = 0.0
    bevel(obj, 0.006, 3)
    return smooth(obj)


def pointed_poleyn(name, center_x, mat):
    """Thin pointed knee plate with integral side wings."""
    z = 0.535
    y = -0.115
    outline = (
        (center_x - 0.055, y + 0.010, z + 0.072),
        (center_x, y - 0.018, z + 0.095),
        (center_x + 0.055, y + 0.010, z + 0.072),
        (center_x + 0.108, y + 0.020, z + 0.008),
        (center_x + 0.050, y - 0.004, z - 0.032),
        (center_x, y - 0.024, z - 0.095),
        (center_x - 0.050, y - 0.004, z - 0.032),
        (center_x - 0.108, y + 0.020, z + 0.008),
    )
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(outline, [], [tuple(range(len(outline)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    solid = obj.modifiers.new("Poleyn thickness", "SOLIDIFY")
    solid.thickness = 0.018
    solid.offset = 0.0
    bevel(obj, 0.009, 4)
    return smooth(obj)


def convex_side_plate(name, center, width, height, depth, mat, *, gold_wing=False):
    """Flattened seven-sided elbow cop; its crown faces outward on X."""
    outline = ((-0.32, 0.50), (0.32, 0.50), (0.50, 0.14), (0.44, -0.34), (0.0, -0.50), (-0.44, -0.34), (-0.50, 0.14))
    direction = 1.0 if center[0] > 0 else -1.0
    vertices = []
    for normal_offset in (-depth * 0.5, depth * 0.5):
        for u, v in outline:
            u *= width
            v *= height
            crown = (1.0 - min(1.0, abs(u / max(width, 1e-6)))) * depth * (0.08 if gold_wing else 0.16)
            vertices.append((center[0] + direction * (normal_offset + crown), center[1] + u, center[2] + v))
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    bevel(obj, min(width, height) * 0.055, 4)
    return smooth(obj)


def sabaton_toe(name, center_x, mat):
    """Pointed full toe cap extending over the official foot shell."""
    # Width, depth and crown are formed explicitly, avoiding a toy sphere cap.
    rings = (
        (0.065, 0.070, 0.070),
        (-0.020, 0.076, 0.102),
        (-0.115, 0.052, 0.067),
        (-0.185, 0.012, 0.030),
    )
    vertices = []
    for y, half_width, top_z in rings:
        vertices.extend([
            (center_x - half_width, y, 0.012),
            (center_x - half_width * 0.72, y - 0.004, top_z),
            (center_x + half_width * 0.72, y - 0.004, top_z),
            (center_x + half_width, y, 0.012),
        ])
    faces = []
    for ring in range(len(rings) - 1):
        base = ring * 4
        nxt = (ring + 1) * 4
        for index in range(3):
            faces.append((base + index, base + index + 1, nxt + index + 1, nxt + index))
        faces.append((base + 3, base, nxt, nxt + 3))
    faces.append((0, 1, 2, 3))
    faces.append(tuple(range((len(rings) - 1) * 4, len(rings) * 4)))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    set_single_material(obj, mat)
    bevel(obj, 0.006, 3)
    return smooth(obj)


def build_waist_and_joint_plates(mats, rig):
    parts = []
    # Dark mail/cloth hangs between the body and articulated plate lames.
    skirt = elliptical_band("HB_Dark_Mail_Skirt", 1.015, 0.735, 0.185, 0.235, 0.130, 0.165, mats["iron"], thickness=0.006)
    parts.append(skirt)
    # Four overlapping fauld bands; each is a separate plate with a visible edge.
    bands = (
        ("HB_Fauld_Lame_1", 1.075, 0.995, 0.194, 0.202, 0.136, 0.142, mats["gold"]),
        ("HB_Fauld_Lame_2", 1.018, 0.930, 0.202, 0.213, 0.143, 0.150, mats["ivory"]),
        ("HB_Fauld_Lame_3", 0.955, 0.865, 0.213, 0.224, 0.151, 0.158, mats["gold"]),
        ("HB_Fauld_Lame_4", 0.892, 0.800, 0.224, 0.236, 0.159, 0.168, mats["ivory"]),
    )
    for values in bands:
        parts.append(elliptical_band(*values[:-1], values[-1], thickness=0.009))
    waist_pivot = assembly_pivot("HB_Fauld_Pivot", (0.0, 0.0, 0.98), rig, "DEF-spine.001")
    attach(parts, waist_pivot)

    result = [waist_pivot, *parts]
    # Three independent tasset lames on each side; the dark skirt remains visible
    # through the center gap, so the armour never reads as gold underwear.
    for side, sign in (("L", 1.0), ("R", -1.0)):
        tassets = []
        for index, (zt, zb, wt, wb, mat) in enumerate((
            (0.900, 0.815, 0.190, 0.180, mats["gold"]),
            (0.835, 0.742, 0.182, 0.168, mats["ivory"]),
            (0.765, 0.660, 0.170, 0.142, mats["gold"]),
        ), 1):
            tassets.append(tasset_lame(f"HB_Tasset_{side}_Lame_{index}", sign * 0.115, zt, zb, wt, wb, mat))
        pivot = assembly_pivot(f"HB_Tasset_Pivot_{side}", (sign * 0.115, 0.0, 0.87), rig, f"DEF-thigh.{side}")
        attach(tassets, pivot)
        result.extend([pivot, *tassets])

    for side, sign in (("L", 1.0), ("R", -1.0)):
        poleyn = pointed_poleyn(f"HB_Poleyn_{side}", sign * 0.157, mats["gold"])
        poleyn_pivot = assembly_pivot(f"HB_Poleyn_Pivot_{side}", (sign * 0.157, 0.0, 0.535), rig, f"DEF-shin.{side}")
        attach([poleyn], poleyn_pivot)
        toe = sabaton_toe(f"HB_Sabaton_Toe_{side}", sign * 0.235, mats["ivory_light"])
        toe_pivot = assembly_pivot(f"HB_Sabaton_Toe_Pivot_{side}", (sign * 0.235, 0.0, 0.06), rig, f"DEF-foot.{side}")
        attach([toe], toe_pivot)
        result.extend([poleyn_pivot, poleyn, toe_pivot, toe])
    return result


def build_upper_joint_details(mats, rig):
    result = []
    # A fitted gorget closes the neckline and overlaps the cuirass/helmet.
    gorget = elliptical_band("HB_Gorget", 1.585, 1.535, 0.135, 0.145, 0.117, 0.130, mats["ivory_light"], thickness=0.010)
    gorget_roll = curve("HB_Gorget_Gold_Roll", ellipse_points(1.555, 0.142, 0.128, -0.015, count=48), 0.0055, mats["gold"], cyclic=True)
    gorget_pivot = assembly_pivot("HB_Gorget_Pivot", (0.0, 0.0, 1.555), rig, "DEF-spine.004")
    attach([gorget, gorget_roll], gorget_pivot)
    result.extend([gorget_pivot, gorget, gorget_roll])

    for side, sign in (("L", 1.0), ("R", -1.0)):
        cop = convex_side_plate(f"HB_Elbow_Cop_{side}", (sign * 0.346, -0.015, 1.232), 0.115, 0.165, 0.052, mats["ivory_light"])
        wing = convex_side_plate(f"HB_Elbow_Cop_Wing_{side}", (sign * 0.374, -0.010, 1.236), 0.072, 0.115, 0.031, mats["gold"], gold_wing=True)
        cuff = box(f"HB_Vambrace_Cuff_{side}", (sign * 0.407, -0.060, 1.010), (0.075, 0.085, 0.025), mats["gold"], 0.007)
        ridge = curve(f"HB_Pauldron_Gold_Ridge_{side}", [(sign * 0.201, -0.095, 1.505), (sign * 0.258, -0.055, 1.485), (sign * 0.297, -0.015, 1.430)], 0.006, mats["gold"])
        elbow_pivot = assembly_pivot(f"HB_Elbow_Detail_Pivot_{side}", (sign * 0.35, 0.0, 1.23), rig, f"DEF-forearm.{side}")
        attach([cop, wing, cuff], elbow_pivot)
        shoulder_pivot = assembly_pivot(f"HB_Pauldron_Ridge_Pivot_{side}", (sign * 0.25, 0.0, 1.46), rig, f"DEF-upper_arm.{side}")
        attach([ridge], shoulder_pivot)
        result.extend([elbow_pivot, cop, wing, cuff, shoulder_pivot, ridge])
    return result


def add_armor_details(mats, rig):
    parts = []
    # Cuirass reinforcement and restrained sun motif; these decorate the shell,
    # never replace the official-body-derived plate silhouette.
    parts.extend([
        curve("HB_Cuirass_Gold_Neckline", [(-0.15, -0.167, 1.515), (0.0, -0.200, 1.535), (0.15, -0.167, 1.515)], 0.010, mats["gold"]),
        curve("HB_Cuirass_Clavicle_Seam_L", [(-0.175, -0.145, 1.485), (-0.105, -0.185, 1.455), (-0.025, -0.194, 1.445)], 0.005, mats["gold_dark"]),
        curve("HB_Cuirass_Clavicle_Seam_R", [(0.175, -0.145, 1.485), (0.105, -0.185, 1.455), (0.025, -0.194, 1.445)], 0.005, mats["gold_dark"]),
        curve("HB_Cuirass_Left_Armhole", [(-0.185, -0.115, 1.495), (-0.210, -0.118, 1.365), (-0.190, -0.120, 1.225)], 0.006, mats["gold_dark"]),
        curve("HB_Cuirass_Right_Armhole", [(0.185, -0.115, 1.495), (0.210, -0.118, 1.365), (0.190, -0.120, 1.225)], 0.006, mats["gold_dark"]),
        curve("HB_Cuirass_Lower_Edge", [(-0.17, -0.130, 1.085), (0.0, -0.165, 1.065), (0.17, -0.130, 1.085)], 0.008, mats["gold"]),
        box("HB_Cuirass_Cross_V", (0.0, -0.196, 1.315), (0.045, 0.022, 0.295), mats["gold"], 0.009),
        box("HB_Cuirass_Cross_H", (0.0, -0.200, 1.390), (0.25, 0.024, 0.047), mats["gold"], 0.009),
        sphere("HB_Cuirass_Spirit_Rune", (0.0, -0.220, 1.390), (0.025, 0.010, 0.025), mats["cyan"], 28, 14),
        # Backplate reinforcements make the taper and plate boundaries visible.
        curve("HB_Backplate_Spine_Seam", [(0.0, 0.132, 1.520), (0.0, 0.145, 1.340), (0.0, 0.130, 1.105)], 0.006, mats["gold_dark"]),
        curve("HB_Backplate_Lower_Edge", [(-0.17, 0.105, 1.090), (0.0, 0.130, 1.065), (0.17, 0.105, 1.090)], 0.008, mats["gold"]),
        curve("HB_Backplate_Shoulder_Seam", [(-0.18, 0.070, 1.480), (0.0, 0.125, 1.505), (0.18, 0.070, 1.480)], 0.006, mats["gold_dark"]),
    ])
    for sign in (-1.0, 1.0):
        parts.append(curve(
            f"HB_Cuirass_Pectoral_Sweep_{sign:+.0f}",
            [(sign * 0.012, -0.202, 1.435), (sign * 0.070, -0.207, 1.455), (sign * 0.135, -0.196, 1.438), (sign * 0.186, -0.174, 1.395)],
            0.005, mats["gold"],
        ))
        parts.append(curve(
            f"HB_Cuirass_Abdominal_Sweep_{sign:+.0f}",
            [(sign * 0.020, -0.202, 1.255), (sign * 0.080, -0.202, 1.238), (sign * 0.145, -0.189, 1.250)],
            0.0045, mats["gold_dark"],
        ))
        for index, z in enumerate((1.438, 1.375, 1.310, 1.245), 1):
            parts.append(sphere(f"HB_Cuirass_Rivet_{sign:+.0f}_{index}", (sign * 0.165, -0.196, z), (0.008, 0.006, 0.008), mats["gold"], 24, 12))
    # Chest/back details flex with the upper chest rather than floating.
    chest_pivot = assembly_pivot("HB_Cuirass_Detail_Pivot", (0.0, 0.0, 1.36), rig, "DEF-spine.004")
    attach([part for part in parts if part.parent is None], chest_pivot)
    parts.append(chest_pivot)
    return parts


RIG_CONTROLS = (
    "root", "torso", "spine_fk.001", "spine_fk.002", "spine_fk.003", "neck", "head",
    "shoulder.L", "shoulder.R", "upper_arm_fk.L", "forearm_fk.L", "hand_fk.L",
    "upper_arm_fk.R", "forearm_fk.R", "hand_fk.R", "thigh_fk.L", "shin_fk.L",
    "foot_fk.L", "thigh_fk.R", "shin_fk.R", "foot_fk.R",
)


def reset_pose(rig):
    for name in RIG_CONTROLS:
        bone = rig.pose.bones.get(name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    for name in ("upper_arm_parent.L", "upper_arm_parent.R", "thigh_parent.L", "thigh_parent.R"):
        bone = rig.pose.bones.get(name)
        if bone and "IK_FK" in bone:
            bone["IK_FK"] = 0.0


def insert_pose(rig, frame, *, rotations=None, locations=None):
    reset_pose(rig)
    for name, value in (rotations or {}).items():
        bone = rig.pose.bones.get(name)
        if bone:
            bone.rotation_euler = value
    for name, value in (locations or {}).items():
        bone = rig.pose.bones.get(name)
        if bone:
            bone.location = value
    for name in RIG_CONTROLS:
        bone = rig.pose.bones.get(name)
        if bone:
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
            bone.keyframe_insert(data_path="location", frame=frame, group=name)


def build_actions(rig):
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    rig.animation_data_create()
    actions = {}

    def begin(name, length):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        actions[name] = (action, length)

    begin("IDLE", 48)
    for frame, z, sway in ((1, 0.0, -0.010), (13, 0.010, 0.012), (25, 0.0, -0.010), (37, -0.005, 0.008), (49, 0.0, -0.010)):
        insert_pose(rig, frame, rotations={"spine_fk.003": (0.008, sway, 0.0), "head": (-0.006, -sway * 0.4, 0.0)}, locations={"root": (0.0, 0.0, z)})

    begin("WALK", 32)
    for frame, z, ll, lr, al, ar in ((1, 0.0, 0.40, -0.40, -0.18, 0.18), (9, 0.026, 0.03, -0.06, -0.02, 0.03), (17, 0.0, -0.40, 0.40, 0.18, -0.18), (25, 0.026, -0.06, 0.03, 0.03, -0.02), (33, 0.0, 0.40, -0.40, -0.18, 0.18)):
        insert_pose(rig, frame, rotations={"spine_fk.003": (0.03, 0.0, 0.0), "thigh_fk.L": (ll, 0.0, 0.0), "thigh_fk.R": (lr, 0.0, 0.0), "shin_fk.L": (max(0.0, -ll) * 0.72, 0.0, 0.0), "shin_fk.R": (max(0.0, -lr) * 0.72, 0.0, 0.0), "upper_arm_fk.L": (al * 0.22, 0.0, 0.0), "upper_arm_fk.R": (ar * 0.78, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    begin("RUN", 24)
    for frame, z, ll, lr, al, ar in ((1, 0.018, 0.67, -0.63, -0.27, 0.43), (7, 0.070, 0.08, -0.10, -0.05, 0.07), (13, 0.018, -0.63, 0.67, 0.27, -0.43), (19, 0.070, -0.10, 0.08, 0.05, -0.07), (25, 0.018, 0.67, -0.63, -0.27, 0.43)):
        insert_pose(rig, frame, rotations={"spine_fk.003": (0.13, 0.0, 0.0), "thigh_fk.L": (ll, 0.0, 0.0), "thigh_fk.R": (lr, 0.0, 0.0), "shin_fk.L": (max(0.0, -ll) * 1.0, 0.0, 0.0), "shin_fk.R": (max(0.0, -lr) * 1.0, 0.0, 0.0), "upper_arm_fk.L": (al * 0.20, 0.0, 0.0), "upper_arm_fk.R": (ar, 0.0, 0.0), "forearm_fk.R": (-0.18, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    begin("ATTACK", 32)
    for frame, z, arm_x, arm_y, chest_y in ((1, 0.0, 0.0, 0.0, 0.0), (6, -0.018, 0.48, -0.22, -0.16), (12, 0.008, 1.34, -0.49, -0.28), (17, 0.032, -0.98, 0.24, 0.31), (22, 0.008, -0.56, 0.09, 0.17), (28, 0.0, -0.10, 0.0, 0.03), (33, 0.0, 0.0, 0.0, 0.0)):
        insert_pose(rig, frame, rotations={"spine_fk.003": (0.035, chest_y, 0.0), "upper_arm_fk.R": (arm_x, arm_y, -0.07), "forearm_fk.R": (-0.30 if frame <= 12 else 0.10, 0.0, 0.0), "upper_arm_fk.L": (-0.05, 0.0, 0.035), "thigh_fk.L": (-0.08 if 12 <= frame <= 22 else 0.0, 0.0, 0.0), "thigh_fk.R": (0.08 if 12 <= frame <= 22 else 0.0, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    begin("GUARD", 40)
    for frame, z, arm_x, arm_y, chest_x in ((1, 0.0, 0.0, 0.0, 0.0), (8, -0.018, -0.38, -0.16, -0.05), (13, -0.040, -0.72, -0.31, -0.12), (25, -0.038, -0.72, -0.31, -0.12), (33, -0.018, -0.35, -0.14, -0.04), (41, 0.0, 0.0, 0.0, 0.0)):
        active = frame not in (1, 41)
        insert_pose(rig, frame, rotations={"spine_fk.003": (chest_x, 0.0, 0.0), "upper_arm_fk.L": (arm_x, arm_y, -0.10), "forearm_fk.L": (-0.22, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "upper_arm_fk.R": (0.13, 0.0, 0.0), "thigh_fk.L": (0.06, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "thigh_fk.R": (0.06, 0.0, 0.0) if active else (0.0, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    for action, _ in actions.values():
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for fcurve in bag.fcurves:
                        for key in fcurve.keyframe_points:
                            key.interpolation = "BEZIER"
    rig.animation_data.action = actions["IDLE"][0]
    return actions


def load_verified_action_library(rig):
    """Append the separately QA'd five-action Rigify library."""
    if not ACTION_BLEND.exists():
        return build_actions(rig)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    with bpy.data.libraries.load(str(ACTION_BLEND), link=False) as (data_from, data_to):
        data_to.actions = [name for name in ACTION_ORDER if name in data_from.actions]
    actions = {}
    for name in ACTION_ORDER:
        action = bpy.data.actions.get(name)
        if action is None:
            raise RuntimeError(f"Verified action library is missing {name}")
        actions[name] = (action, int(round(action.frame_range[1])))
    assign_action(rig, actions["IDLE"][0])
    return actions


def assign_action(rig, action):
    rig.animation_data_create()
    rig.animation_data.action = action
    if action.slots:
        try:
            rig.animation_data.action_slot = action.slots[0]
        except (AttributeError, RuntimeError, TypeError):
            pass


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_stage(mats):
    floor_mat = material("HB_Neutral_Studio_Floor", (0.47, 0.49, 0.52, 1), roughness=0.94)
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0.0, 0.0, -0.012))
    floor = bpy.context.object
    floor.name = "HB_Neutral_Studio_Floor"
    set_single_material(floor, floor_mat)

    camera_data = bpy.data.cameras.new("HB_Preview_Camera")
    camera = bpy.data.objects.new("HB_Preview_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 62
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        point_at(obj, (0.0, 0.0, 1.05))

    area("HB_Key_Light", (-3.4, -4.8, 5.2), 1050, (1.0, 0.88, 0.72), 4.0)
    area("HB_Fill_Light", (3.8, -3.0, 3.4), 820, (0.65, 0.78, 1.0), 3.2)
    area("HB_Rim_Light", (0.0, 3.3, 4.6), 1180, (1.0, 0.64, 0.26), 3.2)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 28
    scene.render.fps = FPS
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.world.color = (0.075, 0.09, 0.12)
    scene.view_settings.look = "AgX - Medium High Contrast"
    return camera


def build_scene():
    OUT.mkdir(parents=True, exist_ok=True)
    if BODY_NAME not in bpy.data.objects or RIG_NAME not in bpy.data.objects:
        raise RuntimeError(f"Open the rigged official source first: {SOURCE_BLEND}")
    clean_source_scene()
    body = bpy.data.objects[BODY_NAME]
    rig = bpy.data.objects[RIG_NAME]
    mats = build_materials()
    body.name = "HB_Sculpt_Male_190cm"
    rig.name = "HB_Sculpt_Rigify"
    # Object references remain valid after renaming.
    set_single_material(body, mats["under"])
    smooth(body)
    reorder_body_modifiers(body, rig)
    for eye_name in EYE_NAMES:
        eye = bpy.data.objects.get(eye_name)
        if eye:
            set_single_material(eye, mats["cyan"])

    # All principal wearable plates are copied from official sculpt face sets.
    surface_shell("HB_Cuirass_SurfaceShell", body, rig, mats["ivory"], {1, 19}, z_min=1.105, z_max=1.555, offset=0.008, thickness=0.014, bevel_width=0.004)
    surface_shell("HB_Cuirass_Abdominal_SurfaceShell", body, rig, mats["ivory_light"], {19}, z_min=1.045, z_max=1.225, offset=0.014, thickness=0.011, bevel_width=0.003)
    # A narrow fitted waist flange remains body-derived.  The articulated fauld
    # and tassets below it are separate overlapping plates, never a pelvis shell.
    surface_shell("HB_Waist_Flange_SurfaceShell", body, rig, mats["gold"], {18}, z_min=1.015, z_max=1.09, offset=0.012, thickness=0.010, bevel_width=0.004)
    for side, face_set in (("L", 21), ("R", 20)):
        # Three overlapping face-set shells follow the sloping human shoulder.
        for index, (z_min, z_max, offset, mat) in enumerate((
            (1.405, 1.545, 0.021, mats["ivory_light"]),
            (1.335, 1.425, 0.017, mats["gold"]),
            (1.270, 1.355, 0.013, mats["ivory_light"]),
        ), 1):
            surface_shell(f"HB_Pauldron_{side}_Lame_{index}", body, rig, mat, {face_set}, z_min=z_min, z_max=z_max, offset=offset, thickness=0.012, bevel_width=0.004)
    for side, face_set in (("L", 12), ("R", 11)):
        surface_shell(f"HB_Vambrace_{side}", body, rig, mats["ivory"], {face_set}, z_min=0.99, z_max=1.215, offset=0.008, thickness=0.010, bevel_width=0.003)
    for side, face_set in (("L", 15), ("R", 16)):
        surface_shell(f"HB_Greave_{side}", body, rig, mats["ivory"], {face_set}, z_min=0.08, z_max=0.56, offset=0.013, thickness=0.010, bevel_width=0.004)
    for side, face_set in (("L", 14), ("R", 13)):
        surface_shell(f"HB_Sabatons_{side}", body, rig, mats["ivory_light"], {face_set}, z_max=0.15, offset=0.016, thickness=0.011, bevel_width=0.004)

    build_waist_and_joint_plates(mats, rig)
    build_upper_joint_details(mats, rig)
    build_helmet(mats, rig)
    build_shield(mats, rig)
    build_claymore(mats, rig)
    add_armor_details(mats, rig)
    actions = load_verified_action_library(rig)
    camera = build_stage(mats)
    return body, rig, actions, camera


def render_still(path, camera, location, target=(0.0, 0.0, 1.03)):
    camera.location = location
    point_at(camera, target)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def make_preview_sheet(paths, output):
    ffmpeg = ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffmpeg.exe"
    if not ffmpeg.exists():
        return
    command = [str(ffmpeg), "-y"]
    for path in paths:
        command += ["-i", str(path)]
    command += ["-filter_complex", "[0:v][1:v][2:v]hstack=inputs=3", "-frames:v", "1", str(output)]
    subprocess.run(command, check=True, capture_output=True)


def render_previews(rig, actions, camera):
    assign_action(rig, actions["IDLE"][0])
    bpy.context.scene.frame_set(13)
    front = OUT / "human_base_sculpt_crusader_front.png"
    front_3q = OUT / "human_base_sculpt_crusader_front_3q.png"
    back_3q = OUT / "human_base_sculpt_crusader_back_3q.png"
    render_still(front, camera, (0.0, -5.35, 1.16))
    render_still(front_3q, camera, (3.25, -5.45, 1.26))
    render_still(back_3q, camera, (-3.25, 5.45, 1.26))
    make_preview_sheet([front, front_3q, back_3q], OUT / "human_base_sculpt_crusader_preview_sheet.png")
    return [front, front_3q, back_3q]


def render_keypose_sheet(rig, actions, camera):
    keypose_dir = OUT / "keyposes"
    keypose_dir.mkdir(parents=True, exist_ok=True)
    camera.location = (3.65, -6.25, 1.28)
    camera.data.lens = 58
    point_at(camera, (0.0, 0.0, 1.04))
    representative = {"IDLE": 13, "WALK": 9, "RUN": 7, "ATTACK": 17, "GUARD": 25}
    paths = []
    for name in ACTION_ORDER:
        assign_action(rig, actions[name][0])
        bpy.context.scene.frame_set(representative[name])
        path = keypose_dir / f"{name.lower()}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)

    ffmpeg = ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffmpeg.exe"
    output = OUT / "human_base_sculpt_crusader_keyposes.png"
    command = [str(ffmpeg), "-y"]
    for path in paths:
        command += ["-i", str(path)]
    labels = []
    for index, name in enumerate(ACTION_ORDER):
        labels.append(
            f"[{index}:v]scale=480:480,drawtext=fontfile='C\\:/Windows/Fonts/arialbd.ttf':"
            f"text='{name}':x=22:y=22:fontsize=34:fontcolor=white:box=1:boxcolor=black@0.62:boxborderw=10[v{index}]"
        )
    stack = "[v0][v1][v2][v3][v4]xstack=inputs=5:layout=0_0|480_0|960_0|240_480|720_480:fill=0x10151c[out]"
    command += ["-filter_complex", ";".join([*labels, stack]), "-map", "[out]", "-frames:v", "1", str(output)]
    subprocess.run(command, check=True, capture_output=True)
    return paths, output


def render_action_frames(rig, actions, camera):
    scene = bpy.context.scene
    camera.location = (3.65, -6.25, 1.28)
    camera.data.lens = 58
    point_at(camera, (0.0, 0.0, 1.04))
    for action_name in ACTION_ORDER:
        action, length = actions[action_name]
        destination = FRAMES / action_name.lower()
        destination.mkdir(parents=True, exist_ok=True)
        assign_action(rig, action)
        scene.frame_start = 1
        scene.frame_end = length
        scene.render.filepath = str(destination / "frame_")
        bpy.ops.render.render(animation=True)


def encode_action_videos():
    ffmpeg = ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffmpeg.exe"
    clips = []
    for name in ACTION_ORDER:
        source = FRAMES / name.lower() / "frame_%04d.png"
        output = OUT / f"crusader_{name.lower()}.mp4"
        subprocess.run([str(ffmpeg), "-y", "-framerate", str(FPS), "-i", str(source), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", str(output)], check=True)
        clips.append(output)
    list_file = OUT / "clips.txt"
    list_file.write_text("\n".join(f"file '{clip.as_posix()}'" for clip in clips), encoding="utf-8")
    combined = OUT / "human_base_sculpt_crusader_motion_preview.mp4"
    subprocess.run([str(ffmpeg), "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(combined)], check=True)
    return clips, combined


def decode_validate_videos(clips, combined):
    ffmpeg = ROOT / "tools" / "runtime" / "ffmpeg-9.0.1-essentials_build" / "bin" / "ffmpeg.exe"
    results = {}
    for path in [*clips, combined]:
        completed = subprocess.run(
            [str(ffmpeg), "-v", "error", "-i", str(path), "-f", "null", "NUL"],
            capture_output=True,
            text=True,
        )
        results[path.name] = {"decoded": completed.returncode == 0, "stderr": completed.stderr.strip()}
        if completed.returncode != 0:
            raise RuntimeError(f"ffmpeg decode failed for {path}: {completed.stderr}")
    return results


def write_manifest(body, rig, actions, preview_paths, *, full):
    armature = next(m for m in body.modifiers if m.type == "ARMATURE")
    shell_names = [
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH" and any(modifier.type == "SHRINKWRAP" for modifier in obj.modifiers)
    ]
    shell_modifiers = {name: [m.type for m in bpy.data.objects[name].modifiers] for name in shell_names}
    report = {
        "source": "Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0",
        "visible_anatomy": [body.name, *[eye for eye in EYE_NAMES if bpy.data.objects.get(eye)]],
        "target_height_m": 1.90,
        "body_height_m": round(body.dimensions.z, 6),
        "rig": rig.name,
        "rig_bones": len(rig.data.bones),
        "deform_groups": len([group for group in body.vertex_groups if group.name.startswith("DEF-")]),
        "body_modifier_order": [m.type for m in body.modifiers],
        "body_armature_target": armature.object.name,
        "shell_modifier_order": shell_modifiers,
        "actions": {name: {"frames": actions[name][1], "frame_range": list(actions[name][0].frame_range)} for name in ACTION_ORDER},
        "attachments": {
            "helmet": "DEF-spine.006",
            "shield": "DEF-hand.L",
            "claymore": "DEF-hand.R",
        },
        "equipment": {"shield_height_m": 1.40, "claymore_total_length_m": 1.47},
        "preview_files": [str(path) for path in preview_paths],
        "full_render": full,
    }
    (OUT / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def package_files(full):
    archive = OUT / "human-base-sculpt-crusader-prototype.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in (
            OUT / "human_base_sculpt_crusader.blend",
            OUT / "manifest.json",
            OUT / "checksums.sha256",
            ROOT / "scripts" / "render_human_base_sculpt_crusader.py",
            OUT / "human_base_sculpt_crusader_preview_sheet.png",
            OUT / "human_base_sculpt_crusader_keyposes.png",
            OUT / "human_base_sculpt_crusader_front.png",
            OUT / "human_base_sculpt_crusader_front_3q.png",
            OUT / "human_base_sculpt_crusader_back_3q.png",
        ):
            if path.exists():
                bundle.write(path, path.relative_to(ROOT))
        if full:
            for path in OUT.glob("*.mp4"):
                bundle.write(path, path.relative_to(ROOT))
    return archive


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def finalize_checksums_and_package(full=True):
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    core = [
        OUT / "human_base_sculpt_crusader.blend",
        OUT / "human_base_sculpt_crusader_preview_sheet.png",
        OUT / "human_base_sculpt_crusader_keyposes.png",
        *sorted(OUT.glob("crusader_*.mp4")),
        OUT / "human_base_sculpt_crusader_motion_preview.mp4",
    ]
    core = [path for path in core if path.exists()]
    manifest["sha256"] = {path.name: sha256_file(path) for path in core}
    manifest["action_library"] = str(ACTION_BLEND)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    checksum_targets = [manifest_path, ROOT / "scripts" / "render_human_base_sculpt_crusader.py", *core]
    checksum_file = OUT / "checksums.sha256"
    checksum_file.write_text(
        "\n".join(f"{sha256_file(path)}  {path.relative_to(ROOT).as_posix()}" for path in checksum_targets) + "\n",
        encoding="ascii",
    )
    archive = package_files(full)
    archive_hash = sha256_file(archive)
    (OUT / (archive.name + ".sha256")).write_text(f"{archive_hash}  {archive.name}\n", encoding="ascii")
    return archive, archive_hash


def validate(body, rig, actions):
    assert 1.89 <= body.dimensions.z <= 1.91, body.dimensions.z
    assert len(rig.data.bones) >= 200
    assert all(name in actions for name in ACTION_ORDER)
    assert bpy.data.objects["HB_GreatShield_Pivot"].parent_bone == "DEF-hand.L"
    assert bpy.data.objects["HB_ThinClaymore_Pivot"].parent_bone == "DEF-hand.R"
    assert bpy.data.objects["HB_Helmet_Pivot"].parent_bone == "DEF-spine.006"
    for obj in bpy.data.objects:
        if obj.type == "MESH" and any(modifier.type == "SHRINKWRAP" for modifier in obj.modifiers):
            types = [m.type for m in obj.modifiers]
            assert types[:4] == ["ARMATURE", "SHRINKWRAP", "SOLIDIFY", "BEVEL"], (obj.name, types)


def main():
    options = args_from_blender()
    body, rig, actions, camera = build_scene()
    validate(body, rig, actions)
    preview_paths = render_previews(rig, actions, camera)
    keypose_outputs = None
    if options.keyposes or options.full:
        keypose_outputs = render_keypose_sheet(rig, actions, camera)
    blend = OUT / "human_base_sculpt_crusader.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    full_outputs = None
    decode_report = None
    if options.full:
        render_action_frames(rig, actions, camera)
        full_outputs = encode_action_videos()
        decode_report = decode_validate_videos(*full_outputs)
    write_manifest(body, rig, actions, preview_paths, full=options.full)
    if keypose_outputs or decode_report:
        manifest_path = OUT / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if keypose_outputs:
            manifest["keyposes"] = {
                "representative_frames": {"IDLE": 13, "WALK": 9, "RUN": 7, "ATTACK": 17, "GUARD": 25},
                "sheet": str(keypose_outputs[1]),
            }
        if decode_report:
            manifest["ffmpeg_decode_validation"] = decode_report
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    archive, archive_hash = finalize_checksums_and_package(options.full)
    print(json.dumps({"status": "ok", "preview": [str(path) for path in preview_paths], "blend": str(blend), "full": bool(full_outputs)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

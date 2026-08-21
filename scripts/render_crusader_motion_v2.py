"""Build a smooth, human-proportioned Crusader v2 motion prototype.

This script keeps the original blockout untouched.  It reuses the proven v1
animation/render pipeline but replaces the character with organic, shade-smooth
geometry: tapered capsules, ellipsoids, a ring-built torso, curved plate armor,
and a bowed heater shield.

Preview only:
    blender.exe --background --python scripts/render_crusader_motion_v2.py -- --preview-only

Full render + FFmpeg encode:
    blender.exe --background --python scripts/render_crusader_motion_v2.py
"""

from __future__ import annotations

import json
import math
import sys
import zipfile
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import render_crusader_motion as base  # noqa: E402


OUTPUT_DIR = REPO_ROOT / "artifacts" / "crusader-3d-v2"
FRAMES_DIR = OUTPUT_DIR / "frames"
BLEND_PATH = OUTPUT_DIR / "crusader_human_rig_v2.blend"

# Point the shared, already-validated render/encode helpers at v2 outputs.
base.OUTPUT_DIR = OUTPUT_DIR
base.FRAMES_DIR = FRAMES_DIR
base.BLEND_PATH = BLEND_PATH


def smooth(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def rotate_mesh_about_point(
    obj: bpy.types.Object,
    pivot: tuple[float, float, float],
    angle_z: float,
) -> bpy.types.Object:
    """Bake a world-space yaw around a shared pivot into an identity mesh object."""
    point = Vector(pivot)
    transform = (
        Matrix.Translation(point)
        @ Matrix.Rotation(angle_z, 4, "Z")
        @ Matrix.Translation(-point)
    )
    obj.data.transform(transform)
    obj.data.update()
    return obj


def add_weighted(
    obj: bpy.types.Object,
    bone: str,
    armature: bpy.types.Object,
    registry: list[bpy.types.Object],
) -> bpy.types.Object:
    """Rigidly attach a smooth armor piece to one Rigify control bone."""
    smooth(obj)
    world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = world
    obj["rigid_bone"] = bone
    registry.append(obj)
    return obj


def uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    base.apply_object_transform(obj)
    base.set_material(obj, material)
    return smooth(obj)


def tapered_capsule(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    *,
    segments: int = 16,
) -> bpy.types.Object:
    """Create a tapered, round-ended limb along an arbitrary 3D segment."""
    a = Vector(start)
    b = Vector(end)
    axis = b - a
    length = axis.length
    direction = axis.normalized()
    helper = Vector((0.0, 0.0, 1.0))
    if abs(direction.dot(helper)) > 0.92:
        helper = Vector((1.0, 0.0, 0.0))
    tangent = direction.cross(helper).normalized()
    bitangent = direction.cross(tangent).normalized()

    # The two narrow near-tip rings produce capsule ends without blocky caps.
    profile = (
        (0.00, 0.02),
        (0.08, 0.72),
        (0.18, 1.00),
        (0.45, 0.96),
        (0.72, 0.94),
        (0.90, 0.70),
        (1.00, 0.02),
    )
    vertices: list[tuple[float, float, float]] = []
    for t, cap_factor in profile:
        center = a.lerp(b, t)
        radius = (radius_start * (1.0 - t) + radius_end * t) * cap_factor
        for index in range(segments):
            angle = math.tau * index / segments
            offset = tangent * (math.cos(angle) * radius) + bitangent * (math.sin(angle) * radius)
            vertices.append(tuple(center + offset))

    faces: list[tuple[int, ...]] = []
    ring_count = len(profile)
    for ring in range(ring_count - 1):
        for index in range(segments):
            next_index = (index + 1) % segments
            current = ring * segments + index
            nxt = ring * segments + next_index
            above = (ring + 1) * segments + index
            above_next = (ring + 1) * segments + next_index
            faces.append((current, nxt, above_next, above))
    faces.append(tuple(range(segments))[::-1])
    last = (ring_count - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    return smooth(obj)


def ring_torso(
    name: str,
    material: bpy.types.Material,
    *,
    scale: float = 1.0,
    front_bias: float = 0.0,
) -> bpy.types.Object:
    """Create a naturally tapering male torso from elliptical cross-sections."""
    sections = (
        (1.02, 0.205, 0.140),
        (1.10, 0.235, 0.155),
        (1.24, 0.285, 0.185),
        (1.39, 0.335, 0.205),
        (1.50, 0.355, 0.205),
        (1.57, 0.275, 0.175),
    )
    segments = 24
    vertices = []
    for z, rx, ry in sections:
        for index in range(segments):
            angle = math.tau * index / segments
            x = math.cos(angle) * rx * scale
            y = math.sin(angle) * ry * scale
            if y < 0.0:
                y *= 1.0 + front_bias
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(sections) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((ring * segments + index, ring * segments + nxt, (ring + 1) * segments + nxt, (ring + 1) * segments + index))
    faces.append(tuple(range(segments))[::-1])
    top = (len(sections) - 1) * segments
    faces.append(tuple(top + index for index in range(segments)))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    bevel = obj.modifiers.new(name="Soft torso seams", type="BEVEL")
    bevel.width = 0.012
    bevel.segments = 2
    return smooth(obj)


def curved_shield(
    name: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    material: bpy.types.Material,
    *,
    bulge: float,
    depth: float,
) -> bpy.types.Object:
    """Create a smoothly bowed heater shield using concentric outline rings."""
    cx, cy, cz = center
    outline = (
        (-0.43, 0.43), (-0.30, 0.53), (-0.10, 0.57), (0.10, 0.57),
        (0.30, 0.53), (0.43, 0.43), (0.45, 0.12), (0.40, -0.25),
        (0.29, -0.46), (0.00, -0.60), (-0.29, -0.46), (-0.40, -0.25),
        (-0.45, 0.12),
    )
    rings = (0.0, 0.46, 0.78, 1.0)
    vertices: list[tuple[float, float, float]] = []
    # Front surface: center is pushed toward the camera (negative Y).
    for ring in rings:
        curve = bulge * (1.0 - ring * ring)
        for x, z in outline:
            vertices.append((cx + x * width * ring, cy - depth * 0.5 - curve, cz + z * height * ring))
    front_count = len(vertices)
    # Back surface is a translated copy, retaining the gentle bow.
    for ring in rings:
        curve = bulge * (1.0 - ring * ring)
        for x, z in outline:
            vertices.append((cx + x * width * ring, cy + depth * 0.5 - curve, cz + z * height * ring))

    segments = len(outline)
    faces = []
    for side_offset, reverse in ((0, False), (front_count, True)):
        for ring_index in range(len(rings) - 1):
            for index in range(segments):
                nxt = (index + 1) % segments
                a = side_offset + ring_index * segments + index
                b = side_offset + ring_index * segments + nxt
                c = side_offset + (ring_index + 1) * segments + nxt
                d = side_offset + (ring_index + 1) * segments + index
                faces.append((d, c, b, a) if reverse else (a, b, c, d))
    outer_front = (len(rings) - 1) * segments
    outer_back = front_count + outer_front
    for index in range(segments):
        nxt = (index + 1) % segments
        faces.append((outer_front + index, outer_front + nxt, outer_back + nxt, outer_back + index))

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    bevel = obj.modifiers.new(name="Rounded shield edge", type="BEVEL")
    bevel.width = 0.018
    bevel.segments = 3
    return smooth(obj)


def blade_mesh(
    name: str,
    hilt: tuple[float, float, float],
    tip: tuple[float, float, float],
    width: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    start = Vector(hilt)
    end = Vector(tip)
    axis = (end - start).normalized()
    normal = Vector((0.0, 1.0, 0.0))
    side = normal.cross(axis).normalized()
    shoulder = start.lerp(end, 0.09)
    half = width * 0.5
    points = [start - side * half * 0.75, start + side * half * 0.75, shoulder + side * half, end, shoulder - side * half]
    vertices = []
    for y_offset in (-thickness * 0.5, thickness * 0.5):
        for point in points:
            vertices.append((point.x, point.y + y_offset, point.z))
    count = len(points)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    bevel = obj.modifiers.new(name="Blade bevel", type="BEVEL")
    bevel.width = 0.008
    bevel.segments = 2
    return smooth(obj)


def body_surface_shell(
    name: str,
    human: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
    face_filter,
    *,
    offset: float = 0.006,
    thickness: float = 0.010,
) -> bpy.types.Object:
    """Duplicate a filtered portion of the evaluated MPFB skin as fitted armor.

    Vertex weights are copied from the original human, then Armature,
    Shrinkwrap and Solidify modifiers keep the plate continuous over motion.
    """
    # Build the current MPFB macro shape in rest space. Using the fully evaluated
    # mesh here would bake the armature once and then deform it a second time.
    if human.data.shape_keys:
        key_blocks = human.data.shape_keys.key_blocks
        basis = key_blocks.get("Basis") or key_blocks[0]
        active_keys = [key for key in key_blocks if key != basis and abs(key.value) > 1e-8]
        shaped_coordinates = []
        for index in range(len(human.data.vertices)):
            coordinate = basis.data[index].co.copy()
            for key in active_keys:
                coordinate += (key.data[index].co - basis.data[index].co) * key.value
            shaped_coordinates.append(coordinate)
    else:
        shaped_coordinates = [vertex.co.copy() for vertex in human.data.vertices]
    selected_faces = []
    selected_indices: set[int] = set()
    for polygon in human.data.polygons:
        center = sum((shaped_coordinates[index] for index in polygon.vertices), Vector()) / len(polygon.vertices)
        if face_filter(center):
            selected_faces.append(tuple(polygon.vertices))
            selected_indices.update(polygon.vertices)
    if not selected_faces:
        raise RuntimeError(f"No MPFB faces selected for {name}")

    ordered = sorted(selected_indices)
    remap = {old: new for new, old in enumerate(ordered)}
    vertices = [tuple(shaped_coordinates[index]) for index in ordered]
    faces = [tuple(remap[index] for index in face) for face in selected_faces]

    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    smooth(obj)

    # Copy the MPFB body's original Rigify weights by source vertex index.
    source_group_names = {group.index: group.name for group in human.vertex_groups}
    target_groups: dict[str, bpy.types.VertexGroup] = {}
    for new_index, old_index in enumerate(ordered):
        for membership in human.data.vertices[old_index].groups:
            group_name = source_group_names.get(membership.group)
            if not group_name:
                continue
            target = target_groups.get(group_name)
            if target is None:
                target = obj.vertex_groups.new(name=group_name)
                target_groups[group_name] = target
            target.add([new_index], membership.weight, "REPLACE")

    armature_modifier = obj.modifiers.new(name="MPFB Rigify deformation", type="ARMATURE")
    armature_modifier.object = rig
    shrinkwrap = obj.modifiers.new(name="Conform to MPFB body", type="SHRINKWRAP")
    shrinkwrap.target = human
    shrinkwrap.wrap_method = "NEAREST_SURFACEPOINT"
    shrinkwrap.wrap_mode = "OUTSIDE_SURFACE"
    shrinkwrap.offset = offset
    solidify = obj.modifiers.new(name="Forged plate thickness", type="SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 1.0
    bevel = obj.modifiers.new(name="Rolled plate edge", type="BEVEL")
    bevel.width = min(0.0045, thickness * 0.4)
    bevel.segments = 2
    obj["surface_conforming_armor"] = True
    return obj


def refined_cape(name: str, material: bpy.types.Material) -> bpy.types.Object:
    """Create a tapered, gently bowed quad-grid cape without ngon artifacts."""
    rows = (
        (1.34, 0.25, 0.145),
        (1.18, 0.30, 0.175),
        (1.02, 0.34, 0.205),
        (0.84, 0.37, 0.235),
        (0.64, 0.35, 0.270),
        (0.44, 0.30, 0.305),
    )
    columns = (-1.0, -0.5, 0.0, 0.5, 1.0)
    vertices = []
    for z, half_width, base_y in rows:
        for column in columns:
            y = base_y + (column * column) * 0.035
            vertices.append((column * half_width, y, z))
    faces = []
    width = len(columns)
    for row in range(len(rows) - 1):
        for column in range(width - 1):
            a = row * width + column
            b = a + 1
            c = (row + 1) * width + column + 1
            d = (row + 1) * width + column
            faces.append((a, b, c, d))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    base.set_material(obj, material)
    solidify = obj.modifiers.new(name="Cloth thickness", type="SOLIDIFY")
    solidify.thickness = 0.012
    subdivision = obj.modifiers.new(name="Cloth smoothing", type="SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    return smooth(obj)


def build_materials() -> dict[str, bpy.types.Material]:
    return {
        "skin": base.make_material("Warm Skin", (0.49, 0.25, 0.16, 1.0), roughness=0.62),
        "undersuit": base.make_material("Flexible Navy", (0.025, 0.032, 0.045, 1.0), metallic=0.08, roughness=0.72),
        "ivory": base.make_material("Rough Ivory Plate", (0.72, 0.70, 0.62, 1.0), metallic=0.62, roughness=0.52),
        "pearl": base.make_material("Brushed White Steel", (0.58, 0.62, 0.62, 1.0), metallic=0.72, roughness=0.46),
        "gold": base.make_material("Muted Forged Gold", (0.72, 0.34, 0.045, 1.0), metallic=0.86, roughness=0.38),
        "yellow": base.make_material("Ochre Gold Inlay", (0.82, 0.50, 0.065, 1.0), metallic=0.68, roughness=0.42),
        "dark": base.make_material("Dark Iron", (0.025, 0.030, 0.035, 1.0), metallic=0.58, roughness=0.58),
        "leather": base.make_material("Brown Leather", (0.15, 0.055, 0.022, 1.0), roughness=0.72),
        "cape": base.make_material("Muted Umber Cape", (0.20, 0.075, 0.030, 1.0), metallic=0.03, roughness=0.78),
        "cyan": base.make_material("Spirit Cyan", (0.025, 0.82, 0.94, 1.0), roughness=0.14, emission_strength=3.2),
        "stage": base.make_material("Arena Navy", (0.028, 0.045, 0.092, 1.0), metallic=0.26, roughness=0.38),
        "stage_light": base.make_material("Backdrop Stone", (0.075, 0.105, 0.18, 1.0), metallic=0.12, roughness=0.56),
        "label": base.make_material("Label Gold", (1.0, 0.70, 0.14, 1.0), roughness=0.18, emission_strength=1.6),
    }


def build_human_crusader(materials, armature) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    add = lambda obj, bone: add_weighted(obj, bone, armature, parts)
    ivory, pearl, gold = materials["ivory"], materials["pearl"], materials["gold"]
    dark, cyan, yellow = materials["dark"], materials["cyan"], materials["yellow"]

    # Anatomical core: 7.7-head heroic male, broad shoulders and a visibly narrower waist.
    add(ring_torso("AnatomicalTorso", materials["undersuit"], scale=1.0), "chest")
    add(ring_torso("RoundedBreastplate", ivory, scale=1.035, front_bias=0.10), "chest")
    add(uv_ellipsoid("PelvisArmor", (0.0, 0.0, 0.99), (0.245, 0.165, 0.205), dark), "hips")
    add(uv_ellipsoid("WaistPlate", (0.0, -0.035, 1.08), (0.245, 0.17, 0.12), gold), "hips")
    add(uv_ellipsoid("NeckGuard", (0.0, 0.0, 1.58), (0.135, 0.125, 0.10), gold), "neck")

    # Breastplate cross follows the curved chest instead of forming a square torso.
    add(uv_ellipsoid("ChestCrossVertical", (0.0, -0.220, 1.31), (0.035, 0.022, 0.255), gold), "chest")
    add(uv_ellipsoid("ChestCrossHorizontal", (0.0, -0.236, 1.41), (0.205, 0.025, 0.037), gold), "chest")
    add(uv_ellipsoid("ChestSpiritGem", (0.0, -0.270, 1.41), (0.052, 0.030, 0.052), cyan), "chest")

    # Arms: tapered capsules with overlapping rounded joints and articulated plate shells.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        shoulder = (0.34 * sign, 0.0, 1.48)
        elbow = (0.515 * sign, -0.012, 1.205)
        wrist = (0.53 * sign, -0.09, 0.95)
        add(tapered_capsule(f"UpperArmBase.{side}", shoulder, elbow, 0.125, 0.105, dark), f"upper_arm.{side}")
        add(tapered_capsule(f"UpperArmPlate.{side}", shoulder, elbow, 0.145, 0.118, ivory), f"upper_arm.{side}")
        add(uv_ellipsoid(f"Pauldron.{side}", (0.355 * sign, -0.005, 1.49), (0.225, 0.205, 0.155), gold, rotation=(0.0, 0.0, math.radians(sign * 6))), f"upper_arm.{side}")
        add(uv_ellipsoid(f"ElbowJoint.{side}", elbow, (0.120, 0.112, 0.120), gold), f"forearm.{side}")
        add(tapered_capsule(f"ForearmBase.{side}", elbow, wrist, 0.112, 0.080, dark), f"forearm.{side}")
        add(tapered_capsule(f"ForearmPlate.{side}", elbow, wrist, 0.126, 0.092, pearl), f"forearm.{side}")
        add(uv_ellipsoid(f"Gauntlet.{side}", (0.53 * sign, -0.115, 0.875), (0.098, 0.092, 0.125), gold), f"hand.{side}")

    # Legs: continuous thigh/calf volumes, round knees, tapered ankles and elongated feet.
    for side, sign in (("L", -1.0), ("R", 1.0)):
        hip = (0.165 * sign, 0.0, 0.97)
        knee = (0.185 * sign, 0.0, 0.58)
        ankle = (0.185 * sign, -0.012, 0.19)
        add(tapered_capsule(f"ThighBase.{side}", hip, knee, 0.155, 0.125, dark), f"thigh.{side}")
        add(tapered_capsule(f"ThighPlate.{side}", hip, knee, 0.168, 0.137, ivory), f"thigh.{side}")
        add(uv_ellipsoid(f"KneeJoint.{side}", knee, (0.138, 0.130, 0.125), gold), f"shin.{side}")
        add(tapered_capsule(f"CalfBase.{side}", knee, ankle, 0.135, 0.082, dark), f"shin.{side}")
        add(tapered_capsule(f"Greave.{side}", knee, ankle, 0.148, 0.092, pearl), f"shin.{side}")
        add(tapered_capsule(f"Sabaton.{side}", (0.185 * sign, 0.0, 0.155), (0.185 * sign, -0.30, 0.105), 0.115, 0.105, dark), f"foot.{side}")
        add(uv_ellipsoid(f"SabatonGoldToe.{side}", (0.185 * sign, -0.285, 0.108), (0.125, 0.145, 0.085), gold), f"foot.{side}")

    # Rounded great helm, proportionate human head, and highly readable cross visor.
    add(uv_ellipsoid("HelmetDome", (0.0, -0.005, 1.735), (0.158, 0.146, 0.185), pearl), "head")
    add(uv_ellipsoid("HelmetFacePlate", (0.0, -0.132, 1.72), (0.145, 0.050, 0.145), ivory), "head")
    add(uv_ellipsoid("HelmetEyeSlit", (0.0, -0.184, 1.755), (0.112, 0.012, 0.015), dark), "head")
    add(uv_ellipsoid("HelmetCrossVertical", (0.0, -0.202, 1.735), (0.025, 0.014, 0.165), gold), "head")
    add(uv_ellipsoid("HelmetCrossHorizontal", (0.0, -0.207, 1.755), (0.132, 0.014, 0.026), gold), "head")
    add(uv_ellipsoid("HelmetCrownBand", (0.0, -0.012, 1.86), (0.165, 0.150, 0.035), yellow), "head")
    for index, x in enumerate((-0.075, 0.0, 0.075)):
        add(tapered_capsule(f"HelmetFin{index + 1}", (x, 0.02, 1.865), (x * 1.10, 0.035, 1.985 - abs(x) * 0.45), 0.025, 0.010, gold, segments=12), "head")
    add(base.create_torus("SpiritHalo", (0.0, 0.055, 1.77), 0.205, 0.012, cyan, rotation=(math.radians(90), 0.0, 0.0)), "head")

    # Curved shoulder-to-below-knee shield with a rounded border and raised cross.
    shield_center = (-0.635, -0.29, 1.08)
    add(curved_shield("CurvedShieldRim", shield_center, 0.88, 1.54, gold, bulge=0.085, depth=0.075), "hand.L")
    add(curved_shield("CurvedShieldFace", (-0.635, -0.350, 1.08), 0.80, 1.43, ivory, bulge=0.075, depth=0.035), "hand.L")
    add(uv_ellipsoid("ShieldCrossVertical", (-0.635, -0.462, 1.11), (0.038, 0.018, 0.44), yellow), "hand.L")
    add(uv_ellipsoid("ShieldCrossHorizontal", (-0.635, -0.477, 1.27), (0.235, 0.020, 0.043), yellow), "hand.L")
    add(uv_ellipsoid("ShieldSpiritGem", (-0.635, -0.505, 1.27), (0.060, 0.026, 0.060), cyan), "hand.L")

    # Thin one-handed claymore angled away from the feet in the rest pose.
    hilt, tip = (0.67, -0.13, 0.72), (1.37, -0.13, 0.035)
    add(tapered_capsule("SwordGrip", (0.55, -0.13, 0.84), hilt, 0.036, 0.032, materials["leather"], segments=12), "hand.R")
    add(tapered_capsule("SwordGuard", (0.54, -0.13, 0.66), (0.80, -0.13, 0.78), 0.030, 0.030, gold, segments=12), "hand.R")
    add(blade_mesh("ClaymoreBlade", hilt, tip, 0.115, 0.028, pearl), "hand.R")
    add(tapered_capsule("BladeRune", (0.81, -0.151, 0.585), (1.17, -0.151, 0.235), 0.010, 0.006, cyan, segments=8), "hand.R")

    # Split cape with curved cloth panels to keep each rigid-weight section natural.
    upper = base.create_cape("CapeUpperV2", materials["cape"], upper=True)
    lower = base.create_cape("CapeLowerV2", materials["cape"], upper=False)
    for cape, bone in ((upper, "chest"), (lower, "hips")):
        subdivision = cape.modifiers.new(name="Cape smoothing", type="SUBSURF")
        subdivision.levels = 2
        subdivision.render_levels = 2
        add(cape, bone)

    for index, location in enumerate(((0.58, 0.10, 1.67), (0.72, 0.11, 1.54), (0.65, 0.12, 1.83))):
        add(uv_ellipsoid(f"SpiritWisp{index + 1}", location, (0.042, 0.032, 0.070), cyan), "chest")

    return parts


def build_mpfb_armor(materials, rig: bpy.types.Object) -> list[bpy.types.Object]:
    """Fit smooth plate armor over the real 1.911 m MPFB male base mesh."""
    parts: list[bpy.types.Object] = []
    add = lambda obj, bone: add_weighted(obj, bone, rig, parts)
    ivory, pearl, gold = materials["ivory"], materials["pearl"], materials["gold"]
    dark, cyan, yellow = materials["dark"], materials["cyan"], materials["yellow"]

    # Rounded breastplate closely follows the MPFB shoulder, rib and waist volumes.
    torso_sections = (
        (0.90, 0.205, 0.145),
        (0.98, 0.235, 0.160),
        (1.10, 0.275, 0.185),
        (1.22, 0.315, 0.200),
        (1.31, 0.340, 0.198),
        (1.38, 0.275, 0.168),
        (1.42, 0.175, 0.130),
    )
    # Reuse the ring method with MPFB-specific sections by temporarily building here.
    segments = 28
    vertices = []
    for z, rx, ry in torso_sections:
        for index in range(segments):
            angle = math.tau * index / segments
            x = math.cos(angle) * rx
            y = math.sin(angle) * ry
            if y < 0.0:
                y *= 1.11
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(torso_sections) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((ring * segments + index, ring * segments + nxt, (ring + 1) * segments + nxt, (ring + 1) * segments + index))
    faces.append(tuple(range(segments))[::-1])
    top = (len(torso_sections) - 1) * segments
    faces.append(tuple(top + index for index in range(segments)))
    torso_mesh = bpy.data.meshes.new("MPFB_BreastplateMesh")
    torso_mesh.from_pydata(vertices, [], faces)
    torso_mesh.update()
    breastplate = bpy.data.objects.new("MPFB_RoundedBreastplate", torso_mesh)
    bpy.context.collection.objects.link(breastplate)
    base.set_material(breastplate, ivory)
    bevel = breastplate.modifiers.new(name="Rolled plate edges", type="BEVEL")
    bevel.width = 0.010
    bevel.segments = 2
    add(breastplate, "spine_fk.003")
    add(uv_ellipsoid("MPFB_PelvisArmor", (0.0, 0.0, 0.91), (0.245, 0.172, 0.165), dark), "torso")
    add(uv_ellipsoid("MPFB_WaistPlate", (0.0, -0.025, 0.955), (0.245, 0.176, 0.082), gold), "torso")
    add(uv_ellipsoid("MPFB_NeckGuard", (0.0, -0.005, 1.43), (0.130, 0.118, 0.080), gold), "neck")
    add(uv_ellipsoid("MPFB_ChestCrossVertical", (0.0, -0.214, 1.17), (0.030, 0.020, 0.205), gold), "spine_fk.003")
    add(uv_ellipsoid("MPFB_ChestCrossHorizontal", (0.0, -0.229, 1.25), (0.175, 0.023, 0.032), gold), "spine_fk.003")
    add(uv_ellipsoid("MPFB_ChestSpiritGem", (0.0, -0.257, 1.25), (0.044, 0.026, 0.044), cyan), "spine_fk.003")

    # Armor follows Rigify's real rest-pose segments, leaving the underlying MPFB
    # body visible only as a flexible navy joint layer.
    for side in ("L", "R"):
        upper = rig.data.bones[f"upper_arm_fk.{side}"]
        fore = rig.data.bones[f"forearm_fk.{side}"]
        hand = rig.data.bones[f"hand_fk.{side}"]
        upper_start, upper_end = tuple(upper.head_local), tuple(upper.tail_local)
        fore_start, fore_end = tuple(fore.head_local), tuple(fore.tail_local)
        add(tapered_capsule(f"MPFB_UpperArmPlate.{side}", upper_start, upper_end, 0.105, 0.085, ivory, segments=18), f"upper_arm_fk.{side}")
        shoulder_center = Vector(upper_start).lerp(Vector(upper_end), 0.16)
        sign = 1.0 if side == "L" else -1.0
        add(uv_ellipsoid(f"MPFB_Pauldron.{side}", tuple(shoulder_center), (0.170, 0.150, 0.130), gold, rotation=(0.0, 0.0, math.radians(sign * 10))), f"upper_arm_fk.{side}")
        add(uv_ellipsoid(f"MPFB_Elbow.{side}", fore_start, (0.088, 0.064, 0.074), gold), f"forearm_fk.{side}")
        add(tapered_capsule(f"MPFB_ForearmPlate.{side}", fore_start, fore_end, 0.092, 0.068, pearl, segments=18), f"forearm_fk.{side}")
        gauntlet_center = Vector(hand.head_local).lerp(Vector(hand.tail_local), 0.38)
        add(uv_ellipsoid(f"MPFB_Gauntlet.{side}", tuple(gauntlet_center), (0.078, 0.070, 0.090), gold), f"hand_fk.{side}")

    for side in ("L", "R"):
        thigh = rig.data.bones[f"thigh_fk.{side}"]
        shin = rig.data.bones[f"shin_fk.{side}"]
        foot = rig.data.bones[f"foot_fk.{side}"]
        thigh_start, thigh_end = tuple(thigh.head_local), tuple(thigh.tail_local)
        shin_start, shin_end = tuple(shin.head_local), tuple(shin.tail_local)
        add(tapered_capsule(f"MPFB_ThighPlate.{side}", thigh_start, thigh_end, 0.135, 0.103, ivory, segments=18), f"thigh_fk.{side}")
        add(uv_ellipsoid(f"MPFB_Knee.{side}", shin_start, (0.103, 0.072, 0.078), gold), f"shin_fk.{side}")
        add(tapered_capsule(f"MPFB_Greave.{side}", shin_start, shin_end, 0.110, 0.064, pearl, segments=18), f"shin_fk.{side}")
        foot_start = Vector(foot.head_local) + Vector((0.0, 0.0, 0.045))
        foot_tip = Vector(foot.tail_local) + Vector((0.0, -0.175, 0.055))
        add(tapered_capsule(f"MPFB_Sabaton.{side}", tuple(foot_start), tuple(foot_tip), 0.080, 0.070, dark, segments=18), f"foot_fk.{side}")
        add(uv_ellipsoid(f"MPFB_SabatonToe.{side}", tuple(foot_tip), (0.108, 0.150, 0.055), gold), f"foot_fk.{side}")

    # Helmet is large enough for the real MPFB skull but remains rounded and human-scaled.
    add(uv_ellipsoid("MPFB_HelmetDome", (0.0, -0.036, 1.69), (0.154, 0.144, 0.210), pearl, segments=32, rings=16), "head")
    add(uv_ellipsoid("MPFB_HelmetFacePlate", (0.0, -0.165, 1.670), (0.140, 0.044, 0.154), ivory), "head")
    add(uv_ellipsoid("MPFB_HelmetEyeSlit", (0.0, -0.211, 1.705), (0.108, 0.010, 0.012), dark), "head")
    add(uv_ellipsoid("MPFB_HelmetCrossVertical", (0.0, -0.226, 1.685), (0.022, 0.012, 0.165), gold), "head")
    add(uv_ellipsoid("MPFB_HelmetCrossHorizontal", (0.0, -0.230, 1.705), (0.124, 0.012, 0.023), gold), "head")
    add(uv_ellipsoid("MPFB_HelmetCrownBand", (0.0, -0.035, 1.86), (0.158, 0.144, 0.027), yellow), "head")
    for index, x in enumerate((-0.072, 0.0, 0.072)):
        add(tapered_capsule(f"MPFB_HelmetFin{index + 1}", (x, -0.015, 1.855), (x * 1.08, 0.0, 1.975 - abs(x) * 0.30), 0.019, 0.007, gold, segments=12), "head")
    add(base.create_torus("MPFB_SpiritHalo", (0.0, 0.045, 1.72), 0.205, 0.011, cyan, rotation=(math.radians(90), 0.0, 0.0)), "head")

    # True character-left shield (Rigify .L is +X in this rest orientation).
    shield_center = (0.735, -0.325, 1.05)
    add(curved_shield("MPFB_CurvedShieldRim", shield_center, 0.86, 1.48, gold, bulge=0.080, depth=0.070), "hand_fk.L")
    add(curved_shield("MPFB_CurvedShieldFace", (0.735, -0.380, 1.05), 0.78, 1.38, ivory, bulge=0.070, depth=0.033), "hand_fk.L")
    add(uv_ellipsoid("MPFB_ShieldCrossVertical", (0.735, -0.487, 1.08), (0.036, 0.016, 0.420), yellow), "hand_fk.L")
    add(uv_ellipsoid("MPFB_ShieldCrossHorizontal", (0.735, -0.500, 1.23), (0.222, 0.018, 0.040), yellow), "hand_fk.L")
    add(uv_ellipsoid("MPFB_ShieldSpiritGem", (0.735, -0.525, 1.23), (0.054, 0.023, 0.054), cyan), "hand_fk.L")

    # One-handed thin claymore in the real right hand, angled away from both feet.
    hilt, tip = (-0.57, -0.25, 0.91), (-1.28, -0.25, 0.14)
    add(tapered_capsule("MPFB_SwordGrip", (-0.49, -0.22, 1.00), hilt, 0.030, 0.027, materials["leather"], segments=12), "hand_fk.R")
    add(tapered_capsule("MPFB_SwordGuard", (-0.70, -0.25, 0.83), (-0.47, -0.25, 0.99), 0.024, 0.024, gold, segments=12), "hand_fk.R")
    add(blade_mesh("MPFB_ClaymoreBlade", hilt, tip, 0.105, 0.024, pearl), "hand_fk.R")
    add(tapered_capsule("MPFB_BladeRune", (-0.70, -0.267, 0.77), (-1.05, -0.267, 0.39), 0.008, 0.005, cyan, segments=8), "hand_fk.R")

    # Curved split cape and restrained elemental wisps.
    upper = base.create_cape("MPFB_CapeUpper", materials["cape"], upper=True)
    lower = base.create_cape("MPFB_CapeLower", materials["cape"], upper=False)
    # Existing cape helper is scaled/translated from the prior 1.9 m layout.
    upper.scale = (0.88, 0.90, 0.84)
    upper.location.z = -0.17
    lower.scale = (0.88, 0.90, 0.86)
    lower.location.z = -0.13
    for cape, bone in ((upper, "spine_fk.003"), (lower, "torso")):
        base.apply_object_transform(cape)
        subdivision = cape.modifiers.new(name="Cape smoothing", type="SUBSURF")
        subdivision.levels = 2
        subdivision.render_levels = 2
        add(cape, bone)
    for index, location in enumerate(((0.46, 0.10, 1.48), (0.58, 0.11, 1.37), (0.54, 0.12, 1.61))):
        add(uv_ellipsoid(f"MPFB_SpiritWisp{index + 1}", location, (0.038, 0.028, 0.062), cyan), "spine_fk.003")

    return parts


def build_mpfb_armor_refined(materials, rig: bpy.types.Object, human: bpy.types.Object) -> list[bpy.types.Object]:
    """Second-pass armor: continuous fitted shells, restrained trim, real proportions."""
    parts: list[bpy.types.Object] = []
    add = lambda obj, bone: add_weighted(obj, bone, rig, parts)
    ivory, pearl, gold = materials["ivory"], materials["pearl"], materials["gold"]
    dark, cyan, yellow = materials["dark"], materials["cyan"], materials["yellow"]

    def shell(name, material, predicate, offset=0.007, thickness=0.010):
        obj = body_surface_shell(name, human, rig, material, predicate, offset=offset, thickness=thickness)
        parts.append(obj)
        return obj

    def segment_predicate(start, end, radius, t_min=0.03, t_max=0.97):
        start_v, end_v = Vector(start), Vector(end)
        axis = end_v - start_v
        length_squared = axis.length_squared

        def predicate(point):
            t = (point - start_v).dot(axis) / length_squared
            if t < t_min or t > t_max:
                return False
            closest = start_v + axis * t
            return (point - closest).length <= radius

        return predicate

    # Cuirass copied from the actual MPFB surface; it remains one continuous plate.
    shell(
        "Refined_ContinuousCuirass",
        ivory,
        lambda p: 0.88 <= p.z <= 1.405 and abs(p.x) <= 0.345 and p.y <= 0.135,
        offset=0.010,
        thickness=0.012,
    )
    # Three shallow overlapping fauld plates replace the brief-like pelvis shell.
    for index, (z, width) in enumerate(((0.955, 0.238), (0.902, 0.252), (0.848, 0.260)), start=1):
        add(
            uv_ellipsoid(
                f"Refined_Fauld{index}",
                (0.0, -0.154 - index * 0.004, z),
                (width, 0.025, 0.050),
                pearl if index == 2 else ivory,
                segments=28,
                rings=12,
            ),
            "torso",
        )

    # Surface-conforming arm and leg armor. Gaps are narrow bands of matte under-armor.
    for side in ("L", "R"):
        upper = rig.data.bones[f"upper_arm_fk.{side}"]
        fore = rig.data.bones[f"forearm_fk.{side}"]
        thigh = rig.data.bones[f"thigh_fk.{side}"]
        shin = rig.data.bones[f"shin_fk.{side}"]
        shell(
            f"Refined_Rerebrace.{side}",
            ivory,
            segment_predicate(upper.head_local, upper.tail_local, 0.190, 0.03, 0.92),
            offset=0.008,
            thickness=0.009,
        )
        shoulder_center = Vector(upper.head_local).lerp(Vector(upper.tail_local), 0.10)
        sign = 1.0 if side == "L" else -1.0
        add(
            uv_ellipsoid(
                f"Refined_Pauldron.{side}",
                tuple(shoulder_center + Vector((0.0, -0.020, 0.025))),
                (0.135, 0.095, 0.068),
                ivory,
                rotation=(0.0, 0.0, math.radians(sign * 9)),
            ),
            f"upper_arm_fk.{side}",
        )
        shell(
            f"Refined_Vambrace.{side}",
            pearl,
            segment_predicate(fore.head_local, fore.tail_local, 0.180, 0.10, 0.94),
            offset=0.008,
            thickness=0.009,
        )
        shell(
            f"Refined_Cuisse.{side}",
            ivory,
            segment_predicate(thigh.head_local, thigh.tail_local, 0.210, 0.04, 0.93),
            offset=0.009,
            thickness=0.010,
        )
        shell(
            f"Refined_Greave.{side}",
            pearl,
            segment_predicate(shin.head_local, shin.tail_local, 0.180, 0.09, 0.95),
            offset=0.009,
            thickness=0.010,
        )
        # Anatomical poleyn and couter plates are flattened and aligned to the skin.
        knee = Vector(shin.head_local)
        elbow = Vector(fore.head_local)
        add(uv_ellipsoid(f"Refined_Poleyn.{side}", tuple(knee + Vector((0.0, -0.056, 0.0))), (0.080, 0.019, 0.060), pearl), f"shin_fk.{side}")
        add(uv_ellipsoid(f"Refined_Couter.{side}", tuple(elbow + Vector((0.0, -0.047, 0.0))), (0.062, 0.017, 0.050), pearl), f"forearm_fk.{side}")
        # Upper-thigh tassets are layered plates, not a continuous skirt.
        tasset_center = Vector(thigh.head_local).lerp(Vector(thigh.tail_local), 0.20)
        add(uv_ellipsoid(f"Refined_Tasset.{side}", tuple(tasset_center + Vector((0.0, -0.132, 0.015))), (0.090, 0.018, 0.138), ivory, rotation=(math.radians(7), 0.0, math.radians(-sign * 4))), "torso")
        # Smooth sabatons cover the MPFB toes completely without spherical caps.
        foot = rig.data.bones[f"foot_fk.{side}"]
        foot_start = Vector(foot.head_local) + Vector((0.0, -0.010, 0.050))
        foot_end = Vector(foot.tail_local) + Vector((0.0, -0.190, 0.055))
        add(tapered_capsule(f"Refined_Sabaton.{side}", tuple(foot_start), tuple(foot_end), 0.082, 0.058, dark, segments=20), f"foot_fk.{side}")
        add(uv_ellipsoid(f"Refined_SabatonPlate.{side}", tuple(foot_start.lerp(foot_end, 0.64)), (0.092, 0.145, 0.047), pearl, rotation=(math.radians(8), 0.0, 0.0)), f"foot_fk.{side}")

    # Low-profile gold details stay under one third of the visual palette.
    shell("Refined_Belt", gold, lambda p: 0.940 <= p.z <= 0.980 and abs(p.x) <= 0.265 and p.y <= 0.155, offset=0.014, thickness=0.006)
    add(uv_ellipsoid("Refined_BeltSeal", (0.0, -0.207, 0.955), (0.038, 0.016, 0.044), yellow), "torso")
    add(uv_ellipsoid("Refined_ChestCrossV", (0.0, -0.218, 1.165), (0.025, 0.012, 0.185), gold), "spine_fk.003")
    add(uv_ellipsoid("Refined_ChestCrossH", (0.0, -0.227, 1.235), (0.150, 0.013, 0.025), gold), "spine_fk.003")
    add(uv_ellipsoid("Refined_ChestRune", (0.0, -0.247, 1.235), (0.032, 0.014, 0.032), cyan), "spine_fk.003")

    # Bascinet/great-helm hybrid: one compact dome, a flush cross band and one ridge.
    add(uv_ellipsoid("Refined_HelmetDome", (0.0, -0.038, 1.690), (0.148, 0.139, 0.205), pearl, segments=36, rings=18), "head")
    add(uv_ellipsoid("Refined_HelmetFace", (0.0, -0.161, 1.665), (0.134, 0.041, 0.151), ivory, segments=32, rings=16), "head")
    add(uv_ellipsoid("Refined_EyeSlit", (0.0, -0.204, 1.704), (0.101, 0.009, 0.010), dark), "head")
    add(uv_ellipsoid("Refined_HelmetCrossV", (0.0, -0.216, 1.683), (0.018, 0.010, 0.157), gold), "head")
    add(uv_ellipsoid("Refined_HelmetCrossH", (0.0, -0.220, 1.704), (0.113, 0.010, 0.018), gold), "head")
    add(tapered_capsule("Refined_HelmetRidge", (0.0, -0.120, 1.874), (0.0, 0.105, 1.874), 0.012, 0.010, gold, segments=12), "head")

    # 1.40 m x 0.70 m curved shield, 12 cm center bow, moved 20 cm outboard.
    shield_center = (0.835, -0.320, 1.010)
    add(curved_shield("Refined_ShieldBack", shield_center, 0.78, 1.20, dark, bulge=0.120, depth=0.060), "hand_fk.L")
    add(curved_shield("Refined_ShieldGoldRim", (0.835, -0.352, 1.010), 0.75, 1.18, gold, bulge=0.114, depth=0.038), "hand_fk.L")
    add(curved_shield("Refined_ShieldFace", (0.835, -0.367, 1.010), 0.70, 1.15, ivory, bulge=0.108, depth=0.028), "hand_fk.L")
    add(uv_ellipsoid("Refined_ShieldCrossV", (0.835, -0.510, 1.035), (0.027, 0.012, 0.350), yellow), "hand_fk.L")
    add(uv_ellipsoid("Refined_ShieldCrossH", (0.835, -0.518, 1.160), (0.180, 0.013, 0.028), yellow), "hand_fk.L")
    add(uv_ellipsoid("Refined_ShieldRune", (0.835, -0.537, 1.160), (0.034, 0.014, 0.034), cyan), "hand_fk.L")

    # 1.45 m claymore: 1.15 m tapered blade, realistic guard and long grip.
    blade_root, blade_tip = (-0.625, -0.235, 0.905), (-1.430, -0.235, 0.090)
    add(tapered_capsule("Refined_SwordGrip", (-0.430, -0.210, 1.105), blade_root, 0.024, 0.021, materials["leather"], segments=14), "hand_fk.R")
    add(tapered_capsule("Refined_SwordGuard", (-0.730, -0.235, 0.800), (-0.520, -0.235, 1.010), 0.014, 0.014, gold, segments=12), "hand_fk.R")
    add(blade_mesh("Refined_ClaymoreBlade", blade_root, blade_tip, 0.050, 0.016, pearl), "hand_fk.R")
    add(tapered_capsule("Refined_BladeRune", (-0.735, -0.247, 0.795), (-1.050, -0.247, 0.475), 0.005, 0.003, cyan, segments=8), "hand_fk.R")
    add(uv_ellipsoid("Refined_SwordPommel", (-0.420, -0.210, 1.115), (0.028, 0.024, 0.030), gold), "hand_fk.R")

    # Matte cloth cape; one small wisp is enough to communicate the spirit route.
    cape = refined_cape("Refined_Cape", materials["cape"])
    add(cape, "spine_fk.003")
    add(uv_ellipsoid("Refined_SpiritWisp", (-0.35, 0.13, 1.49), (0.026, 0.020, 0.050), cyan), "spine_fk.003")

    return parts


RIGIFY_CONTROLS = (
    "root", "torso", "spine_fk.003", "spine_fk.004", "neck", "head",
    "upper_arm_fk.L", "forearm_fk.L", "hand_fk.L",
    "upper_arm_fk.R", "forearm_fk.R", "hand_fk.R",
    "thigh_fk.L", "shin_fk.L", "foot_fk.L",
    "thigh_fk.R", "shin_fk.R", "foot_fk.R",
)


def reset_rigify_pose(rig: bpy.types.Object) -> None:
    for name in RIGIFY_CONTROLS:
        bone = rig.pose.bones.get(name)
        if not bone:
            continue
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    # MPFB's facial rig is detailed and reads slightly large under a great helm.
    # A modest control-scale adjustment preserves anatomy while restoring an
    # approximately 7.5-head armored silhouette.
    rig.pose.bones["head"].scale = (0.90, 0.90, 0.90)
    for name in ("upper_arm_parent.L", "upper_arm_parent.R", "thigh_parent.L", "thigh_parent.R"):
        rig.pose.bones[name]["IK_FK"] = 0.0


def insert_rigify_pose(rig, frame, rotations=None, locations=None):
    reset_rigify_pose(rig)
    for name, value in (rotations or {}).items():
        rig.pose.bones[name].rotation_euler = value
    for name, value in (locations or {}).items():
        rig.pose.bones[name].location = value
    for name in RIGIFY_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)


def build_rigify_actions(rig: bpy.types.Object):
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    rig.animation_data_create()
    actions = {}

    def new_action(name, length):
        clip = bpy.data.actions.new(name=name)
        clip.use_fake_user = True
        rig.animation_data.action = clip
        actions[name] = (clip, length)

    new_action("IDLE", 48)
    for frame, z, sway in ((1, 0.0, -0.012), (13, 0.012, 0.015), (25, 0.0, -0.012), (37, -0.006, 0.010), (49, 0.0, -0.012)):
        insert_rigify_pose(rig, frame, rotations={"spine_fk.003": (0.010, sway, 0.0), "head": (-0.008, -sway * 0.5, 0.0)}, locations={"root": (0.0, 0.0, z)})

    new_action("WALK", 32)
    for frame, z, ll, lr, al, ar in ((1, 0.0, 0.42, -0.42, -0.20, 0.20), (9, 0.028, 0.03, -0.06, -0.02, 0.03), (17, 0.0, -0.42, 0.42, 0.20, -0.20), (25, 0.028, -0.06, 0.03, 0.03, -0.02), (33, 0.0, 0.42, -0.42, -0.20, 0.20)):
        insert_rigify_pose(rig, frame, rotations={"spine_fk.003": (0.035, 0.0, 0.0), "thigh_fk.L": (ll, 0.0, 0.0), "thigh_fk.R": (lr, 0.0, 0.0), "shin_fk.L": (max(0.0, -ll) * 0.75, 0.0, 0.0), "shin_fk.R": (max(0.0, -lr) * 0.75, 0.0, 0.0), "upper_arm_fk.L": (al * 0.30, 0.0, 0.0), "upper_arm_fk.R": (ar, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    new_action("RUN", 24)
    for frame, z, ll, lr, al, ar in ((1, 0.02, 0.70, -0.66, -0.30, 0.48), (7, 0.075, 0.08, -0.10, -0.06, 0.08), (13, 0.02, -0.66, 0.70, 0.30, -0.48), (19, 0.075, -0.10, 0.08, 0.06, -0.08), (25, 0.02, 0.70, -0.66, -0.30, 0.48)):
        insert_rigify_pose(rig, frame, rotations={"spine_fk.003": (0.15, 0.0, 0.0), "thigh_fk.L": (ll, 0.0, 0.0), "thigh_fk.R": (lr, 0.0, 0.0), "shin_fk.L": (max(0.0, -ll) * 1.05, 0.0, 0.0), "shin_fk.R": (max(0.0, -lr) * 1.05, 0.0, 0.0), "upper_arm_fk.L": (al * 0.25, 0.0, 0.0), "upper_arm_fk.R": (ar, 0.0, 0.0), "forearm_fk.R": (-0.22, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    new_action("ATTACK", 32)
    for frame, z, arm_x, arm_y, chest_y in ((1, 0.0, 0.0, 0.0, 0.0), (6, -0.02, 0.55, -0.25, -0.20), (12, 0.01, 1.45, -0.55, -0.32), (17, 0.035, -1.05, 0.28, 0.34), (22, 0.01, -0.60, 0.10, 0.20), (28, 0.0, -0.12, 0.0, 0.04), (33, 0.0, 0.0, 0.0, 0.0)):
        insert_rigify_pose(rig, frame, rotations={"spine_fk.003": (0.04, chest_y, 0.0), "upper_arm_fk.R": (arm_x, arm_y, -0.08), "forearm_fk.R": (-0.34 if frame <= 12 else 0.12, 0.0, 0.0), "upper_arm_fk.L": (-0.06, 0.0, 0.04), "thigh_fk.L": (-0.09 if 12 <= frame <= 22 else 0.0, 0.0, 0.0), "thigh_fk.R": (0.09 if 12 <= frame <= 22 else 0.0, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    new_action("GUARD", 40)
    for frame, z, arm_x, arm_y, chest_x in ((1, 0.0, 0.0, 0.0, 0.0), (8, -0.02, -0.44, -0.18, -0.06), (13, -0.045, -0.82, -0.36, -0.14), (25, -0.042, -0.82, -0.36, -0.14), (33, -0.02, -0.40, -0.17, -0.05), (41, 0.0, 0.0, 0.0, 0.0)):
        active = frame not in (1, 41)
        insert_rigify_pose(rig, frame, rotations={"spine_fk.003": (chest_x, 0.0, 0.0), "upper_arm_fk.L": (arm_x, arm_y, -0.12), "forearm_fk.L": (-0.26, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "upper_arm_fk.R": (0.16, 0.0, 0.0), "thigh_fk.L": (0.07, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "thigh_fk.R": (0.07, 0.0, 0.0) if active else (0.0, 0.0, 0.0)}, locations={"root": (0.0, 0.0, z)})

    for clip, _ in actions.values():
        for layer in clip.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for fcurve in channelbag.fcurves:
                        for key in fcurve.keyframe_points:
                            key.interpolation = "BEZIER"
    rig.animation_data.action = actions["IDLE"][0]
    return actions


def build_neutral_stage(materials):
    floor_material = base.make_material("Neutral Studio Floor", (0.18, 0.19, 0.20, 1.0), metallic=0.0, roughness=0.88)
    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0.0, 0.0, -0.008))
    floor = bpy.context.object
    floor.name = "NeutralStudioFloor"
    base.set_material(floor, floor_material)

    camera_data = bpy.data.cameras.new("NeutralMotionCamera")
    camera = bpy.data.objects.new("NeutralMotionCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (4.10, -8.05, 1.12)
    camera.data.lens = 78
    camera.data.sensor_width = 36
    base.look_at(camera, (0.0, 0.0, 1.06))
    bpy.context.scene.camera = camera

    # Hidden text object preserves compatibility with the shared action renderer.
    bpy.ops.object.text_add()
    label = bpy.context.object
    label.name = "HiddenMotionLabel"
    label.data.body = ""
    label.hide_render = True

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        base.look_at(obj, (0.0, 0.0, 1.0))

    area("NeutralKey", (4.5, -4.5, 6.2), 950, (1.0, 0.90, 0.76), 4.5)
    area("NeutralFill", (-4.0, -2.0, 3.4), 650, (0.55, 0.68, 0.80), 4.0)
    area("NeutralRim", (-1.0, 4.0, 4.5), 900, (0.90, 0.74, 0.50), 3.5)
    return camera, label


def tint_material_preserve_detail(material, target_rgba, factor, roughness):
    """Overlay a palette color while preserving packed texture/normal detail."""
    if material is None or not material.use_nodes:
        return
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for bsdf in [node for node in nodes if node.type == "BSDF_PRINCIPLED"]:
        base_color = bsdf.inputs.get("Base Color")
        if not base_color:
            continue
        incoming = next((link for link in links if link.to_socket == base_color), None)
        if incoming:
            source_socket = incoming.from_socket
            links.remove(incoming)
            mix = nodes.new("ShaderNodeMixRGB")
            mix.name = f"Crusader Tint {bsdf.name}"
            mix.blend_type = "MIX"
            mix.inputs[0].default_value = factor
            mix.inputs[2].default_value = target_rgba
            links.new(source_socket, mix.inputs[1])
            links.new(mix.outputs[0], base_color)
        else:
            base_color.default_value = target_rgba
        roughness_input = bsdf.inputs.get("Roughness")
        if roughness_input and not roughness_input.is_linked:
            roughness_input.default_value = roughness


def recolor_cc0_asset() -> None:
    ivory = (0.84, 0.78, 0.62, 1.0)
    pearl = (0.74, 0.77, 0.73, 1.0)
    gold = (0.78, 0.40, 0.050, 1.0)
    cloth_ivory = (0.69, 0.61, 0.45, 1.0)
    dark = (0.025, 0.035, 0.055, 1.0)
    mappings = {
        "Armor": (ivory, 0.77, 0.50),
        "Black Old Paint": (ivory, 0.73, 0.54),
        "Black Old Paint.001": (ivory, 0.73, 0.54),
        "Black Old Paint.002": (pearl, 0.69, 0.50),
        "Gray Old Paint": (pearl, 0.67, 0.48),
        "Brown Old Paint": (gold, 0.62, 0.45),
        "MetalicSord": (pearl, 0.40, 0.38),
        "UnderCloth": (dark, 0.82, 0.72),
        "Material.010": ((0.48, 0.46, 0.40, 1.0), 0.84, 0.76),
        "Material.011": (ivory, 0.70, 0.52),
        "Material.012": (gold, 0.58, 0.44),
        "Material.014": (ivory, 0.72, 0.52),
        "Material.015": (cloth_ivory, 0.68, 0.65),
        "Material.016": (dark, 0.76, 0.68),
        "ProsteticLeg": (pearl, 0.65, 0.50),
        "ProsteticLegPeice": (gold, 0.50, 0.44),
    }
    for name, (color, factor, roughness) in mappings.items():
        tint_material_preserve_detail(bpy.data.materials.get(name), color, factor, roughness)


def remove_original_sword_blade() -> None:
    """Remove both connected sword and scabbard components from the CC0 body mesh."""
    import bmesh

    obj = bpy.data.objects.get("Plane.029")
    if not obj:
        return
    material_indices = {
        index
        for index, material in enumerate(obj.data.materials)
        if material and material.name == "MetalicSord"
    }
    if not material_indices:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    remaining = set(bm.faces)
    doomed: set = set()
    while remaining:
        seed = remaining.pop()
        component = {seed}
        frontier = [seed]
        while frontier:
            face = frontier.pop()
            for edge in face.edges:
                for neighbor in edge.link_faces:
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.add(neighbor)
                        frontier.append(neighbor)
        vertices = {vertex for face in component for vertex in face.verts}
        xs = [vertex.co.x for vertex in vertices]
        zs = [vertex.co.z for vertex in vertices]
        component_materials = {face.material_index for face in component}
        has_sword_metal = bool(component_materials & material_indices)
        # The separate leather scabbard is a tall, narrow, right-hip component.
        is_scabbard = (
            min(xs) > 0.14
            and max(xs) < 0.50
            and min(zs) < 0.25
            and max(zs) > 0.80
            and (max(zs) - min(zs)) > 0.62
        )
        if has_sword_metal or is_scabbard:
            doomed.update(component)
    doomed_vertices = {vertex for face in doomed for vertex in face.verts}
    bmesh.ops.delete(bm, geom=list(doomed_vertices), context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def build_cc0_crusader_gear(materials, rig):
    parts = []
    add = lambda obj, bone: add_weighted(obj, bone, rig, parts)
    ivory, pearl, gold = materials["ivory"], materials["pearl"], materials["gold"]
    dark, cyan, yellow = materials["dark"], materials["cyan"], materials["yellow"]

    # Compact rounded great helm that fully covers the source sallet.  The
    # narrower lower shell, brow ridge, rivets and rear seam keep it from
    # reading as a featureless egg at gameplay distance.
    add(uv_ellipsoid("CC0_Crusader_HelmetDome", (0.0, -0.022, 1.735), (0.168, 0.158, 0.198), pearl, segments=36, rings=18), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_HelmetFace", (0.0, -0.159, 1.700), (0.144, 0.043, 0.146), ivory, segments=32, rings=16), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_BrowRidge", (0.0, -0.205, 1.777), (0.128, 0.010, 0.010), pearl), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_EyeSlit", (0.0, -0.216, 1.744), (0.116, 0.009, 0.009), dark), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_EyeBandUpper", (0.0, -0.219, 1.758), (0.124, 0.009, 0.005), gold), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_EyeBandLower", (0.0, -0.219, 1.730), (0.124, 0.009, 0.005), gold), "Middle.005")
    add(uv_ellipsoid("CC0_Crusader_HelmetCrossV", (0.0, -0.221, 1.720), (0.018, 0.009, 0.158), gold), "Middle.005")
    add(tapered_capsule("CC0_Crusader_HelmetRidge", (0.0, -0.105, 1.910), (0.0, 0.095, 1.910), 0.010, 0.008, gold, segments=12), "Middle.005")
    add(tapered_capsule("CC0_Crusader_RearHelmetSeam", (0.0, 0.146, 1.600), (0.0, 0.156, 1.866), 0.006, 0.004, gold, segments=10), "Middle.005")
    for index, (x, y, z) in enumerate((
        (-0.112, -0.135, 1.596), (-0.040, -0.165, 1.585),
        (0.040, -0.165, 1.585), (0.112, -0.135, 1.596),
        (-0.105, 0.120, 1.598), (-0.035, 0.151, 1.586),
        (0.035, 0.151, 1.586), (0.105, 0.120, 1.598),
    ), start=1):
        add(uv_ellipsoid(f"CC0_Crusader_HelmetRivet_{index:02d}", (x, y, z), (0.006, 0.004, 0.006), gold, segments=12, rings=6), "Middle.005")

    # 1.40 m x 0.70 m shield: pulled 15 cm toward the forearm, opened 15
    # degrees in idle, and equipped with two rear braces plus a visible grip.
    shield_center = (-0.500, -0.300, 1.020)
    shield_pivot = (-0.405, -0.175, 1.035)
    shield_yaw = math.radians(15.0)

    def shield_add(obj):
        rotate_mesh_about_point(obj, shield_pivot, shield_yaw)
        return add(obj, "LArmR.003")

    shield_add(curved_shield("CC0_Crusader_ShieldBack", shield_center, 0.78, 1.20, materials["leather"], bulge=0.120, depth=0.060))
    shield_add(curved_shield("CC0_Crusader_ShieldGoldRim", (-0.500, -0.334, 1.020), 0.75, 1.18, gold, bulge=0.114, depth=0.038))
    shield_add(curved_shield("CC0_Crusader_ShieldFace", (-0.500, -0.372, 1.020), 0.70, 1.15, ivory, bulge=0.108, depth=0.028))
    shield_add(uv_ellipsoid("CC0_Crusader_ShieldCrossV", (-0.500, -0.514, 1.045), (0.027, 0.012, 0.350), yellow))
    shield_add(uv_ellipsoid("CC0_Crusader_ShieldCrossH", (-0.500, -0.522, 1.170), (0.180, 0.013, 0.028), yellow))
    shield_add(uv_ellipsoid("CC0_Crusader_ShieldRune", (-0.500, -0.540, 1.170), (0.032, 0.014, 0.032), cyan))
    shield_add(tapered_capsule("CC0_Crusader_ShieldBraceUpper", (-0.785, -0.205, 1.270), (-0.220, -0.205, 1.270), 0.028, 0.028, gold, segments=12))
    shield_add(tapered_capsule("CC0_Crusader_ShieldBraceLower", (-0.755, -0.200, 0.805), (-0.250, -0.200, 0.805), 0.026, 0.026, gold, segments=12))
    shield_add(tapered_capsule("CC0_Crusader_ShieldGrip", (-0.405, -0.160, 0.915), (-0.405, -0.160, 1.155), 0.022, 0.020, dark, segments=12))
    shield_add(tapered_capsule("CC0_Crusader_ShieldForearmStrap", (-0.585, -0.170, 1.080), (-0.370, -0.170, 1.080), 0.017, 0.017, materials["leather"], segments=12))

    # 1.47 m one-handed claymore with a 1.15 m narrow tapered blade.
    blade_root, blade_tip = (0.610, -0.225, 0.895), (1.455, -0.225, 0.055)
    add(tapered_capsule("CC0_Crusader_SwordGrip", (0.405, -0.200, 1.105), blade_root, 0.024, 0.020, materials["leather"], segments=14), "LArmR.001")
    add(tapered_capsule("CC0_Crusader_SwordGuard", (0.505, -0.225, 1.000), (0.720, -0.225, 0.785), 0.014, 0.014, gold, segments=12), "LArmR.001")
    add(blade_mesh("CC0_Crusader_ClaymoreBlade", blade_root, blade_tip, 0.050, 0.016, pearl), "LArmR.001")
    add(tapered_capsule("CC0_Crusader_BladeRune", (0.720, -0.237, 0.785), (1.055, -0.237, 0.450), 0.005, 0.003, cyan, segments=8), "LArmR.001")
    add(uv_ellipsoid("CC0_Crusader_SwordPommel", (0.395, -0.200, 1.115), (0.027, 0.023, 0.029), gold), "LArmR.001")

    # One restrained cyan wisp keeps the spirit route at roughly three percent.
    add(uv_ellipsoid("CC0_Crusader_SpiritWisp", (-0.32, 0.12, 1.49), (0.026, 0.020, 0.050), cyan), "Middle.004")
    return parts


CC0_CONTROLS = (
    "Bottem", "Middle", "Middle.001", "Middle.003", "Middle.004", "Middle.005",
    "UArmR", "LArmR", "LArmR.001", "UArmR.001", "LArmR.002", "LArmR.003",
    "UlegR", "LLegR", "FootR", "UlegR.001", "LLegR.001", "FootR.001",
)


def reset_cc0_pose(rig):
    for name in CC0_CONTROLS:
        bone = rig.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def insert_cc0_pose(rig, frame, rotations=None, locations=None):
    reset_cc0_pose(rig)
    for name, value in (rotations or {}).items():
        rig.pose.bones[name].rotation_euler = value
    for name, value in (locations or {}).items():
        rig.pose.bones[name].location = value
    for name in CC0_CONTROLS:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)


def build_cc0_actions(rig):
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for name in ("Middle", "LArmR", "LArmR.002", "LLegR", "LLegR.001"):
        for constraint in rig.pose.bones[name].constraints:
            if constraint.type == "IK":
                constraint.influence = 0.0
    rig.animation_data_create()
    actions = {}

    def new_action(name, length):
        clip = bpy.data.actions.new(name=name)
        clip.use_fake_user = True
        rig.animation_data.action = clip
        actions[name] = (clip, length)

    new_action("IDLE", 48)
    for frame, z, sway in ((1, 0.0, -0.012), (13, 0.012, 0.014), (25, 0.0, -0.012), (37, -0.006, 0.009), (49, 0.0, -0.012)):
        insert_cc0_pose(rig, frame, rotations={"Middle.003": (0.010, sway, 0.0), "Middle.005": (-0.008, -sway * 0.5, 0.0)}, locations={"Bottem": (0.0, 0.0, z / rig.scale.z)})

    new_action("WALK", 32)
    for frame, z, ll, lr, al, ar in ((1, 0.0, 0.42, -0.42, -0.20, 0.20), (9, 0.025, 0.03, -0.06, -0.02, 0.03), (17, 0.0, -0.42, 0.42, 0.20, -0.20), (25, 0.025, -0.06, 0.03, 0.03, -0.02), (33, 0.0, 0.42, -0.42, -0.20, 0.20)):
        insert_cc0_pose(rig, frame, rotations={"Middle.003": (0.03, 0.0, 0.0), "UlegR": (ll, 0.0, 0.0), "UlegR.001": (lr, 0.0, 0.0), "LLegR": (max(0.0, -ll) * 0.72, 0.0, 0.0), "LLegR.001": (max(0.0, -lr) * 0.72, 0.0, 0.0), "UArmR": (al * 0.30, 0.0, 0.0), "UArmR.001": (ar, 0.0, 0.0)}, locations={"Bottem": (0.0, 0.0, z / rig.scale.z)})

    new_action("RUN", 24)
    for frame, z, ll, lr, al, ar in ((1, 0.02, 0.68, -0.64, -0.28, 0.46), (7, 0.070, 0.08, -0.10, -0.06, 0.08), (13, 0.02, -0.64, 0.68, 0.28, -0.46), (19, 0.070, -0.10, 0.08, 0.06, -0.08), (25, 0.02, 0.68, -0.64, -0.28, 0.46)):
        insert_cc0_pose(rig, frame, rotations={"Middle.003": (0.14, 0.0, 0.0), "UlegR": (ll, 0.0, 0.0), "UlegR.001": (lr, 0.0, 0.0), "LLegR": (max(0.0, -ll), 0.0, 0.0), "LLegR.001": (max(0.0, -lr), 0.0, 0.0), "UArmR": (al * 0.25, 0.0, 0.0), "UArmR.001": (ar, 0.0, 0.0), "LArmR": (-0.20, 0.0, 0.0)}, locations={"Bottem": (0.0, 0.0, z / rig.scale.z)})

    new_action("ATTACK", 32)
    # Diagonal preparation, right-side backswing, then a top-right to
    # bottom-left cut.  The frame-6/17 poses are based on the approved X/Z pose
    # study, while frame 12 clears the blade to the sword side before impact.
    for frame, z, arm_x, arm_y, arm_z, elbow, shield_y, chest_y in (
        (1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.00, 0.0),
        (6, -0.02, 0.55, 0.00, 0.32, -0.12, 0.10, -0.08),
        (12, 0.01, -0.82, 0.22, -0.05, 0.08, 0.22, -0.18),
        (17, 0.03, 1.02, 0.00, 0.62, -0.18, 0.25, 0.30),
        (22, 0.01, 0.70, 0.02, 0.42, -0.08, 0.18, 0.18),
        (28, 0.0, -0.10, 0.0, 0.0, 0.04, 0.05, 0.04),
        (33, 0.0, 0.0, 0.0, 0.0, 0.0, 0.00, 0.0),
    ):
        insert_cc0_pose(rig, frame, rotations={"Middle.003": (0.04, chest_y, 0.0), "UArmR": (arm_x, arm_y, arm_z), "LArmR": (elbow, 0.0, 0.0), "UArmR.001": (0.0, shield_y, 0.0), "UlegR": (-0.08 if 12 <= frame <= 22 else 0.0, 0.0, 0.0), "UlegR.001": (0.08 if 12 <= frame <= 22 else 0.0, 0.0, 0.0)}, locations={"Bottem": (0.0, 0.0, z / rig.scale.z)})

    new_action("GUARD", 40)
    # Twist the shield arm around its local Y axis instead of lifting around X;
    # that carries the shield toward center while preserving its vertical face.
    for frame, z, arm_y, chest_x in ((1, 0.0, 0.0, 0.0), (8, -0.02, -0.28, -0.05), (13, -0.04, -0.52, -0.12), (25, -0.038, -0.52, -0.12), (33, -0.02, -0.25, -0.04), (41, 0.0, 0.0, 0.0)):
        active = frame not in (1, 41)
        insert_cc0_pose(rig, frame, rotations={"Middle.003": (chest_x, 0.0, 0.0), "UArmR.001": (0.0, arm_y, 0.0), "LArmR.002": (-0.18, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "UArmR": (0.10, 0.0, 0.0), "UlegR": (0.05, 0.0, 0.0) if active else (0.0, 0.0, 0.0), "UlegR.001": (0.05, 0.0, 0.0) if active else (0.0, 0.0, 0.0)}, locations={"Bottem": (0.0, 0.0, z / rig.scale.z)})

    for clip, _ in actions.values():
        for layer in clip.layers:
            for strip in layer.strips:
                for channelbag in strip.channelbags:
                    for fcurve in channelbag.fcurves:
                        for key in fcurve.keyframe_points:
                            key.interpolation = "BEZIER"
    rig.animation_data.action = actions["IDLE"][0]
    return actions


def build_scene():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    cc0_source = REPO_ROOT / "tools" / "runtime" / "asset-sources" / "blendkit-armored-adventurer" / "armored-adventurer-1k.blend"
    if not cc0_source.exists():
        raise FileNotFoundError(f"CC0 rigged knight base is missing: {cc0_source}")
    bpy.ops.wm.open_mainfile(filepath=str(cc0_source), load_ui=False)
    materials = build_materials()
    armature = bpy.data.objects["The Armored Adventurer"]
    source_scale = armature.scale.copy()
    height_factor = 1.1905
    armature.scale = (
        source_scale.x * height_factor * 1.08 * 1.06,
        source_scale.y * height_factor * 1.05,
        source_scale.z * height_factor,
    )
    remove_original_sword_blade()
    recolor_cc0_asset()
    bpy.data.objects["Plane.029"].name = "Crusader_CC0_ArmorBody"
    bpy.data.objects["Person.009"].name = "Crusader_CC0_AccessoryMesh"
    armature.name = "Crusader_CC0_Rig_v2"
    armature["source"] = "BlendKit The Armored Adventurer CC0"
    armature["character_height_m"] = 1.90
    armature["body_width_scale"] = 1.1448
    armature["body_depth_scale"] = 1.05
    armature["source_bones"] = 65
    parts = build_cc0_crusader_gear(materials, armature)
    actions = build_cc0_actions(armature)
    camera, label = build_neutral_stage(materials)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = base.RENDER_SIZE
    scene.render.resolution_y = base.RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.fps = base.FPS
    scene.render.film_transparent = False
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.15
    if scene.world is None:
        scene.world = bpy.data.worlds.new("CrusaderNeutralWorld")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.11, 0.12, 0.13, 1.0)
        background.inputs["Strength"].default_value = 0.38
    camera.location = (4.10, -8.05, 1.12)
    camera.data.lens = 80
    base.look_at(camera, (0.0, 0.0, 1.05))
    for name, energy in (("NeutralKey", 860), ("NeutralFill", 520), ("NeutralRim", 650)):
        if bpy.data.objects.get(name):
            bpy.data.objects[name].data.energy = energy
    return armature, actions, camera, label, parts


def render_preview(armature, actions, camera, label):
    scene = bpy.context.scene
    armature.animation_data.action = actions["IDLE"][0]
    scene.frame_start = 1
    scene.frame_end = actions["IDLE"][1]
    scene.frame_set(1)
    label.data.body = ""
    camera.location = (3.85, -7.55, 1.12)
    base.look_at(camera, (0.0, 0.0, 1.06))
    scene.render.filepath = str(OUTPUT_DIR / "crusader_v2_front_3q.png")
    bpy.ops.render.render(write_still=True)
    camera.location = (-4.10, 8.05, 1.12)
    base.look_at(camera, (0.0, 0.02, 1.06))
    scene.render.filepath = str(OUTPUT_DIR / "crusader_v2_back_3q.png")
    bpy.ops.render.render(write_still=True)
    camera.location = (4.10, -8.05, 1.12)
    base.look_at(camera, (0.0, 0.0, 1.06))
    scene.render.filepath = str(OUTPUT_DIR / "crusader_v2_preview.png")
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def finalize_manifest_and_zip(parts, actions):
    manifest_path = OUTPUT_DIR / "render_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    skinned_objects = [
        bpy.data.objects.get("Crusader_CC0_ArmorBody"),
        bpy.data.objects.get("Crusader_CC0_AccessoryMesh"),
    ]
    skinned_objects = [obj for obj in skinned_objects if obj is not None]
    manifest["model"].pop("rigid_mesh_parts", None)
    manifest["model"].update({
        "blend": BLEND_PATH.name,
        "source": "BlendKit - The Armored Adventurer",
        "source_license": "CC0",
        "armature_bones": 65,
        "skinned_meshes": len(skinned_objects),
        "skinned_polygons": sum(len(obj.data.polygons) for obj in skinned_objects),
        "rigid_accessory_parts": len(parts),
        "character_height_m": 1.90,
        "body_width_scale": 1.1448,
        "body_depth_scale": 1.05,
        "silhouette": "realistic armored human",
        "texture_treatment": "packed 1K source texture and normal detail retained under ivory-gold tint overlays",
        "equipment": {
            "helmet": "rounded cross great helm",
            "shield": "1.40 m curved leather-backed great shield with braces and grip",
            "sword": "1.47 m thin one-handed claymore",
        },
    })
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    zip_path = OUTPUT_DIR / "crusader-3d-v2-prototype.zip"
    deliverables = [
        BLEND_PATH,
        OUTPUT_DIR / "crusader_keyposes.png",
        OUTPUT_DIR / "crusader_motion_preview.mp4",
        OUTPUT_DIR / "preview.png",
        OUTPUT_DIR / "crusader_v2_preview.png",
        OUTPUT_DIR / "crusader_v2_front_3q.png",
        OUTPUT_DIR / "crusader_v2_back_3q.png",
        manifest_path,
    ]
    deliverables.extend(OUTPUT_DIR / f"crusader_{name.lower()}.mp4" for name in actions)
    readme = OUTPUT_DIR / "README.md"
    if readme.exists():
        deliverables.append(readme)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in deliverables:
            archive.write(path, arcname=path.name)


def main():
    preview_only = "--preview-only" in sys.argv
    armature, actions, camera, label, parts = build_scene()
    render_preview(armature, actions, camera, label)
    if preview_only:
        print(f"CRUSADER_V2_PREVIEW={OUTPUT_DIR / 'crusader_v2_preview.png'}")
        return
    base.render_actions(armature, actions, label)
    base.encode_and_validate(actions)
    finalize_manifest_and_zip(parts, actions)
    print(f"CRUSADER_V2_COMPLETE={OUTPUT_DIR}")


if __name__ == "__main__":
    main()

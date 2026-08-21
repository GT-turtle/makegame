"""Build and render a human-proportioned Crusader from the CC0 Armored Adventurer.

This variant deliberately keeps the detailed source body, skinning and textures.
Only the project-specific palette, helmet, shield, sword and five prototype Actions
are added.  Run from the repository root with Blender 5.2 LTS:

    blender --background --python scripts/render_crusader_adventurer_v3.py -- --preview-only
    blender --background --python scripts/render_crusader_adventurer_v3.py -- --full
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

import bmesh
import bpy
from mathutils import Matrix, Vector


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = (
    REPO_ROOT
    / "tools"
    / "runtime"
    / "asset-sources"
    / "blendkit-armored-adventurer"
    / "armored-adventurer-1k.blend"
)
SOURCE_RECORD = SOURCE_BLEND.with_name("SOURCE.md")
OUTPUT_DIR = REPO_ROOT / "artifacts" / "crusader-3d-v3"
FRAMES_DIR = OUTPUT_DIR / "frames"
BLEND_PATH = OUTPUT_DIR / "crusader_adventurer_v3.blend"
PREVIEW_FRONT = OUTPUT_DIR / "crusader_v3_front_3q.png"
PREVIEW_BACK = OUTPUT_DIR / "crusader_v3_back_3q.png"
PREVIEW_SIDE = OUTPUT_DIR / "crusader_v3_side.png"
COMBINED_MP4 = OUTPUT_DIR / "crusader_v3_motion_preview.mp4"
KEYPOSES_PATH = OUTPUT_DIR / "crusader_v3_keyposes.png"
ZIP_PATH = OUTPUT_DIR / "crusader-adventurer-v3-prototype.zip"
FFMPEG_PATH = (
    REPO_ROOT
    / "tools"
    / "runtime"
    / "ffmpeg-9.0.1-essentials_build"
    / "bin"
    / "ffmpeg.exe"
)
FFPROBE_PATH = FFMPEG_PATH.with_name("ffprobe.exe")

FPS = 24
RENDER_SIZE = 720
ACTION_ORDER = ("IDLE", "WALK", "RUN", "ATTACK", "GUARD")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--full", action="store_true")
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(args)


def srgb(hex_color: str) -> tuple[float, float, float, float]:
    value = hex_color.strip().lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255.0 for index in (0, 2, 4)) + (1.0,)


PALETTE = {
    "ivory": srgb("F2E8CD"),
    "pearl": srgb("FFF9E9"),
    "yellow": srgb("F5C943"),
    "gold": srgb("C99622"),
    "gold_dark": srgb("7C5415"),
    "iron": srgb("252B32"),
    "cloth": srgb("202B3B"),
    "leather": srgb("493429"),
    "slit": srgb("0A0D12"),
    "cyan": srgb("56E6ED"),
    "floor": srgb("E8E3D9"),
}


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.45,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in shader.inputs:
        shader.inputs["Coat Weight"].default_value = 0.18 if metallic else 0.06
    if emission_strength:
        if "Emission Color" in shader.inputs:
            shader.inputs["Emission Color"].default_value = color
        elif "Emission" in shader.inputs:
            shader.inputs["Emission"].default_value = color
        shader.inputs["Emission Strength"].default_value = emission_strength
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    material.diffuse_color = color
    return material


def build_project_materials() -> dict[str, bpy.types.Material]:
    return {
        "ivory": make_material("V3_IvoryPlate", PALETTE["ivory"], metallic=0.68, roughness=0.28),
        "pearl": make_material("V3_PearlSteel", PALETTE["pearl"], metallic=0.82, roughness=0.22),
        "yellow": make_material("V3_SunYellow", PALETTE["yellow"], metallic=0.58, roughness=0.25),
        "gold": make_material("V3_HeraldicGold", PALETTE["gold"], metallic=0.85, roughness=0.22),
        "gold_dark": make_material("V3_AntiqueGold", PALETTE["gold_dark"], metallic=0.75, roughness=0.34),
        "iron": make_material("V3_DarkIron", PALETTE["iron"], metallic=0.70, roughness=0.40),
        "cloth": make_material("V3_DarkCloth", PALETTE["cloth"], metallic=0.0, roughness=0.82),
        "leather": make_material("V3_Leather", PALETTE["leather"], metallic=0.0, roughness=0.64),
        "slit": make_material("V3_HelmetSlit", PALETTE["slit"], metallic=0.10, roughness=0.30),
        "cyan": make_material("V3_SpiritCyan", PALETTE["cyan"], metallic=0.22, roughness=0.22, emission_strength=3.5),
        "floor": make_material("V3_NeutralFloor", PALETTE["floor"], roughness=0.84),
    }


def tint_existing_material(
    material: bpy.types.Material,
    color: tuple[float, float, float, float],
    *,
    mix_factor: float,
    metallic: float,
    roughness: float,
) -> None:
    """Blend a bright palette shader over the original textured shader."""
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL" and node.is_active_output), None)
    if output is None:
        output = nodes.new("ShaderNodeOutputMaterial")
    surface = output.inputs.get("Surface")
    if surface is None:
        return
    existing_link = surface.links[0] if surface.links else None
    tint = nodes.new("ShaderNodeBsdfPrincipled")
    tint.name = "V3 Palette Tint"
    tint.inputs["Base Color"].default_value = color
    tint.inputs["Metallic"].default_value = metallic
    tint.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in tint.inputs:
        tint.inputs["Coat Weight"].default_value = 0.12
    if existing_link is None:
        links.new(tint.outputs["BSDF"], surface)
    else:
        source_socket = existing_link.from_socket
        links.remove(existing_link)
        mixer = nodes.new("ShaderNodeMixShader")
        mixer.name = "V3 Texture Preservation Mix"
        mixer.inputs[0].default_value = mix_factor
        links.new(source_socket, mixer.inputs[1])
        links.new(tint.outputs["BSDF"], mixer.inputs[2])
        links.new(mixer.outputs[0], surface)
    material.diffuse_color = color


def recolor_source_materials() -> None:
    # Polygon-area weighted intent: ivory 50%, yellow/gold 32%, dark 15%, cyan 3%.
    assignments = {
        "Material.010": ("ivory", 0.68, 0.62, 0.31),
        "Black Old Paint": ("ivory", 0.70, 0.68, 0.30),
        "Material.011": ("gold", 0.70, 0.78, 0.27),
        "Material.012": ("cyan", 0.68, 0.25, 0.28),
        "Material.014": ("cloth", 0.68, 0.02, 0.70),
        "Brown Old Paint": ("gold_dark", 0.62, 0.62, 0.38),
        "Material.015": ("ivory", 0.66, 0.62, 0.32),
        "Black Old Paint.002": ("gold", 0.68, 0.78, 0.28),
        "Black Old Paint.001": ("gold_dark", 0.66, 0.72, 0.34),
        "Material.016": ("cloth", 0.62, 0.02, 0.76),
        "MetalicSord": ("pearl", 0.52, 0.82, 0.23),
        "Gray Old Paint": ("gold", 0.58, 0.76, 0.28),
    }
    for material_name, (palette_name, mix_factor, metallic, roughness) in assignments.items():
        material = bpy.data.materials.get(material_name)
        if material is not None:
            tint_existing_material(
                material,
                PALETTE[palette_name],
                mix_factor=mix_factor,
                metallic=metallic,
                roughness=roughness,
            )


def connected_face_components(mesh: bpy.types.Mesh) -> list[list[int]]:
    vertex_faces: list[list[int]] = [[] for _ in mesh.vertices]
    for face in mesh.polygons:
        for vertex_index in face.vertices:
            vertex_faces[vertex_index].append(face.index)
    visited: set[int] = set()
    components: list[list[int]] = []
    for seed in mesh.polygons:
        if seed.index in visited:
            continue
        stack = [seed.index]
        visited.add(seed.index)
        faces: list[int] = []
        while stack:
            face_index = stack.pop()
            faces.append(face_index)
            for vertex_index in mesh.polygons[face_index].vertices:
                for neighbor in vertex_faces[vertex_index]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        stack.append(neighbor)
        components.append(faces)
    return components


def remove_source_helmet_shield_and_sword(mesh_object: bpy.types.Object) -> None:
    """Delete only disconnected components positively identified by source bounds."""
    mesh = mesh_object.data
    remove_face_indices: set[int] = set()
    removed: list[tuple[str, int]] = []
    for component in connected_face_components(mesh):
        vertex_indices = {
            vertex_index for face_index in component for vertex_index in mesh.polygons[face_index].vertices
        }
        coords = [mesh.vertices[index].co for index in vertex_indices]
        minimum = Vector(tuple(min(point[axis] for point in coords) for axis in range(3)))
        maximum = Vector(tuple(max(point[axis] for point in coords) for axis in range(3)))
        face_count = len(component)

        # Original round shield: isolated 618-face component on source left forearm.
        is_shield = (
            560 <= face_count <= 700
            and maximum.x < -0.20
            and minimum.z > 0.64
            and maximum.z < 1.14
            and (maximum.y - minimum.y) > 0.30
        )
        # Original sword and its hilt: isolated 153-face component on source right.
        is_sword = (
            120 <= face_count <= 190
            and minimum.x > 0.14
            and minimum.z < 0.20
            and maximum.z < 1.15
            and maximum.y > 0.20
        )
        # Three isolated pointed-helmet shell components, later replaced by a round helm.
        is_helmet = (
            face_count >= 180
            and minimum.z >= 1.35
            and maximum.z <= 1.61
            and max(abs(minimum.x), abs(maximum.x)) < 0.11
            and maximum.y < 0.12
        )
        if is_shield or is_sword or is_helmet:
            remove_face_indices.update(component)
            removed.append(("shield" if is_shield else "sword" if is_sword else "helmet", face_count))

    if not remove_face_indices:
        raise RuntimeError("The source equipment components were not found; refusing an unsafe geometry edit")
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    faces = [bm.faces[index] for index in sorted(remove_face_indices)]
    bmesh.ops.delete(bm, geom=faces, context="FACES")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    print("V3_REMOVED_SOURCE_COMPONENTS", removed)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_bevel(object_: bpy.types.Object, width: float, segments: int = 3) -> bpy.types.Object:
    modifier = object_.modifiers.new("V3 edge softness", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    return object_


def shade_smooth(object_: bpy.types.Object) -> None:
    if object_.type != "MESH":
        return
    for polygon in object_.data.polygons:
        polygon.use_smooth = True


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    bevel: float = 0.01,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        add_bevel(object_, bevel, 4)
    object_.data.materials.append(material)
    return object_


def add_uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.0, location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    shade_smooth(object_)
    object_.data.materials.append(material)
    return object_


def add_cylinder_between(
    name: str,
    start: tuple[float, float, float] | Vector,
    end: tuple[float, float, float] | Vector,
    radius: float,
    material: bpy.types.Material,
    *,
    vertices: int = 32,
) -> bpy.types.Object:
    start_vector, end_vector = Vector(start), Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    object_ = bpy.context.object
    object_.name = name
    object_.rotation_mode = "QUATERNION"
    object_.rotation_quaternion = direction.to_track_quat("Z", "Y")
    shade_smooth(object_)
    add_bevel(object_, radius * 0.18, 3)
    object_.data.materials.append(material)
    return object_


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    bevel_depth: float,
    material: bpy.types.Material,
    *,
    cyclic: bool = False,
    resolution: int = 2,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bezier, point in zip(spline.bezier_points, points):
        bezier.co = point
        bezier.handle_left_type = "AUTO"
        bezier.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(object_)
    object_.data.materials.append(material)
    return object_


def add_shield_face(materials: dict[str, bpy.types.Material]) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    center_x, center_y, center_z = -0.54, -0.26, 0.93
    rows = [
        (0.69, 0.25),
        (0.60, 0.33),
        (0.30, 0.36),
        (-0.10, 0.34),
        (-0.43, 0.27),
        (-0.66, 0.09),
        (-0.71, 0.00),
    ]
    columns = (-1.0, -0.52, 0.0, 0.52, 1.0)
    vertices: list[tuple[float, float, float]] = []
    for z_offset, half_width in rows:
        for column in columns:
            x = center_x + half_width * column
            # A shallow convex bow, not a flat toy panel.
            y = center_y + 0.095 * abs(column) ** 1.65
            vertices.append((x, y, center_z + z_offset))
    faces: list[tuple[int, int, int, int]] = []
    width = len(columns)
    for row in range(len(rows) - 1):
        for column in range(width - 1):
            top_left = row * width + column
            top_right = top_left + 1
            bottom_left = (row + 1) * width + column
            bottom_right = bottom_left + 1
            faces.append((top_left, bottom_left, bottom_right, top_right))
    mesh = bpy.data.meshes.new("V3_GothicShieldMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    shield = bpy.data.objects.new("V3_GothicShield", mesh)
    bpy.context.collection.objects.link(shield)
    shield.data.materials.append(materials["ivory"])
    shade_smooth(shield)
    solidify = shield.modifiers.new("Forged shield thickness", "SOLIDIFY")
    solidify.thickness = 0.055
    solidify.offset = 0.35
    add_bevel(shield, 0.018, 4)

    # Continuous gold rim follows the sculpted outline.
    outline: list[tuple[float, float, float]] = []
    for row, (z_offset, half_width) in enumerate(rows):
        column = -1.0 if half_width else 0.0
        outline.append((center_x + half_width * column, center_y + 0.095 * abs(column) ** 1.65 - 0.035, center_z + z_offset))
    for z_offset, half_width in reversed(rows[:-1]):
        column = 1.0 if half_width else 0.0
        outline.append((center_x + half_width * column, center_y + 0.095 * abs(column) ** 1.65 - 0.035, center_z + z_offset))
    rim = add_curve("V3_ShieldGoldRim", outline, 0.020, materials["gold"], cyclic=True)

    cross_vertical = add_box(
        "V3_ShieldCrossVertical",
        (center_x, center_y - 0.118, center_z + 0.05),
        (0.075, 0.026, 0.77),
        materials["gold"],
        bevel=0.018,
    )
    cross_horizontal = add_box(
        "V3_ShieldCrossHorizontal",
        (center_x, center_y - 0.124, center_z + 0.19),
        (0.47, 0.028, 0.078),
        materials["gold"],
        bevel=0.020,
    )
    inset = add_box(
        "V3_ShieldCrossInset",
        (center_x, center_y - 0.145, center_z + 0.19),
        (0.055, 0.018, 0.055),
        materials["cyan"],
        bevel=0.012,
    )
    return shield, [rim, cross_vertical, cross_horizontal, inset]


def add_tapered_blade(
    name: str,
    base: Vector,
    tip: Vector,
    base_width: float,
    thickness: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    direction = tip - base
    length = direction.length
    half_width = base_width * 0.5
    half_thickness = thickness * 0.5
    vertices = [
        (-half_width, -half_thickness, 0.0),
        (half_width, -half_thickness, 0.0),
        (half_width, half_thickness, 0.0),
        (-half_width, half_thickness, 0.0),
        (-0.010, -half_thickness * 0.55, length - 0.08),
        (0.010, -half_thickness * 0.55, length - 0.08),
        (0.010, half_thickness * 0.55, length - 0.08),
        (-0.010, half_thickness * 0.55, length - 0.08),
        (0.0, 0.0, length),
    ]
    faces = [
        (0, 1, 2, 3),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
        (4, 8, 5),
        (5, 8, 6),
        (6, 8, 7),
        (7, 8, 4),
    ]
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(object_)
    object_.location = base
    object_.rotation_mode = "QUATERNION"
    object_.rotation_quaternion = direction.to_track_quat("Z", "Y")
    object_.data.materials.append(material)
    add_bevel(object_, 0.006, 3)
    return object_


def parent_keep_world(child: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = world


def parent_to_bone_keep_world(child: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    world = child.matrix_world.copy()
    child.parent = armature
    child.parent_type = "BONE"
    child.parent_bone = bone_name
    child.matrix_world = world


def assembly_pivot(name: str, location: Vector, armature: bpy.types.Object, bone_name: str) -> bpy.types.Object:
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = location
    parent_to_bone_keep_world(pivot, armature, bone_name)
    return pivot


def attach_assembly(objects: list[bpy.types.Object], pivot: bpy.types.Object) -> None:
    for object_ in objects:
        parent_keep_world(object_, pivot)


def build_round_cross_helmet(
    materials: dict[str, bpy.types.Material], armature: bpy.types.Object
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []
    shell = add_uv_sphere("V3_RoundCrossHelm", (0.0, -0.022, 1.735), (0.205, 0.185, 0.245), materials["ivory"])
    parts.append(shell)

    # A restrained gold brow and neck ring break up the ivory shell.
    brow = add_curve(
        "V3_HelmetGoldBrow",
        [(-0.174, -0.167, 1.790), (0.0, -0.213, 1.805), (0.174, -0.167, 1.790)],
        0.014,
        materials["gold"],
    )
    parts.append(brow)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.173,
        minor_radius=0.012,
        major_segments=64,
        minor_segments=12,
        location=(0.0, -0.015, 1.525),
    )
    neck_ring = bpy.context.object
    neck_ring.name = "V3_HelmetNeckRing"
    neck_ring.scale.y = 0.88
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    neck_ring.data.materials.append(materials["gold"])
    parts.append(neck_ring)

    # Gold-bordered, dark cross-shaped breathing/vision slit from eyes to mouth.
    parts.extend(
        [
            add_box("V3_HelmetCrossGoldH", (0.0, -0.211, 1.775), (0.315, 0.020, 0.060), materials["gold"], bevel=0.014),
            add_box("V3_HelmetCrossGoldV", (0.0, -0.216, 1.714), (0.063, 0.022, 0.205), materials["gold"], bevel=0.014),
            add_box("V3_HelmetCrossSlitH", (0.0, -0.225, 1.775), (0.275, 0.018, 0.029), materials["slit"], bevel=0.006),
            add_box("V3_HelmetCrossSlitV", (0.0, -0.230, 1.710), (0.031, 0.019, 0.169), materials["slit"], bevel=0.006),
        ]
    )
    ridge = add_curve(
        "V3_HelmetCrownRidge",
        [(0.0, -0.205, 1.82), (0.0, -0.135, 1.925), (0.0, 0.015, 1.980), (0.0, 0.145, 1.885)],
        0.013,
        materials["gold"],
    )
    parts.append(ridge)
    side_ridge_left = add_curve(
        "V3_HelmetSideRidgeL",
        [(-0.15, -0.12, 1.84), (-0.19, -0.02, 1.75), (-0.16, 0.08, 1.62)],
        0.010,
        materials["gold_dark"],
    )
    side_ridge_right = add_curve(
        "V3_HelmetSideRidgeR",
        [(0.15, -0.12, 1.84), (0.19, -0.02, 1.75), (0.16, 0.08, 1.62)],
        0.010,
        materials["gold_dark"],
    )
    parts.extend([side_ridge_left, side_ridge_right])
    pivot = assembly_pivot("V3_HelmetPivot", Vector((0.0, -0.02, 1.73)), armature, "Middle.005")
    attach_assembly(parts, pivot)
    return [pivot, *parts]


def build_shield(
    materials: dict[str, bpy.types.Material], armature: bpy.types.Object
) -> list[bpy.types.Object]:
    shield, decorations = add_shield_face(materials)
    parts = [shield, *decorations]
    # The grip remains mostly hidden behind the hand but reads in the back view.
    grip = add_cylinder_between(
        "V3_ShieldGrip",
        (-0.50, -0.065, 0.72),
        (-0.50, -0.065, 1.10),
        0.024,
        materials["leather"],
        vertices=24,
    )
    parts.append(grip)
    pivot = assembly_pivot("V3_ShieldPivot", Vector((-0.41, -0.05, 0.93)), armature, "LArmR.003")
    attach_assembly(parts, pivot)
    return [pivot, *parts]


def build_claymore(
    materials: dict[str, bpy.types.Material], armature: bpy.types.Object
) -> list[bpy.types.Object]:
    hand = Vector((0.41, -0.08, 0.93))
    blade_axis = Vector((0.70, 0.02, -0.714)).normalized()
    blade_base = hand + blade_axis * 0.08
    blade_tip = blade_base + blade_axis * 1.16
    parts: list[bpy.types.Object] = []
    blade = add_tapered_blade("V3_ThinClaymoreBlade", blade_base, blade_tip, 0.105, 0.027, materials["pearl"])
    parts.append(blade)

    grip_start = hand - blade_axis * 0.23
    grip_end = hand + blade_axis * 0.015
    grip = add_cylinder_between("V3_ClaymoreGrip", grip_start, grip_end, 0.027, materials["leather"], vertices=28)
    parts.append(grip)

    # Crossguard lies on the sword's local X axis.
    perpendicular = Vector((blade_axis.z, 0.0, -blade_axis.x)).normalized()
    guard_center = blade_base - blade_axis * 0.025
    guard = add_cylinder_between(
        "V3_ClaymoreCrossguard",
        guard_center - perpendicular * 0.19,
        guard_center + perpendicular * 0.19,
        0.023,
        materials["gold"],
        vertices=28,
    )
    parts.append(guard)
    pommel = add_cylinder_between(
        "V3_ClaymorePommel",
        grip_start - blade_axis * 0.055,
        grip_start + blade_axis * 0.012,
        0.040,
        materials["gold"],
        vertices=32,
    )
    parts.append(pommel)
    fuller = add_cylinder_between(
        "V3_ClaymoreCyanFuller",
        blade_base + blade_axis * 0.10 - Vector((0.0, 0.016, 0.0)),
        blade_base + blade_axis * 0.52 - Vector((0.0, 0.016, 0.0)),
        0.006,
        materials["cyan"],
        vertices=16,
    )
    parts.append(fuller)
    pivot = assembly_pivot("V3_ClaymorePivot", hand, armature, "LArmR.001")
    attach_assembly(parts, pivot)
    return [pivot, *parts]


def build_spirit_accent(
    materials: dict[str, bpy.types.Material], armature: bpy.types.Object
) -> list[bpy.types.Object]:
    wisp = add_curve(
        "V3_SpiritWisp",
        [(-0.29, 0.04, 1.39), (-0.38, -0.02, 1.48), (-0.30, -0.08, 1.58), (-0.34, -0.02, 1.68)],
        0.011,
        materials["cyan"],
    )
    pivot = assembly_pivot("V3_SpiritPivot", Vector((-0.31, 0.0, 1.50)), armature, "Middle.004")
    attach_assembly([wisp], pivot)
    return [pivot, wisp]


ANIMATED_BONES = (
    "Bottem",
    "Middle",
    "Middle.001",
    "Middle.003",
    "Middle.004",
    "Middle.005",
    "UArmR",
    "LArmR",
    "LArmR.001",
    "UArmR.001",
    "LArmR.002",
    "LArmR.003",
    "UlegR",
    "LLegR",
    "FootR",
    "UlegR.001",
    "LLegR.001",
    "FootR.001",
)


def reset_pose(rig: bpy.types.Object) -> None:
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def insert_pose(
    rig: bpy.types.Object,
    frame: int,
    *,
    rotations: dict[str, tuple[float, float, float]] | None = None,
    locations: dict[str, tuple[float, float, float]] | None = None,
) -> None:
    reset_pose(rig)
    for name, value in (rotations or {}).items():
        rig.pose.bones[name].rotation_euler = value
    for name, value in (locations or {}).items():
        rig.pose.bones[name].location = value
    for name in ANIMATED_BONES:
        bone = rig.pose.bones[name]
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)


def make_actions(rig: bpy.types.Object) -> dict[str, tuple[bpy.types.Action, int]]:
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    for pose_bone in rig.pose.bones:
        for constraint in pose_bone.constraints:
            constraint.influence = 0.0
    rig.animation_data_create()
    actions: dict[str, tuple[bpy.types.Action, int]] = {}

    def begin(name: str, length: int) -> None:
        action = bpy.data.actions.new(name=name)
        action.use_fake_user = True
        rig.animation_data.action = action
        actions[name] = (action, length)

    begin("IDLE", 48)
    for frame, lift, sway, breath in (
        (1, 0.0, -0.014, 0.0),
        (13, 0.012, 0.014, 0.018),
        (25, 0.0, -0.014, 0.0),
        (37, -0.006, 0.010, -0.010),
        (49, 0.0, -0.014, 0.0),
    ):
        insert_pose(
            rig,
            frame,
            rotations={"Middle.003": (breath, sway, 0.0), "Middle.005": (-breath * 0.35, -sway * 0.55, 0.0)},
            locations={"Bottem": (0.0, 0.0, lift / rig.scale.z)},
        )

    begin("WALK", 32)
    for frame, lift, left_leg, right_leg, sword_arm, shield_arm in (
        (1, 0.0, 0.42, -0.42, -0.15, 0.18),
        (9, 0.026, 0.04, -0.07, -0.02, 0.04),
        (17, 0.0, -0.42, 0.42, 0.15, -0.18),
        (25, 0.026, -0.07, 0.04, 0.03, -0.03),
        (33, 0.0, 0.42, -0.42, -0.15, 0.18),
    ):
        insert_pose(
            rig,
            frame,
            rotations={
                "Middle.003": (0.035, 0.0, 0.0),
                "UlegR": (left_leg, 0.0, 0.0),
                "UlegR.001": (right_leg, 0.0, 0.0),
                "LLegR": (max(0.0, -left_leg) * 0.76, 0.0, 0.0),
                "LLegR.001": (max(0.0, -right_leg) * 0.76, 0.0, 0.0),
                "UArmR": (sword_arm, 0.0, -0.025),
                "UArmR.001": (shield_arm * 0.35, 0.0, 0.025),
            },
            locations={"Bottem": (0.0, 0.0, lift / rig.scale.z)},
        )

    begin("RUN", 24)
    for frame, lift, left_leg, right_leg, sword_arm, shield_arm in (
        (1, 0.025, 0.68, -0.64, -0.34, 0.36),
        (7, 0.080, 0.08, -0.12, -0.06, 0.09),
        (13, 0.025, -0.64, 0.68, 0.34, -0.36),
        (19, 0.080, -0.12, 0.08, 0.06, -0.09),
        (25, 0.025, 0.68, -0.64, -0.34, 0.36),
    ):
        insert_pose(
            rig,
            frame,
            rotations={
                "Middle.003": (0.15, 0.0, 0.0),
                "Middle.005": (-0.06, 0.0, 0.0),
                "UlegR": (left_leg, 0.0, 0.0),
                "UlegR.001": (right_leg, 0.0, 0.0),
                "LLegR": (max(0.0, -left_leg), 0.0, 0.0),
                "LLegR.001": (max(0.0, -right_leg), 0.0, 0.0),
                "UArmR": (sword_arm, 0.0, -0.05),
                "UArmR.001": (shield_arm * 0.46, 0.0, 0.04),
            },
            locations={"Bottem": (0.0, 0.0, lift / rig.scale.z)},
        )

    begin("ATTACK", 32)
    for frame, lift, upper_arm_x, upper_arm_y, forearm_x, chest_y in (
        (1, 0.0, 0.0, 0.0, 0.0, 0.0),
        (6, -0.018, 0.54, -0.24, -0.26, -0.18),
        (12, 0.012, 1.30, -0.51, -0.42, -0.31),
        (17, 0.035, -1.02, 0.28, 0.16, 0.34),
        (22, 0.012, -0.60, 0.10, 0.06, 0.20),
        (28, 0.0, -0.12, 0.0, 0.0, 0.05),
        (33, 0.0, 0.0, 0.0, 0.0, 0.0),
    ):
        insert_pose(
            rig,
            frame,
            rotations={
                "Middle.003": (0.05, chest_y, 0.0),
                "Middle.005": (-0.02, chest_y * 0.18, 0.0),
                "UArmR": (upper_arm_x, upper_arm_y, -0.10),
                "LArmR": (forearm_x, 0.0, -0.05),
                "UArmR.001": (-0.10, -0.04, 0.05),
                "UlegR": (-0.10 if 10 <= frame <= 23 else 0.0, 0.0, 0.0),
                "UlegR.001": (0.10 if 10 <= frame <= 23 else 0.0, 0.0, 0.0),
            },
            locations={"Bottem": (0.0, 0.0, lift / rig.scale.z)},
        )

    begin("GUARD", 40)
    for frame, lower, shield_upper_x, shield_upper_y, shield_forearm_x, chest_x in (
        (1, 0.0, 0.0, 0.0, 0.0, 0.0),
        (8, -0.02, -0.42, -0.18, -0.16, -0.06),
        (13, -0.045, -0.82, -0.35, -0.30, -0.14),
        (25, -0.042, -0.82, -0.35, -0.30, -0.14),
        (33, -0.02, -0.38, -0.16, -0.14, -0.05),
        (41, 0.0, 0.0, 0.0, 0.0, 0.0),
    ):
        active = frame not in (1, 41)
        insert_pose(
            rig,
            frame,
            rotations={
                "Middle.003": (chest_x, -0.02 if active else 0.0, 0.0),
                "UArmR.001": (shield_upper_x, shield_upper_y, 0.12),
                "LArmR.002": (shield_forearm_x, 0.0, 0.05),
                "UArmR": (0.16 if active else 0.0, 0.02, -0.04),
                "UlegR": (-0.12 if active else 0.0, 0.0, 0.0),
                "UlegR.001": (0.10 if active else 0.0, 0.0, 0.0),
            },
            locations={"Bottem": (0.0, 0.0, lower / rig.scale.z)},
        )

    for action, _ in actions.values():
        for layer in action.layers:
            for strip in layer.strips:
                for channel_bag in strip.channelbags:
                    for curve in channel_bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "BEZIER"
    rig.animation_data.action = actions["IDLE"][0]
    return actions


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
    target: tuple[float, float, float] = (0.0, 0.0, 1.0),
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    look_at(light, target)
    return light


def build_stage(materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    # A plain studio floor is intentionally not a pedestal.
    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0.0, 0.0, -0.015))
    floor = bpy.context.object
    floor.name = "V3_NeutralStudioFloor"
    floor.data.materials.append(materials["floor"])

    camera_data = bpy.data.cameras.new("V3_Camera")
    camera = bpy.data.objects.new("V3_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 72
    camera.data.sensor_width = 36
    bpy.context.scene.camera = camera

    add_area_light("V3_Key", (-3.6, -4.8, 5.8), 1150, (1.0, 0.86, 0.66), 4.0)
    add_area_light("V3_Fill", (4.2, -3.4, 3.0), 850, (0.72, 0.84, 1.0), 3.2)
    add_area_light("V3_Front", (0.0, -5.5, 2.5), 780, (1.0, 0.94, 0.82), 3.5)
    add_area_light("V3_Rim", (2.8, 4.0, 4.4), 1100, (1.0, 0.76, 0.34), 3.0)
    add_area_light("V3_Top", (-0.6, 0.0, 6.3), 650, (0.80, 0.90, 1.0), 2.8)
    return camera


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 30
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = 0.10
    world = scene.world or bpy.data.worlds.new("V3_BrightWorld")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.78, 0.80, 0.84, 1.0)
        background.inputs["Strength"].default_value = 0.46


def build_scene() -> tuple[bpy.types.Object, dict[str, tuple[bpy.types.Action, int]], bpy.types.Object]:
    if not SOURCE_BLEND.exists():
        raise FileNotFoundError(f"CC0 source blend is missing: {SOURCE_BLEND}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE_BLEND), load_ui=False)
    materials = build_project_materials()
    armature = bpy.data.objects["The Armored Adventurer"]
    body = bpy.data.objects["Plane.029"]
    remove_source_helmet_shield_and_sword(body)
    recolor_source_materials()

    # Source is 1.596 m. 1.1905 makes 1.90 m; X is broadened another 8%.
    height_factor = 1.1905
    armature.scale = (
        armature.scale.x * height_factor * 1.08,
        armature.scale.y * height_factor,
        armature.scale.z * height_factor,
    )
    armature.name = "Crusader_Adventurer_Rig_v3"
    body.name = "Crusader_Adventurer_Body_v3"
    bpy.data.objects["Person.009"].name = "Crusader_Adventurer_Face_v3"
    armature["source"] = "BlendKit The Armored Adventurer, CC0"
    armature["character_height_m"] = 1.90
    armature["body_width_scale"] = 1.08
    armature["source_bones"] = 65
    armature["palette_ratio"] = "ivory 50 / yellow-gold 32 / dark 15 / cyan 3"

    build_round_cross_helmet(materials, armature)
    build_shield(materials, armature)
    build_claymore(materials, armature)
    build_spirit_accent(materials, armature)
    actions = make_actions(armature)
    camera = build_stage(materials)
    configure_render()
    return armature, actions, camera


def set_camera(camera: bpy.types.Object, location: tuple[float, float, float]) -> None:
    camera.location = location
    look_at(camera, (0.0, 0.0, 1.02))


def render_previews(
    rig: bpy.types.Object,
    actions: dict[str, tuple[bpy.types.Action, int]],
    camera: bpy.types.Object,
) -> None:
    scene = bpy.context.scene
    rig.animation_data.action = actions["IDLE"][0]
    scene.frame_start = 1
    scene.frame_end = actions["IDLE"][1]
    scene.frame_set(1)
    views = (
        (PREVIEW_FRONT, (3.55, -7.35, 1.22)),
        (PREVIEW_BACK, (-3.55, 7.35, 1.22)),
        (PREVIEW_SIDE, (7.20, -0.35, 1.22)),
    )
    for path, location in views:
        set_camera(camera, location)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    set_camera(camera, (3.55, -7.35, 1.22))
    scene.render.filepath = str(PREVIEW_FRONT)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def run_checked(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def render_actions(
    rig: bpy.types.Object,
    actions: dict[str, tuple[bpy.types.Action, int]],
    camera: bpy.types.Object,
) -> None:
    scene = bpy.context.scene
    set_camera(camera, (3.55, -7.35, 1.22))
    for name in ACTION_ORDER:
        action, length = actions[name]
        rig.animation_data.action = action
        scene.frame_start = 1
        scene.frame_end = length
        scene.frame_set(1)
        action_dir = FRAMES_DIR / name
        action_dir.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(action_dir / "frame_")
        bpy.ops.render.render(animation=True)
    rig.animation_data.action = actions["IDLE"][0]
    scene.frame_start = 1
    scene.frame_end = actions["IDLE"][1]
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))


def encode_outputs(actions: dict[str, tuple[bpy.types.Action, int]]) -> dict[str, object]:
    if not FFMPEG_PATH.exists() or not FFPROBE_PATH.exists():
        raise FileNotFoundError("The project-local verified FFmpeg runtime is missing")
    clips: list[Path] = []
    for name in ACTION_ORDER:
        _, length = actions[name]
        clip = OUTPUT_DIR / f"crusader_v3_{name.lower()}.mp4"
        run_checked(
            [
                str(FFMPEG_PATH),
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-framerate",
                str(FPS),
                "-start_number",
                "1",
                "-i",
                str(FRAMES_DIR / name / "frame_%04d.png"),
                "-frames:v",
                str(length),
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(clip),
            ]
        )
        clips.append(clip)

    combine = [str(FFMPEG_PATH), "-hide_banner", "-loglevel", "error", "-y"]
    for clip in clips:
        combine.extend(["-i", str(clip)])
    inputs = "".join(f"[{index}:v]" for index in range(len(clips)))
    combine.extend(
        [
            "-filter_complex",
            f"{inputs}concat=n={len(clips)}:v=1:a=0[v]",
            "-map",
            "[v]",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(COMBINED_MP4),
        ]
    )
    run_checked(combine)

    montage_inputs = [
        PREVIEW_FRONT,
        FRAMES_DIR / "WALK" / "frame_0001.png",
        FRAMES_DIR / "RUN" / "frame_0001.png",
        FRAMES_DIR / "ATTACK" / "frame_0017.png",
        FRAMES_DIR / "GUARD" / "frame_0013.png",
    ]
    montage = [str(FFMPEG_PATH), "-hide_banner", "-loglevel", "error", "-y"]
    for path in montage_inputs:
        montage.extend(["-i", str(path)])
    montage.extend(
        [
            "-filter_complex",
            "[0:v]scale=360:360[a];[1:v]scale=360:360[b];[2:v]scale=360:360[c];"
            "[3:v]scale=360:360[d];[4:v]scale=360:360[e];"
            "[a][b][c][d][e]xstack=inputs=5:layout=0_0|360_0|720_0|180_360|540_360:fill=0xE2DED6[out]",
            "-map",
            "[out]",
            "-frames:v",
            "1",
            str(KEYPOSES_PATH),
        ]
    )
    run_checked(montage)

    null_device = "NUL" if os.name == "nt" else "/dev/null"
    run_checked([str(FFMPEG_PATH), "-hide_banner", "-loglevel", "error", "-i", str(COMBINED_MP4), "-f", "null", null_device])
    probe = run_checked(
        [
            str(FFPROBE_PATH),
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames",
            "-show_entries",
            "format=duration,size",
            "-of",
            "json",
            str(COMBINED_MP4),
        ]
    )
    return json.loads(probe.stdout)


def write_manifest(actions: dict[str, tuple[bpy.types.Action, int]], probe: dict[str, object] | None) -> Path:
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest = {
        "model": {
            "name": "Crusader Adventurer v3",
            "height_m": 1.90,
            "body_width_scale": 1.08,
            "source_rig_bones": 65,
            "source_license": "CC0",
            "source_record": str(SOURCE_RECORD.relative_to(REPO_ROOT)),
            "source_geometry_and_textures_retained": True,
        },
        "palette": {"ivory": 50, "yellow_gold": 32, "dark": 15, "cyan": 3},
        "actions": {name: {"frames": length, "fps": FPS} for name, (_, length) in actions.items()},
        "preview": {
            "front": PREVIEW_FRONT.name,
            "back": PREVIEW_BACK.name,
            "side": PREVIEW_SIDE.name,
        },
        "combined_video": COMBINED_MP4.name if probe else None,
        "ffprobe": probe,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def package_artifacts(manifest_path: Path, full: bool) -> None:
    paths = [BLEND_PATH, PREVIEW_FRONT, PREVIEW_BACK, PREVIEW_SIDE, manifest_path, SOURCE_RECORD]
    if full:
        paths.extend([COMBINED_MP4, KEYPOSES_PATH])
        paths.extend(OUTPUT_DIR / f"crusader_v3_{name.lower()}.mp4" for name in ACTION_ORDER)
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in paths:
            if not path.exists():
                continue
            archive_name = path.name if path.parent == OUTPUT_DIR else "source/" + path.name
            archive.write(path, archive_name)


def remove_render_cache() -> None:
    resolved_output = OUTPUT_DIR.resolve()
    resolved_frames = FRAMES_DIR.resolve()
    if resolved_frames.parent != resolved_output or resolved_frames.name != "frames":
        raise RuntimeError(f"Unsafe render-cache path: {resolved_frames}")
    if FRAMES_DIR.exists():
        shutil.rmtree(FRAMES_DIR)


def main() -> None:
    arguments = parse_arguments()
    full = bool(arguments.full and not arguments.preview_only)
    rig, actions, camera = build_scene()
    render_previews(rig, actions, camera)
    probe = None
    if full:
        render_actions(rig, actions, camera)
        probe = encode_outputs(actions)
    manifest_path = write_manifest(actions, probe)
    package_artifacts(manifest_path, full)
    if full:
        remove_render_cache()
    print(
        "V3_COMPLETE",
        json.dumps(
            {
                "mode": "full" if full else "preview",
                "front": str(PREVIEW_FRONT),
                "back": str(PREVIEW_BACK),
                "side": str(PREVIEW_SIDE),
                "blend": str(BLEND_PATH),
                "video": str(COMBINED_MP4) if full else None,
                "keyposes": str(KEYPOSES_PATH) if full else None,
                "zip": str(ZIP_PATH),
            },
            ensure_ascii=False,
        ),
    )


if __name__ == "__main__":
    main()

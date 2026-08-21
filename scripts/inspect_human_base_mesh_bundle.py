"""Inventory Blender's official Human Base Meshes bundle and render the male sculpt base.

Run with Blender 5.2 while opening ``human_base_meshes_bundle.blend``::

    blender --background human_base_meshes_bundle.blend \
      --python scripts/inspect_human_base_mesh_bundle.py -- artifacts/human-base-mesh-v1.4.1

The source library is never saved or modified on disk.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


SELECTED_COLLECTION = "Body Male - Realistic"


def output_dir_from_argv() -> Path:
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
        if args:
            return Path(args[0]).resolve()
    return (Path.cwd() / "artifacts" / "human-base-mesh-v1.4.1").resolve()


OUT_DIR = output_dir_from_argv()
OUT_DIR.mkdir(parents=True, exist_ok=True)
SOURCE_BLEND = Path(bpy.data.filepath).resolve()


def rounded_vector(value, digits: int = 6) -> list[float]:
    return [round(float(component), digits) for component in value]


def asset_metadata(block) -> dict | None:
    data = block.asset_data
    if data is None:
        return None
    return {
        "author": data.author,
        "description": data.description,
        "license": data.license,
        "catalog_id": str(data.catalog_id),
        "tags": [tag.name for tag in data.tags],
    }


def parse_catalogs(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line == "VERSION 1":
            continue
        parts = line.split(":", 2)
        if len(parts) == 3:
            result[parts[0]] = parts[1]
    return result


CATALOGS = parse_catalogs(SOURCE_BLEND.with_name("blender_assets.cats.txt"))


def modifier_info(modifier) -> dict:
    info = {"name": modifier.name, "type": modifier.type}
    for field in (
        "levels",
        "render_levels",
        "sculpt_levels",
        "total_levels",
        "show_viewport",
        "show_render",
        "subdivision_type",
    ):
        if hasattr(modifier, field):
            value = getattr(modifier, field)
            info[field] = value if isinstance(value, (str, bool, int, float)) else str(value)
    return info


def mesh_info(obj: bpy.types.Object, depsgraph: bpy.types.Depsgraph) -> dict:
    mesh = obj.data
    polygons = list(mesh.polygons)
    quad_count = sum(1 for polygon in polygons if len(polygon.vertices) == 4)
    triangle_count = sum(1 for polygon in polygons if len(polygon.vertices) == 3)
    ngon_count = len(polygons) - quad_count - triangle_count

    evaluated = obj.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.data if evaluated.type == "MESH" else None

    topology = bmesh.new()
    topology.from_mesh(mesh)
    boundary_edges = sum(1 for edge in topology.edges if edge.is_boundary)
    non_manifold_edges = sum(1 for edge in topology.edges if not edge.is_manifold)
    loose_edges = sum(1 for edge in topology.edges if edge.is_wire)
    topology.free()

    face_set_ids: list[int] = []
    face_set_attribute = mesh.attributes.get(".sculpt_face_set")
    if face_set_attribute:
        values = [0] * len(face_set_attribute.data)
        face_set_attribute.data.foreach_get("value", values)
        face_set_ids = sorted(set(values))

    return {
        "name": obj.name,
        "mesh_data_name": mesh.name,
        "location_m": rounded_vector(obj.location),
        "rotation_euler_radians": rounded_vector(obj.rotation_euler),
        "scale": rounded_vector(obj.scale),
        "dimensions_m": rounded_vector(obj.dimensions),
        "base_topology": {
            "vertices": len(mesh.vertices),
            "edges": len(mesh.edges),
            "faces": len(mesh.polygons),
            "triangles": triangle_count,
            "quads": quad_count,
            "ngons": ngon_count,
            "boundary_edges": boundary_edges,
            "non_manifold_edges": non_manifold_edges,
            "loose_edges": loose_edges,
        },
        "evaluated_topology": {
            "vertices": len(evaluated_mesh.vertices) if evaluated_mesh else None,
            "edges": len(evaluated_mesh.edges) if evaluated_mesh else None,
            "faces": len(evaluated_mesh.polygons) if evaluated_mesh else None,
        },
        "uv_layers": list(mesh.uv_layers.keys()),
        "attributes": [
            {"name": attribute.name, "domain": attribute.domain, "data_type": attribute.data_type}
            for attribute in mesh.attributes
        ],
        "sculpt_face_sets": {"count": len(face_set_ids), "ids": face_set_ids},
        "materials": [material.name if material else None for material in mesh.materials],
        "vertex_groups": [group.name for group in obj.vertex_groups],
        "shape_keys": list(mesh.shape_keys.key_blocks.keys()) if mesh.shape_keys else [],
        "modifiers": [modifier_info(modifier) for modifier in obj.modifiers],
    }


def object_bounds_world(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("No mesh bounds found")
    return (
        Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points))),
        Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points))),
    )


def inventory() -> dict:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    collection_assets = []
    for collection in sorted((item for item in bpy.data.collections if item.asset_data), key=lambda item: item.name):
        metadata = asset_metadata(collection)
        assert metadata is not None
        metadata["catalog_path"] = CATALOGS.get(metadata["catalog_id"], "")
        collection_assets.append(
            {
                "type": "COLLECTION",
                "name": collection.name,
                "metadata": metadata,
                "objects": [obj.name for obj in collection.all_objects],
                "object_count": len(collection.all_objects),
            }
        )

    object_assets = []
    for obj in sorted((item for item in bpy.data.objects if item.asset_data), key=lambda item: item.name):
        metadata = asset_metadata(obj)
        assert metadata is not None
        metadata["catalog_path"] = CATALOGS.get(metadata["catalog_id"], "")
        object_assets.append(
            {
                "type": "OBJECT",
                "name": obj.name,
                "object_type": obj.type,
                "metadata": metadata,
            }
        )

    selected = bpy.data.collections[SELECTED_COLLECTION]
    selected_objects = list(selected.all_objects)
    minimum, maximum = object_bounds_world(selected_objects)
    selected_meshes = [obj for obj in selected_objects if obj.type == "MESH"]

    files = []
    for path in sorted(SOURCE_BLEND.parent.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": str(path.relative_to(SOURCE_BLEND.parent)).replace("\\", "/"),
                    "bytes": path.stat().st_size,
                }
            )

    return {
        "source": {
            "blend_path": str(SOURCE_BLEND),
            "bundle_root": str(SOURCE_BLEND.parent),
            "blender_version": bpy.app.version_string,
            "scene_units": {
                "system": bpy.context.scene.unit_settings.system,
                "scale_length": bpy.context.scene.unit_settings.scale_length,
                "length_unit": bpy.context.scene.unit_settings.length_unit,
            },
            "files": files,
        },
        "assets": {
            "collection_assets": collection_assets,
            "object_assets": object_assets,
            "total": len(collection_assets) + len(object_assets),
        },
        "selected_sculpting_base": {
            "collection": SELECTED_COLLECTION,
            "reason": "Adult male full-body realistic scan mesh with multiresolution sculpt detail; unlike the head-only sculpt asset and animation-topology head asset.",
            "metadata": asset_metadata(selected),
            "bounds_world_m": {
                "minimum": rounded_vector(minimum),
                "maximum": rounded_vector(maximum),
                "dimensions": rounded_vector(maximum - minimum),
                "height": round(maximum.z - minimum.z, 6),
            },
            "objects": [mesh_info(obj, depsgraph) for obj in selected_meshes],
        },
    }


def material(name: str, base_color: tuple[float, float, float, float], metallic: float, roughness: float):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = base_color
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return mat


def point_at(obj: bpy.types.Object, target: Vector):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_previews():
    selected = bpy.data.collections[SELECTED_COLLECTION]
    selected_objects = list(selected.all_objects)

    for obj in bpy.data.objects:
        obj.hide_render = True
    for obj in selected_objects:
        obj.hide_render = False
        obj.hide_viewport = False
        if obj.type == "MESH":
            for polygon in obj.data.polygons:
                polygon.use_smooth = True

    skin = material("Preview_Sculpt_Clay", (0.18, 0.095, 0.045, 1.0), 0.0, 0.72)
    eye = material("Preview_Eyes", (0.055, 0.07, 0.08, 1.0), 0.0, 0.28)
    floor_mat = material("Preview_Floor", (0.012, 0.018, 0.03, 1.0), 0.02, 0.78)

    for obj in selected_objects:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(eye if ".eye." in obj.name else skin)

    minimum, maximum = object_bounds_world(selected_objects)
    center = (minimum + maximum) * 0.5
    height = maximum.z - minimum.z

    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(center.x, center.y, minimum.z - 0.006))
    floor = bpy.context.object
    floor.name = "Preview_Floor"
    floor.data.materials.append(floor_mat)
    floor.hide_render = False

    world = bpy.context.scene.world or bpy.data.worlds.new("Preview_World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.018, 0.03, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.12

    def area_light(name: str, location: tuple[float, float, float], energy: float, size: float, color):
        data = bpy.data.lights.new(name=name, type="AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = center + Vector(location)
        obj.hide_render = False
        point_at(obj, center + Vector((0, 0, height * 0.05)))
        return obj

    area_light("Key_Light", (-2.2, -2.4, 2.6), 240.0, 2.3, (1.0, 0.78, 0.58))
    area_light("Fill_Light", (2.4, -0.8, 1.7), 135.0, 2.4, (0.50, 0.70, 1.0))
    area_light("Rim_Light", (0.5, 2.6, 2.2), 280.0, 1.8, (0.66, 0.82, 1.0))
    area_light("Back_Fill", (-2.0, 1.8, 1.35), 110.0, 2.0, (1.0, 0.68, 0.40))

    camera_data = bpy.data.cameras.new("Preview_Camera")
    camera = bpy.data.objects.new("Preview_Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.hide_render = False
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = height * 1.14
    camera_data.lens = 58.0
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = -0.65

    target = center + Vector((0.0, 0.0, height * 0.015))
    distance = height * 2.4
    views = {
        "human_base_male_front_3q.png": Vector((0.72, -1.0, 0.10)).normalized(),
        "human_base_male_back_3q.png": Vector((-0.72, 1.0, 0.10)).normalized(),
    }
    for filename, direction in views.items():
        camera.location = target + direction * distance
        point_at(camera, target)
        scene.render.filepath = str(OUT_DIR / filename)
        bpy.ops.render.render(write_still=True)


report = inventory()
(OUT_DIR / "human_base_mesh_v1.4.1_inventory.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)
render_previews()
print(f"WROTE_REPORT={OUT_DIR / 'human_base_mesh_v1.4.1_inventory.json'}")
print(f"WROTE_FRONT={OUT_DIR / 'human_base_male_front_3q.png'}")
print(f"WROTE_BACK={OUT_DIR / 'human_base_male_back_3q.png'}")

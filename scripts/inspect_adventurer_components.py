"""List connected components and material assignments in the CC0 source mesh."""

import json
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
obj = bpy.data.objects.get("Crusader_CC0_ArmorBody") or bpy.data.objects["Plane.029"]
filename = "current_components.json" if obj.name == "Crusader_CC0_ArmorBody" else "adventurer_components.json"
OUT = ROOT / "artifacts" / "crusader-3d-v2" / filename
mesh = obj.data

parent = list(range(len(mesh.vertices)))


def find(index):
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = parent[index]
    return index


def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb:
        parent[rb] = ra


for polygon in mesh.polygons:
    vertices = list(polygon.vertices)
    for index in range(1, len(vertices)):
        union(vertices[0], vertices[index])

components = {}
for polygon in mesh.polygons:
    root = find(polygon.vertices[0])
    info = components.setdefault(root, {"vertices": set(), "polygons": [], "materials": set()})
    info["vertices"].update(polygon.vertices)
    info["polygons"].append(polygon.index)
    info["materials"].add(polygon.material_index)

records = []
for info in components.values():
    coords = [obj.matrix_world @ mesh.vertices[index].co for index in info["vertices"]]
    bounds = {
        "x": [min(point.x for point in coords), max(point.x for point in coords)],
        "y": [min(point.y for point in coords), max(point.y for point in coords)],
        "z": [min(point.z for point in coords), max(point.z for point in coords)],
    }
    records.append({
        "vertex_count": len(info["vertices"]),
        "polygon_count": len(info["polygons"]),
        "bounds_world": bounds,
        "material_indices": sorted(info["materials"]),
        "materials": [mesh.materials[index].name if index < len(mesh.materials) and mesh.materials[index] else None for index in sorted(info["materials"])],
    })

records.sort(key=lambda item: item["polygon_count"], reverse=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(records, indent=2), encoding="utf-8")
print(f"COMPONENT_COUNT={len(records)}")
for index, record in enumerate(records[:30]):
    print(index, record)

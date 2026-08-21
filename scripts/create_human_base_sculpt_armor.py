"""Build a reusable plate-armor collection on Blender's official Human Base Mesh.

This script intentionally starts from the already validated Rigify file made by
``create_human_base_sculpt_rig.py``.  The official sculpt body and eye objects
are left intact.  Armor plates are extracted from the source mesh's
``.sculpt_face_set`` regions, then finished as outward shell objects.  Separate
forged details (faulds, rolled edges, cops, poleyns and helmet trim) give those
shells a readable plate silhouette without replacing the anatomical surface.

Run from the repository root:

  tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
    artifacts/human-base-sculpt-rig/human_base_sculpt_male_190cm_rigify.blend \
    --python scripts/create_human_base_sculpt_armor.py
"""

from __future__ import annotations

import bmesh
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "human-base-sculpt-armor"
BLEND_PATH = OUT / "human_base_sculpt_crusader_armor.blend"
REPORT_PATH = OUT / "human_base_sculpt_crusader_armor_report.json"
BODY_NAME = "HumanBaseSculpt.Body"
RIG_NAME = "HumanBaseSculpt.Rig"
ARMOR_COLLECTION = "HBS_ARMOR_SURFACE_SHELLS"
DETAIL_COLLECTION = "HBS_ARMOR_FORGED_DETAILS"
STAGE_COLLECTION = "HBS_ARMOR_PREVIEW_STAGE"


# ---------------------------------------------------------------------------
# Scene and material helpers


def require_source() -> tuple[bpy.types.Object, bpy.types.Object]:
    body = bpy.data.objects.get(BODY_NAME)
    rig = bpy.data.objects.get(RIG_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing official sculpt body {BODY_NAME!r}")
    if rig is None or rig.type != "ARMATURE":
        raise RuntimeError(f"Missing generated Rigify armature {RIG_NAME!r}")
    face_sets = body.data.attributes.get(".sculpt_face_set")
    if face_sets is None or face_sets.domain != "FACE":
        raise RuntimeError("Official .sculpt_face_set face attribute is missing")
    return body, rig


def reset_neutral(rig: bpy.types.Object) -> None:
    if rig.animation_data:
        rig.animation_data.action = None
    bpy.context.scene.frame_set(1)
    for bone in rig.pose.bones:
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def remove_previous() -> None:
    for collection_name in (ARMOR_COLLECTION, DETAIL_COLLECTION, STAGE_COLLECTION):
        collection = bpy.data.collections.get(collection_name)
        if collection:
            for obj in list(collection.objects):
                bpy.data.objects.remove(obj, do_unlink=True)
            bpy.data.collections.remove(collection)
    # The source rig proof contains its own stage.  Leave source body/eyes/rig,
    # but remove cameras, lights and presentation geometry before rebuilding.
    for obj in list(bpy.data.objects):
        if obj.type in {"CAMERA", "LIGHT"} or obj.name.startswith(("Sculpt.Plinth", "Sculpt.Floor")):
            bpy.data.objects.remove(obj, do_unlink=True)


def new_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
    clearcoat: float = 0.0,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
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
        shader.inputs["Coat Weight"].default_value = clearcoat
        shader.inputs["Coat Roughness"].default_value = 0.16
    if emission_strength:
        emission_key = "Emission Color" if "Emission Color" in shader.inputs else "Emission"
        shader.inputs[emission_key].default_value = color
        shader.inputs["Emission Strength"].default_value = emission_strength
    mat.diffuse_color = color
    return mat


def make_chain_material() -> bpy.types.Material:
    name = "HBS.DarkChainAndCloth"
    old = bpy.data.materials.get(name)
    if old:
        bpy.data.materials.remove(old)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.018, 0.026, 0.045, 1.0)
    shader.inputs["Metallic"].default_value = 0.34
    shader.inputs["Roughness"].default_value = 0.53
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 155.0
    noise.inputs["Detail"].default_value = 2.5
    noise.inputs["Roughness"].default_value = 0.7
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.018
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    return mat


def smooth(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    bevel = obj.modifiers.new("Hand-rolled forged edges", "BEVEL")
    bevel.width = width
    bevel.segments = segments
    bevel.limit_method = "ANGLE"


def material_slot(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Official face-set surface shells


def surface_shell(
    name: str,
    body: bpy.types.Object,
    rig: bpy.types.Object,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    face_set_ids: set[int],
    *,
    z_min: float | None = None,
    z_max: float | None = None,
    x_min: float | None = None,
    x_max: float | None = None,
    y_min: float | None = None,
    y_max: float | None = None,
    predicate=None,
    offset: float = 0.006,
    thickness: float = 0.010,
    bevel: float = 0.003,
) -> bpy.types.Object:
    source = body.data
    face_sets = source.attributes[".sculpt_face_set"]
    selected: set[int] = set()
    selected_face_sets: set[int] = set()
    for poly in source.polygons:
        face_set = int(face_sets.data[poly.index].value)
        if face_set not in face_set_ids:
            continue
        center = poly.center
        if z_min is not None and center.z < z_min:
            continue
        if z_max is not None and center.z > z_max:
            continue
        if x_min is not None and center.x < x_min:
            continue
        if x_max is not None and center.x > x_max:
            continue
        if y_min is not None and center.y < y_min:
            continue
        if y_max is not None and center.y > y_max:
            continue
        if predicate is not None and not predicate(center, poly):
            continue
        selected.add(poly.index)
        selected_face_sets.add(face_set)
    if not selected:
        raise RuntimeError(f"No faces selected for armor shell {name}")

    mesh = source.copy()
    mesh.name = name + ".Mesh"
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.matrix_world = body.matrix_world.copy()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.index not in selected], context="FACES")
    bmesh.ops.delete(bm, geom=[vert for vert in bm.verts if not vert.link_faces], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    # Deform data is kept by BMesh; recreate the source vertex-group index map.
    for group in body.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    armature = obj.modifiers.new("Rigify deformation", "ARMATURE")
    armature.object = rig
    armature.use_deform_preserve_volume = True
    shrink = obj.modifiers.new("Body-conforming plate gap", "SHRINKWRAP")
    shrink.target = body
    shrink.wrap_method = "NEAREST_SURFACEPOINT"
    shrink.wrap_mode = "OUTSIDE"
    shrink.offset = offset
    solidify = obj.modifiers.new("Forged plate thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.15
    solidify.use_rim = True
    solidify.use_even_offset = True
    add_bevel(obj, bevel, 3)
    material_slot(obj, mat)
    smooth(obj)
    obj["official_source_object"] = BODY_NAME
    obj["official_face_sets"] = sorted(selected_face_sets)
    obj["selected_base_faces"] = len(selected)
    obj["construction"] = "surface shell extracted from .sculpt_face_set"
    return obj


# ---------------------------------------------------------------------------
# Forged mesh/detail helpers


def rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.006,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    material_slot(obj, mat)
    add_bevel(obj, bevel, 4)
    smooth(obj)
    link_only(obj, collection)
    return obj


def uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    segments: int = 40,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=24, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    material_slot(obj, mat)
    smooth(obj)
    link_only(obj, collection)
    return obj


def elliptical_curve(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel_depth: float = 0.006,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name + ".Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def ellipse_points(
    z: float,
    radius_x: float,
    radius_y: float,
    center_y: float,
    *,
    count: int = 40,
    start: float = 0.0,
    end: float = math.tau,
) -> list[tuple[float, float, float]]:
    return [
        (
            radius_x * math.cos(start + (end - start) * i / count),
            center_y + radius_y * math.sin(start + (end - start) * i / count),
            z,
        )
        for i in range(count + (0 if math.isclose(end - start, math.tau) else 1))
    ]


def elliptical_band(
    name: str,
    z_top: float,
    z_bottom: float,
    rx_top: float,
    ry_top: float,
    rx_bottom: float,
    ry_bottom: float,
    center_y: float,
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    thickness: float = 0.009,
    segments: int = 64,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, rx, ry in ((z_top, rx_top, ry_top), (z_bottom, rx_bottom, ry_bottom)):
        for i in range(segments):
            angle = math.tau * i / segments
            vertices.append((rx * math.cos(angle), center_y + ry * math.sin(angle), z))
    faces = []
    for i in range(segments):
        nxt = (i + 1) % segments
        faces.append((i, nxt, segments + nxt, segments + i))
    mesh = bpy.data.meshes.new(name + ".Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    material_slot(obj, mat)
    solidify = obj.modifiers.new("Fauld forged thickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    solidify.use_even_offset = True
    add_bevel(obj, 0.0035, 3)
    smooth(obj)
    return obj


def convex_plate(
    name: str,
    center: tuple[float, float, float],
    width: float,
    height: float,
    depth: float,
    axis: str,
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    wing: float = 0.16,
) -> bpy.types.Object:
    # Eight-sided shield outline keeps knees/elbows clearly plated, avoiding
    # the spherical "joint ball" look of early procedural prototypes.
    outline = [
        (-0.32, 0.50), (0.32, 0.50), (0.50, 0.14), (0.44, -0.34),
        (0.0, -0.50), (-0.44, -0.34), (-0.50, 0.14),
    ]
    half = depth * 0.5
    verts: list[tuple[float, float, float]] = []
    for normal_offset in (-half, half):
        for u, v in outline:
            u *= width
            v *= height
            crown = (1.0 - min(1.0, abs(u / max(width, 1e-6)))) * depth * wing
            if axis == "Y":
                verts.append((center[0] + u, center[1] + normal_offset - crown, center[2] + v))
            elif axis == "X":
                direction = 1.0 if center[0] > 0 else -1.0
                verts.append((center[0] + direction * (normal_offset + crown), center[1] + u, center[2] + v))
            else:
                raise ValueError(axis)
    n = len(outline)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        nxt = (i + 1) % n
        faces.append((i, nxt, n + nxt, n + i))
    mesh = bpy.data.meshes.new(name + ".Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    material_slot(obj, mat)
    bevel = obj.modifiers.new("Rolled cop edge", "BEVEL")
    bevel.width = min(width, height) * 0.055
    bevel.segments = 4
    smooth(obj)
    return obj


def helmet_lathe(
    name: str,
    mat: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    segments: int = 64,
) -> bpy.types.Object:
    # Deliberately broad at brow and nearly vertical through the jaw.  The
    # crown then steps inward; this reads as a forged great helm, not an egg.
    rings = [
        (1.565, 0.120, 0.127, -0.024),
        (1.595, 0.137, 0.145, -0.026),
        (1.680, 0.145, 0.153, -0.028),
        (1.785, 0.145, 0.151, -0.026),
        (1.858, 0.126, 0.137, -0.020),
        (1.915, 0.080, 0.092, -0.012),
        (1.940, 0.020, 0.024, -0.004),
    ]
    vertices: list[tuple[float, float, float]] = []
    for z, rx, ry, center_y in rings:
        for i in range(segments):
            angle = math.tau * i / segments
            # Slightly flatten the face around the forward pole while keeping
            # cheeks round.  Front is negative Y in this source orientation.
            x = rx * math.cos(angle)
            y = center_y + ry * math.sin(angle)
            if math.sin(angle) < -0.70:
                y = max(y, center_y - ry * 0.965)
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(rings) - 1):
        base = ring * segments
        nxt_base = (ring + 1) * segments
        for i in range(segments):
            nxt = (i + 1) % segments
            faces.append((base + i, base + nxt, nxt_base + nxt, nxt_base + i))
    top_center = len(vertices)
    vertices.append((0.0, -0.004, 1.946))
    last = (len(rings) - 1) * segments
    for i in range(segments):
        nxt = (i + 1) % segments
        faces.append((last + i, last + nxt, top_center))
    mesh = bpy.data.meshes.new(name + ".Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    material_slot(obj, mat)
    solidify = obj.modifiers.new("Forged helmet thickness", "SOLIDIFY")
    solidify.thickness = 0.010
    solidify.offset = 0.0
    add_bevel(obj, 0.003, 3)
    smooth(obj)
    return obj


def attach_rig(obj: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    if bone not in rig.pose.bones:
        obj["requested_parent_bone_missing"] = bone
        return
    # Keep forged detail coordinates in the official neutral world space for
    # dependable collection appending.  Record the intended rigid bone so an
    # animation builder can parent in its own pose/bind context without a
    # bone-parent inverse changing curve control points during this still pass.
    obj["intended_rigid_parent_bone"] = bone


def create_rivet_rows(
    details: bpy.types.Collection,
    gold: bpy.types.Material,
    cyan: bpy.types.Material,
) -> list[bpy.types.Object]:
    rivets = []
    # Helmet brow row, chest flank row and fauld center fasteners.
    for idx, x in enumerate((-0.112, -0.082, -0.052, 0.052, 0.082, 0.112)):
        rivets.append(uv_ellipsoid(f"Helmet.Rivet.{idx:02d}", (x, -0.177, 1.814), (0.008, 0.006, 0.008), gold, details, segments=24))
    for side in (-1.0, 1.0):
        for idx, z in enumerate((1.438, 1.375, 1.310, 1.245)):
            rivets.append(uv_ellipsoid(f"Cuirass.Rivet.{side:+.0f}.{idx}", (side * 0.165, -0.196, z), (0.008, 0.006, 0.008), gold, details, segments=24))
    for idx, z in enumerate((1.105, 1.045, 0.985, 0.925)):
        rivets.append(uv_ellipsoid(f"Fauld.SpiritStud.{idx}", (0.0, -0.220, z), (0.009, 0.006, 0.009), cyan, details, segments=24))
    return rivets


# ---------------------------------------------------------------------------
# Armor construction


def build_armor(
    body: bpy.types.Object,
    rig: bpy.types.Object,
    armor: bpy.types.Collection,
    details: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> dict:
    ivory = mats["ivory"]
    gold = mats["gold"]
    dark = mats["dark"]
    cyan = mats["cyan"]
    created: list[bpy.types.Object] = []
    shells: list[bpy.types.Object] = []

    # Face-set map from the official v1.4.1 sculpting asset:
    # 1 torso, 19 abdomen, 18 pelvis, 20/21 upper arms, 11/12 forearms,
    # 23/24 upper legs, 15/16 lower legs, 13/14 feet.
    shells.append(surface_shell(
        "Armor.Cuirass.AnatomicalShell", body, rig, armor, ivory, {1, 19},
        z_min=1.105, z_max=1.555, offset=0.008, thickness=0.014, bevel=0.004,
    ))
    # Reinforced lower abdomen floats over the lower edge of the cuirass.
    shells.append(surface_shell(
        "Armor.Cuirass.AbdominalReinforcement", body, rig, armor, ivory, {19},
        z_min=1.045, z_max=1.225, offset=0.014, thickness=0.011, bevel=0.003,
    ))

    # Three-lame pauldrons, separated by visible dark articulation gaps.
    for side, face_set in (("L", 21), ("R", 20)):
        for index, (z_min, z_max, offset, mat) in enumerate((
            (1.405, 1.545, 0.021, ivory),
            (1.335, 1.425, 0.017, gold),
            (1.270, 1.355, 0.013, ivory),
        ), start=1):
            shells.append(surface_shell(
                f"Armor.Pauldron.{side}.Lame{index}", body, rig, armor, mat, {face_set},
                z_min=z_min, z_max=z_max, offset=offset, thickness=0.012, bevel=0.003,
            ))

    for side, face_set in (("L", 12), ("R", 11)):
        shells.append(surface_shell(
            f"Armor.Vambrace.{side}", body, rig, armor, ivory, {face_set},
            z_min=0.990, z_max=1.215, offset=0.008, thickness=0.010, bevel=0.003,
        ))

    for side, face_set in (("L", 15), ("R", 16)):
        # Front-weighted shin shell leaves an intentional dark rear tendon gap.
        shells.append(surface_shell(
            f"Armor.Greave.{side}", body, rig, armor, ivory, {face_set},
            z_min=0.095, z_max=0.505, y_max=0.065,
            offset=0.008, thickness=0.011, bevel=0.003,
        ))
    for side, face_set in (("L", 14), ("R", 13)):
        shells.append(surface_shell(
            f"Armor.Sabaton.{side}", body, rig, armor, ivory, {face_set},
            z_max=0.155, offset=0.008, thickness=0.009, bevel=0.0025,
        ))

    # Side/front tassets use the official thigh face sets.  They remain curved
    # to the actual upper-leg anatomy rather than becoming hanging boxes.
    shells.append(surface_shell(
        "Armor.Tasset.L.SurfaceShell", body, rig, armor, ivory, {24},
        z_min=0.690, z_max=0.935, y_max=0.055, x_min=0.045,
        offset=0.016, thickness=0.011, bevel=0.003,
    ))
    shells.append(surface_shell(
        "Armor.Tasset.R.SurfaceShell", body, rig, armor, ivory, {23},
        z_min=0.690, z_max=0.935, y_max=0.055, x_max=-0.045,
        offset=0.016, thickness=0.011, bevel=0.003,
    ))

    # Four overlapping, flared fauld bands.  They are independent plates and
    # each lower lip carries a rolled gold edge.
    faulds = [
        (1.120, 1.060, 0.196, 0.165, 0.207, 0.177),
        (1.065, 1.005, 0.204, 0.174, 0.217, 0.187),
        (1.010, 0.950, 0.213, 0.184, 0.228, 0.198),
        (0.955, 0.895, 0.223, 0.194, 0.240, 0.208),
    ]
    for index, (zt, zb, rxt, ryt, rxb, ryb) in enumerate(faulds, start=1):
        band = elliptical_band(
            f"Armor.Fauld.Band{index}", zt, zb, rxt, ryt, rxb, ryb, -0.025,
            ivory if index != 1 else gold, details, thickness=0.009,
        )
        created.append(band)
        edge_points = ellipse_points(zb - 0.002, rxb, ryb, -0.025, count=48)
        edge = elliptical_curve(
            f"Armor.Fauld.Band{index}.RolledGoldEdge", edge_points, gold, details,
            bevel_depth=0.0055, cyclic=True,
        )
        created.append(edge)

    # Tasset segmentation and hip suspension studs.
    for side in (-1.0, 1.0):
        x = side * 0.142
        for index, z in enumerate((0.865, 0.800, 0.735), start=1):
            created.append(rounded_box(
                f"Armor.Tasset.{side:+.0f}.RaisedLame{index}",
                (x, -0.151, z), (0.122, 0.016, 0.016), gold, details,
                bevel=0.005, rotation=(0.0, side * 0.035, 0.0),
            ))
        created.append(uv_ellipsoid(
            f"Armor.Tasset.{side:+.0f}.HipStud", (side * 0.145, -0.158, 0.915),
            (0.017, 0.009, 0.017), cyan, details, segments=28,
        ))

    # Elbow cops are flattened side plates; poleyns are crowned front plates.
    for side in (-1.0, 1.0):
        created.append(convex_plate(
            f"Armor.ElbowCop.{side:+.0f}", (side * 0.346, -0.015, 1.232),
            0.115, 0.165, 0.052, "X", ivory, details,
        ))
        created.append(convex_plate(
            f"Armor.ElbowCopWing.{side:+.0f}", (side * 0.374, -0.010, 1.236),
            0.072, 0.115, 0.031, "X", gold, details, wing=0.08,
        ))
        created.append(convex_plate(
            f"Armor.Poleyn.{side:+.0f}", (side * 0.156, -0.103, 0.512),
            0.178, 0.190, 0.060, "Y", ivory, details,
        ))
        created.append(convex_plate(
            f"Armor.PoleynGoldWing.{side:+.0f}", (side * 0.204, -0.110, 0.520),
            0.090, 0.112, 0.034, "Y", gold, details, wing=0.08,
        ))

    # Vambrace and greave rolled edges.  These cleanly terminate the extracted
    # shell boundaries, which are intentionally based on face sets.
    for side in (-1.0, 1.0):
        created.append(rounded_box(
            f"Armor.VambraceCuff.{side:+.0f}", (side * 0.407, -0.060, 1.010),
            (0.075, 0.085, 0.025), gold, details, bevel=0.007,
            rotation=(0.10, side * 0.14, 0.0),
        ))
        created.append(rounded_box(
            f"Armor.GreaveTop.{side:+.0f}", (side * 0.162, -0.074, 0.445),
            (0.145, 0.060, 0.032), gold, details, bevel=0.009,
            rotation=(0.04, side * 0.03, 0.0),
        ))

    # Gorget and anatomical chest reinforcement.
    created.append(elliptical_band(
        "Armor.Gorget", 1.585, 1.535, 0.135, 0.117, 0.145, 0.130, -0.015,
        ivory, details, thickness=0.010,
    ))
    created.append(elliptical_curve(
        "Armor.Gorget.GoldRoll", ellipse_points(1.555, 0.142, 0.128, -0.015, count=48),
        gold, details, bevel_depth=0.0055, cyclic=True,
    ))
    # Pectoral sweep seams follow the chest rather than forming a square box.
    for side in (-1.0, 1.0):
        points = [
            (side * 0.012, -0.202, 1.435),
            (side * 0.070, -0.207, 1.455),
            (side * 0.135, -0.196, 1.438),
            (side * 0.186, -0.174, 1.395),
        ]
        created.append(elliptical_curve(
            f"Armor.Cuirass.PectoralSweep.{side:+.0f}", points, gold, details,
            bevel_depth=0.005,
        ))
        points = [
            (side * 0.020, -0.202, 1.255),
            (side * 0.080, -0.202, 1.238),
            (side * 0.145, -0.189, 1.250),
        ]
        created.append(elliptical_curve(
            f"Armor.Cuirass.AbdominalSweep.{side:+.0f}", points, gold, details,
            bevel_depth=0.0045,
        ))

    # Raised cross and contained spirit stone.  Thin relief preserves the
    # anatomical shell underneath.
    created.extend([
        rounded_box("Armor.Cuirass.CrossVertical", (0.0, -0.211, 1.345), (0.044, 0.026, 0.255), gold, details, bevel=0.008),
        rounded_box("Armor.Cuirass.CrossHorizontal", (0.0, -0.214, 1.408), (0.250, 0.026, 0.044), gold, details, bevel=0.008),
        uv_ellipsoid("Armor.Cuirass.SpiritStone", (0.0, -0.232, 1.408), (0.026, 0.012, 0.026), cyan, details, segments=32),
    ])

    # Backplate spine ridge and shoulder-blade seams remain subtle in back view.
    created.append(rounded_box(
        "Armor.Backplate.SpineRidge", (0.0, 0.139, 1.335),
        (0.030, 0.021, 0.300), gold, details, bevel=0.007,
    ))
    for side in (-1.0, 1.0):
        created.append(elliptical_curve(
            f"Armor.Backplate.ScapularSeam.{side:+.0f}",
            [(side * 0.018, 0.140, 1.465), (side * 0.090, 0.143, 1.440), (side * 0.165, 0.127, 1.390)],
            gold, details, bevel_depth=0.0045,
        ))

    # Purpose-built rounded great helm.  It has a stepped crown, brow ring,
    # panel seams and rivets, so the silhouette reads as forged plate.
    helmet = helmet_lathe("Armor.Helmet.RoundedGreatHelm", ivory, details)
    created.append(helmet)
    created.append(elliptical_curve(
        "Armor.Helmet.BrowSeam", ellipse_points(1.805, 0.1455, 0.1515, -0.026, count=56),
        gold, details, bevel_depth=0.006, cyclic=True,
    ))
    created.append(elliptical_curve(
        "Armor.Helmet.JawSeam", ellipse_points(1.590, 0.136, 0.144, -0.026, count=56),
        gold, details, bevel_depth=0.0045, cyclic=True,
    ))
    # Crown ridge follows the domed top front-to-back.
    created.append(elliptical_curve(
        "Armor.Helmet.CrownRidge",
        [(0.0, -0.166, 1.820), (0.0, -0.125, 1.910), (0.0, -0.010, 1.958), (0.0, 0.105, 1.910), (0.0, 0.128, 1.820)],
        gold, details, bevel_depth=0.007,
    ))
    # Dark recesses sit in front; raised gold geometry around them forms the
    # eye-to-mouth cross requested for this crusader design.
    created.extend([
        rounded_box("Armor.Helmet.CrossGoldHorizontal", (0.0, -0.176, 1.766), (0.255, 0.023, 0.050), gold, details, bevel=0.009),
        rounded_box("Armor.Helmet.CrossGoldVertical", (0.0, -0.178, 1.690), (0.052, 0.024, 0.228), gold, details, bevel=0.009),
        rounded_box("Armor.Helmet.EyeSlit", (0.0, -0.190, 1.766), (0.218, 0.013, 0.020), dark, details, bevel=0.004),
        rounded_box("Armor.Helmet.BreathSlit", (0.0, -0.192, 1.690), (0.018, 0.013, 0.150), dark, details, bevel=0.004),
        uv_ellipsoid("Armor.Helmet.ForeheadRune", (0.0, -0.191, 1.842), (0.018, 0.009, 0.023), cyan, details, segments=28),
    ])
    for side in (-1.0, 1.0):
        created.append(elliptical_curve(
            f"Armor.Helmet.CheekSeam.{side:+.0f}",
            [(side * 0.110, -0.145, 1.775), (side * 0.126, -0.138, 1.700), (side * 0.118, -0.130, 1.620)],
            gold, details, bevel_depth=0.004,
        ))
        created.append(uv_ellipsoid(
            f"Armor.Helmet.SidePivot.{side:+.0f}",
            (side * 0.144, -0.010, 1.710), (0.012, 0.014, 0.012), gold, details, segments=28,
        ))
    created.extend(create_rivet_rows(details, gold, cyan))

    # Decorative seam strips on the top and middle pauldron lames.
    for side in (-1.0, 1.0):
        x = side * 0.258
        created.append(elliptical_curve(
            f"Armor.Pauldron.{side:+.0f}.GoldRidge",
            [(x * 0.78, -0.095, 1.505), (x, -0.055, 1.485), (x * 1.15, -0.015, 1.430)],
            gold, details, bevel_depth=0.006,
        ))

    for obj in [*shells, *created]:
        obj["armor_set"] = "Human Base Sculpt Crusader Surface Shell v1"
        obj["target_height_m"] = 1.90

    # Rigid forged details receive sensible Rigify bone parents.  The deforming
    # surface shells already carry the source weights and an Armature modifier.
    for obj in created:
        name = obj.name
        bone = None
        if name.startswith("Armor.Helmet"):
            bone = "DEF-spine.006"
        elif name.startswith("Armor.Gorget"):
            bone = "DEF-spine.004"
        elif name.startswith(("Armor.Cuirass", "Armor.Backplate")):
            bone = "DEF-spine.003"
        elif name.startswith("Armor.Fauld"):
            bone = "DEF-spine.001"
        elif name.startswith("Armor.Tasset"):
            bone = "DEF-thigh.L" if "+1" in name else "DEF-thigh.R"
        elif name.startswith(("Armor.ElbowCop", "Armor.VambraceCuff")):
            bone = "DEF-forearm.L" if "+1" in name else "DEF-forearm.R"
        elif name.startswith(("Armor.Poleyn", "Armor.GreaveTop")):
            bone = "DEF-shin.L" if "+1" in name else "DEF-shin.R"
        elif name.startswith("Armor.Pauldron"):
            bone = "DEF-upper_arm.L" if "+1" in name else "DEF-upper_arm.R"
        if bone:
            attach_rig(obj, rig, bone)

    return {
        "surface_shell_count": len(shells),
        "forged_detail_count": len(created),
        "surface_shell_names": [obj.name for obj in shells],
        "forged_detail_names": [obj.name for obj in created],
    }


# ---------------------------------------------------------------------------
# Bright neutral presentation


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_stage(stage: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=1.18, depth=0.09, location=(0.0, 0.0, -0.050))
    plinth = bpy.context.object
    plinth.name = "Preview.Plinth"
    material_slot(plinth, mats["plinth"])
    add_bevel(plinth, 0.020, 4)
    smooth(plinth)
    link_only(plinth, stage)

    bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0.0, 0.0, -0.102))
    floor = bpy.context.object
    floor.name = "Preview.Floor"
    material_slot(floor, mats["floor"])
    link_only(floor, stage)

    bpy.ops.object.camera_add(location=(0.0, -5.4, 1.13))
    camera = bpy.context.object
    camera.name = "Preview.Camera"
    camera.data.lens = 72
    camera.data.sensor_width = 36
    point_at(camera, (0.0, 0.0, 0.98))
    link_only(camera, stage)
    bpy.context.scene.camera = camera

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        lamp = bpy.data.objects.new(name, data)
        stage.objects.link(lamp)
        lamp.location = location
        point_at(lamp, (0.0, 0.0, 1.05))
        return lamp

    area("Preview.Key", (-3.4, -4.2, 5.4), 1450, (1.0, 0.86, 0.67), 4.0)
    area("Preview.Fill", (3.5, -2.8, 3.3), 1050, (0.63, 0.78, 1.0), 3.5)
    area("Preview.Rim", (0.0, 3.5, 4.5), 1750, (1.0, 0.73, 0.34), 3.0)
    area("Preview.FrontSoft", (0.0, -2.0, 1.4), 450, (0.90, 0.96, 1.0), 2.0)
    return camera


def setup_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 840
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.render.use_file_extension = True
    scene.render.image_settings.compression = 18
    scene.world.color = (0.055, 0.075, 0.110)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.resolution_percentage = 100


def render_views(camera: bpy.types.Object) -> dict[str, str]:
    views = {
        "front": ((0.0, -5.25, 1.18), (0.0, 0.0, 0.98)),
        "back": ((0.0, 5.25, 1.18), (0.0, 0.0, 0.98)),
        "side": ((4.75, -0.05, 1.18), (0.0, 0.0, 0.98)),
        "three_quarter": ((3.35, -4.45, 1.45), (0.0, 0.0, 1.02)),
    }
    outputs = {}
    for name, (location, target) in views.items():
        camera.location = location
        point_at(camera, target)
        bpy.context.view_layer.update()
        path = OUT / f"human_base_sculpt_armor_{name}.png"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs[name] = str(path)
        print("RENDER", name, path)
    return outputs


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    body, rig = require_source()
    reset_neutral(rig)
    remove_previous()
    armor = new_collection(ARMOR_COLLECTION)
    details = new_collection(DETAIL_COLLECTION)
    stage = new_collection(STAGE_COLLECTION)

    materials = {
        "ivory": make_material("HBS.IvoryPlate", (0.86, 0.79, 0.62, 1.0), metallic=0.72, roughness=0.29, clearcoat=0.22),
        "gold": make_material("HBS.SunGold", (0.95, 0.52, 0.075, 1.0), metallic=0.88, roughness=0.23, clearcoat=0.27),
        "dark": make_material("HBS.VisorDark", (0.006, 0.010, 0.020, 1.0), metallic=0.48, roughness=0.31),
        "cyan": make_material("HBS.SpiritCyan", (0.025, 0.78, 1.0, 1.0), metallic=0.15, roughness=0.18, emission_strength=3.5),
        "floor": make_material("HBS.PreviewFloor", (0.18, 0.22, 0.30, 1.0), metallic=0.0, roughness=0.82),
        "plinth": make_material("HBS.PreviewPlinth", (0.60, 0.49, 0.34, 1.0), metallic=0.20, roughness=0.52),
    }
    chain = make_chain_material()
    body.data.materials.clear()
    body.data.materials.append(chain)
    body.data.materials.append(materials["ivory"])
    # The source asset divides each toe into separate sculpt face sets.  Keep
    # that exact articulated anatomy and shade only the foot region as plate;
    # this avoids replacing the official digits with a smooth "clown shoe".
    for polygon in body.data.polygons:
        polygon.material_index = 1 if polygon.center.z < 0.165 else 0
    smooth(body)
    for eye_name in ("HumanBaseSculpt.Eye.L", "HumanBaseSculpt.Eye.R"):
        eye = bpy.data.objects.get(eye_name)
        if eye:
            material_slot(eye, materials["dark"])

    build_report = build_armor(body, rig, armor, details, materials)
    camera = build_stage(stage, materials)
    setup_render()

    # Hide controllers/metarig but retain both rigs in the saved reusable file.
    rig.hide_render = True
    rig.hide_set(True)
    metarig = bpy.data.objects.get("HumanBaseSculpt.Metarig")
    if metarig:
        metarig.hide_render = True
        metarig.hide_set(True)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    renders = render_views(camera)
    # Save again with the front view active for an immediately useful opening.
    camera.location = (0.0, -5.25, 1.18)
    point_at(camera, (0.0, 0.0, 0.98))
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

    report = {
        "name": "Human Base Sculpt Crusader Surface Shell Armor",
        "blender_version": bpy.app.version_string,
        "source": {
            "blend": str(ROOT / "artifacts" / "human-base-sculpt-rig" / "human_base_sculpt_male_190cm_rigify.blend"),
            "body_object": BODY_NAME,
            "eye_objects": ["HumanBaseSculpt.Eye.L", "HumanBaseSculpt.Eye.R"],
            "body_and_eyes_geometry_and_topology_unchanged": True,
            "preview_material_assignments_changed": True,
            "official_face_set_attribute": ".sculpt_face_set",
            "official_asset": "Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0",
        },
        "design": {
            "target_height_m": 1.90,
            "silhouette": "anatomical plate shell; four overlapping faulds; side tassets; three-lame pauldrons",
            "joint_protection": "flattened elbow cops and crowned poleyns; no spherical joint balls",
            "helmet": "rounded stepped great helm with brow and jaw seams, crown ridge, cross visor and rivets",
            "materials": {
                "ivory": "primary forged plate, metallic 0.72 roughness 0.29",
                "gold": "rolled edges, seams and heraldic cross, metallic 0.88 roughness 0.23",
                "dark": "chain/cloth joint gaps and visor recess",
                "cyan": "small spirit stones only",
            },
        },
        "collections": {
            "surface_shells": ARMOR_COLLECTION,
            "forged_details": DETAIL_COLLECTION,
            "preview_stage": STAGE_COLLECTION,
        },
        "geometry": build_report,
        "outputs": {"blend": str(BLEND_PATH), "report": str(REPORT_PATH), "stills": renders},
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("BLEND", BLEND_PATH)
    print("REPORT", REPORT_PATH)


if __name__ == "__main__":
    main()

"""Rig Blender's official Human Base Meshes sculpting-oriented adult male.

Run from the repository root with the project-local Blender build:

  tools/runtime/blender-5.2.0-windows-x64/blender.exe --background \
    --python scripts/create_human_base_sculpt_rig.py

The script appends the exact ``Body Male - Realistic`` CC0 asset from the
official Human Base Meshes v1.4.1 bundle.  It keeps the base topology, UVs,
sculpt face sets, and Multires modifier intact, scales the body to 1.90 m,
fits a Rigify Basic Human metarig to anatomical face-set boundaries, creates
the generated control rig, binds at base subdivision, and restores Multires.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE_BLEND = (
    ROOT
    / "tools"
    / "runtime"
    / "asset-sources"
    / "blender-human-base-meshes-v1.4.1"
    / "human_base_meshes_bundle.blend"
)
OUT = ROOT / "artifacts" / "human-base-sculpt-rig"
BLEND_PATH = OUT / "human_base_sculpt_male_190cm_rigify.blend"
REPORT_PATH = OUT / "human_base_sculpt_male_190cm_report.json"
NEUTRAL_FRONT_PATH = OUT / "human_base_sculpt_neutral_front.png"
NEUTRAL_3Q_PATH = OUT / "human_base_sculpt_neutral_3q.png"
POSE_PATH = OUT / "human_base_sculpt_pose_test.png"

ASSET_COLLECTION = "Body Male - Realistic"
BODY_SOURCE_NAME = "GEO-body_male_realistic"
EYE_SOURCE_NAMES = (
    "GEO-body_male_realistic.eye.L",
    "GEO-body_male_realistic.eye.R",
)
TARGET_HEIGHT_M = 1.90


def enable_addon(module: str) -> None:
    if module in bpy.context.preferences.addons:
        return
    result = bpy.ops.preferences.addon_enable(module=module)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not enable add-on {module!r}: {result}")


def clear_scene() -> None:
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.users == 0:
            bpy.data.collections.remove(collection)


def append_official_asset() -> tuple[bpy.types.Collection, bpy.types.Object, list[bpy.types.Object]]:
    if not SOURCE_BLEND.exists():
        raise FileNotFoundError(f"Official Human Base Mesh bundle not found: {SOURCE_BLEND}")

    with bpy.data.libraries.load(str(SOURCE_BLEND), link=False, assets_only=True) as (data_from, data_to):
        if ASSET_COLLECTION not in data_from.collections:
            raise RuntimeError(
                f"Expected asset collection {ASSET_COLLECTION!r}; available: {data_from.collections}"
            )
        data_to.collections = [ASSET_COLLECTION]

    collection = data_to.collections[0]
    if collection is None:
        raise RuntimeError("Blender returned an empty appended collection")
    bpy.context.scene.collection.children.link(collection)
    # Library-appended child matrices are stale until the dependency graph is
    # evaluated once; without this, both eye snapshots inherit the body origin.
    bpy.context.view_layer.update()
    collection.name = "HUMAN_BASE_SCULPT_SOURCE"

    body = bpy.data.objects.get(BODY_SOURCE_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Expected body mesh {BODY_SOURCE_NAME!r} in appended collection")
    eyes = [bpy.data.objects[name] for name in EYE_SOURCE_NAMES]
    return collection, body, eyes


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(point[i] for point in points) for i in range(3)))
    maximum = Vector(tuple(max(point[i] for point in points) for i in range(3)))
    return minimum, maximum


def normalize_asset(body: bpy.types.Object, eyes: list[bpy.types.Object]) -> dict:
    """Move the source to the origin and bake a uniform 1.90 m transform.

    The asset's object transforms are baked, but no mesh modifier is applied and
    no topology is changed.  Eye parenting is temporarily cleared so all source
    objects receive the same world-space normalization matrix.
    """

    minimum, maximum = world_bounds(body)
    source_height = maximum.z - minimum.z
    scale = TARGET_HEIGHT_M / source_height
    center_x = (minimum.x + maximum.x) * 0.5
    transform = (
        Matrix.Translation((0.0, 0.0, -minimum.z * scale))
        @ Matrix.Scale(scale, 4)
        @ Matrix.Translation((-center_x, 0.0, 0.0))
    )

    objects = [body, *eyes]
    snapshots = {obj.name: obj.matrix_world.copy() for obj in objects}
    for obj in objects:
        obj.parent = None
    body.matrix_world = transform @ snapshots[body.name]
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    result = bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not bake the normalization transform for {body.name}: {result}")

    # These eye meshes are children with non-trivial parent inverses in the
    # source asset.  Keep their translated object origins at the actual eye
    # centers, while baking only rotation/scale.  Applying eye *location* in
    # headless mode collapses the spheres to the world origin in Blender 5.2.
    for eye in eyes:
        target_matrix = transform @ snapshots[eye.name]
        eye.matrix_world = target_matrix
        bpy.ops.object.select_all(action="DESELECT")
        eye.select_set(True)
        bpy.context.view_layer.objects.active = eye
        result = bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        if "FINISHED" not in result:
            raise RuntimeError(f"Could not bake the eye rotation/scale for {eye.name}: {result}")

    body.name = "HumanBaseSculpt.Body"
    eyes[0].name = "HumanBaseSculpt.Eye.L"
    eyes[1].name = "HumanBaseSculpt.Eye.R"

    final_minimum, final_maximum = world_bounds(body)
    return {
        "source_height_m": float(source_height),
        "uniform_scale": float(scale),
        "source_world_bounds": {"min": list(minimum), "max": list(maximum)},
        "final_world_bounds": {"min": list(final_minimum), "max": list(final_maximum)},
    }


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float = 0.0,
    roughness: float = 0.65,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return material


def set_preview_materials(body: bpy.types.Object, eyes: list[bpy.types.Object]) -> None:
    clay = make_material("Sculpt clay", (0.34, 0.44, 0.54, 1.0), roughness=0.76)
    dark = make_material("Eye neutral", (0.025, 0.035, 0.05, 1.0), roughness=0.3)
    body.data.materials.clear()
    body.data.materials.append(clay)
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    for eye in eyes:
        eye.data.materials.clear()
        eye.data.materials.append(dark)
        for polygon in eye.data.polygons:
            polygon.use_smooth = True


class FaceSetLandmarks:
    """Read joint locations from boundaries between the official sculpt face sets."""

    def __init__(self, body: bpy.types.Object):
        self.body = body
        self.mesh = body.data
        attribute = self.mesh.attributes.get(".sculpt_face_set")
        if attribute is None or attribute.domain != "FACE":
            raise RuntimeError("Official .sculpt_face_set face attribute is missing")
        self.face_set = attribute
        self.edge_face_sets: dict[tuple[int, int], set[int]] = defaultdict(set)
        self.vertices_by_set: dict[int, set[int]] = defaultdict(set)
        for polygon in self.mesh.polygons:
            face_id = int(attribute.data[polygon.index].value)
            self.vertices_by_set[face_id].update(polygon.vertices)
            for edge in polygon.edge_keys:
                self.edge_face_sets[tuple(sorted(edge))].add(face_id)

    def boundary_vertices(self, a: int, b: int) -> list[Vector]:
        wanted = {a, b}
        indices: set[int] = set()
        for edge, face_ids in self.edge_face_sets.items():
            if wanted.issubset(face_ids):
                indices.update(edge)
        return [self.mesh.vertices[index].co.copy() for index in sorted(indices)]

    def boundary(self, a: int, b: int, fallback: tuple[float, float, float]) -> Vector:
        vertices = self.boundary_vertices(a, b)
        if not vertices:
            return Vector(fallback)
        return sum(vertices, Vector()) / len(vertices)

    def center(self, face_id: int) -> Vector:
        indices = self.vertices_by_set[face_id]
        return sum((self.mesh.vertices[index].co for index in indices), Vector()) / len(indices)

    def bounds(self, face_id: int) -> tuple[Vector, Vector]:
        vertices = [self.mesh.vertices[index].co for index in self.vertices_by_set[face_id]]
        minimum = Vector(tuple(min(point[i] for point in vertices) for i in range(3)))
        maximum = Vector(tuple(max(point[i] for point in vertices) for i in range(3)))
        return minimum, maximum


def build_landmarks(body: bpy.types.Object) -> tuple[FaceSetLandmarks, dict[str, Vector], dict]:
    fs = FaceSetLandmarks(body)

    # Official v1.4.1 face-set map.  Positive X is anatomical left in Blender.
    pair_map = {
        "shoulder.L": (1, 21, (0.20, 0.0, 1.54)),
        "elbow.L": (21, 12, (0.34, -0.01, 1.22)),
        "wrist.L": (12, 9, (0.43, -0.05, 0.99)),
        "hip.L": (18, 24, (0.12, 0.0, 0.92)),
        "knee.L": (24, 15, (0.15, 0.02, 0.50)),
        "ankle.L": (15, 14, (0.21, 0.04, 0.08)),
        "shoulder.R": (1, 20, (-0.20, 0.0, 1.54)),
        "elbow.R": (20, 11, (-0.34, -0.01, 1.22)),
        "wrist.R": (11, 10, (-0.43, -0.05, 0.99)),
        "hip.R": (18, 23, (-0.12, 0.0, 0.92)),
        "knee.R": (23, 16, (-0.15, 0.02, 0.50)),
        "ankle.R": (16, 13, (-0.21, 0.04, 0.08)),
    }
    points: dict[str, Vector] = {}
    diagnostics: dict[str, dict] = {}
    for name, (a, b, fallback) in pair_map.items():
        boundary_vertices = fs.boundary_vertices(a, b)
        point = fs.boundary(a, b, fallback)
        points[name] = point
        diagnostics[name] = {
            "face_sets": [a, b],
            "boundary_vertex_count": len(boundary_vertices),
            "position_m": [round(float(value), 6) for value in point],
            "used_fallback": not bool(boundary_vertices),
        }

    for side, hand_set, foot_set in (("L", 9, 14), ("R", 10, 13)):
        hand_center = fs.center(hand_set)
        wrist = points[f"wrist.{side}"]
        direction = hand_center - wrist
        if direction.length < 1e-5:
            direction = Vector((0.04 if side == "L" else -0.04, -0.02, -0.09))
        points[f"hand_tip.{side}"] = wrist + direction.normalized() * 0.115

        foot_min, foot_max = fs.bounds(foot_set)
        ankle = points[f"ankle.{side}"]
        points[f"foot_ball.{side}"] = Vector(
            ((foot_min.x + foot_max.x) * 0.5, foot_min.y + (foot_max.y - foot_min.y) * 0.30, 0.035)
        )
        points[f"toe_tip.{side}"] = Vector(
            ((foot_min.x + foot_max.x) * 0.5, foot_min.y - 0.035, 0.035)
        )
        # Keep the ankle X from the boundary; feet are allowed to fan naturally.
        points[f"foot_ball.{side}"].x = ankle.x
        points[f"toe_tip.{side}"].x = ankle.x

    return fs, points, diagnostics


def set_edit_bone(edit_bones, name: str, head: Vector, tail: Vector) -> None:
    bone = edit_bones.get(name)
    if bone is None:
        raise RuntimeError(f"Rigify metarig is missing expected bone {name!r}")
    bone.head = head
    bone.tail = tail


def create_fitted_metarig(body: bpy.types.Object, points: dict[str, Vector]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    result = bpy.ops.object.armature_basic_human_metarig_add()
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not add Rigify Basic Human metarig: {result}")
    metarig = bpy.context.object
    metarig.name = "HumanBaseSculpt.Metarig"
    metarig.location = (0.0, 0.0, 0.0)
    metarig.show_in_front = True

    hip_center = (points["hip.L"] + points["hip.R"]) * 0.5
    shoulder_center = (points["shoulder.L"] + points["shoulder.R"]) * 0.5
    body_min, body_max = world_bounds(body)
    root_z = hip_center.z + 0.015
    shoulder_z = shoulder_center.z
    top_z = body_max.z - 0.012
    neck_base_z = max(shoulder_z + 0.055, top_z - 0.31)
    z_chain = (
        root_z,
        root_z + (neck_base_z - root_z) * 0.20,
        root_z + (neck_base_z - root_z) * 0.42,
        root_z + (neck_base_z - root_z) * 0.70,
        shoulder_z + 0.025,
        neck_base_z,
        neck_base_z + (top_z - neck_base_z) * 0.27,
        top_z,
    )

    bpy.context.view_layer.objects.active = metarig
    bpy.ops.object.mode_set(mode="EDIT")
    bones = metarig.data.edit_bones

    spine_names = ("spine", "spine.001", "spine.002", "spine.003", "spine.004", "spine.005", "spine.006")
    for index, name in enumerate(spine_names):
        y_head = 0.012 - index * 0.004
        y_tail = 0.012 - (index + 1) * 0.004
        set_edit_bone(bones, name, Vector((0.0, y_head, z_chain[index])), Vector((0.0, y_tail, z_chain[index + 1])))

    for side, sign in (("L", 1.0), ("R", -1.0)):
        shoulder = points[f"shoulder.{side}"]
        elbow = points[f"elbow.{side}"]
        wrist = points[f"wrist.{side}"]
        hand_tip = points[f"hand_tip.{side}"]
        hip = points[f"hip.{side}"]
        knee = points[f"knee.{side}"]
        ankle = points[f"ankle.{side}"]
        foot_ball = points[f"foot_ball.{side}"]
        toe_tip = points[f"toe_tip.{side}"]

        clavicle_start = Vector((0.020 * sign, shoulder.y, shoulder.z + 0.005))
        clavicle_end = shoulder - Vector((0.025 * sign, 0.0, 0.0))
        set_edit_bone(bones, f"shoulder.{side}", clavicle_start, clavicle_end)
        set_edit_bone(bones, f"upper_arm.{side}", shoulder, elbow)
        set_edit_bone(bones, f"forearm.{side}", elbow, wrist)
        set_edit_bone(bones, f"hand.{side}", wrist, hand_tip)

        set_edit_bone(bones, f"thigh.{side}", hip, knee)
        set_edit_bone(bones, f"shin.{side}", knee, ankle)
        set_edit_bone(bones, f"foot.{side}", ankle, foot_ball)
        set_edit_bone(bones, f"toe.{side}", foot_ball, toe_tip)
        heel = bones[f"heel.02.{side}"]
        heel.head = Vector((ankle.x - 0.035, 0.075, 0.012))
        heel.tail = Vector((ankle.x + 0.035, 0.075, 0.012))

        pelvis_tail = hip + Vector((0.0, 0.0, 0.13))
        set_edit_bone(bones, f"pelvis.{side}", Vector((0.0, 0.018, root_z)), pelvis_tail)

        breast_head = Vector((0.115 * sign, 0.025, root_z + (shoulder_z - root_z) * 0.68))
        breast_tail = breast_head + Vector((0.0, -0.12, 0.0))
        set_edit_bone(bones, f"breast.{side}", breast_head, breast_tail)

    bpy.ops.object.mode_set(mode="OBJECT")
    return metarig


def generate_rig(metarig: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    metarig.select_set(True)
    bpy.context.view_layer.objects.active = metarig
    result = bpy.ops.pose.rigify_generate()
    if "FINISHED" not in result:
        raise RuntimeError(f"Rigify generation failed: {result}")
    rig = bpy.context.object
    if rig is metarig or rig.type != "ARMATURE":
        candidates = [obj for obj in bpy.context.selected_objects if obj.type == "ARMATURE" and obj is not metarig]
        if not candidates:
            raise RuntimeError("Rigify completed but no generated armature was selected")
        rig = candidates[0]
    rig.name = "HumanBaseSculpt.Rig"
    rig.show_in_front = True
    metarig.hide_set(True)
    metarig.hide_render = True
    return rig


def clear_binding(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    if body.parent is rig:
        matrix = body.matrix_world.copy()
        body.parent = None
        body.matrix_world = matrix
    for modifier in list(body.modifiers):
        if modifier.type == "ARMATURE" and modifier.object is rig:
            body.modifiers.remove(modifier)
    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)


def bind_automatic_weights(body: bpy.types.Object, rig: bpy.types.Object) -> dict:
    multires_state = []
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            state = {
                "name": modifier.name,
                "levels": int(modifier.levels),
                "sculpt_levels": int(modifier.sculpt_levels),
                "render_levels": int(modifier.render_levels),
                "show_viewport": bool(modifier.show_viewport),
                "show_render": bool(modifier.show_render),
            }
            multires_state.append((modifier, state))
            # Non-destructive binding workaround: heat weights only need the
            # original cage, while the sculpt subdivisions remain stored.
            modifier.levels = 0
            modifier.sculpt_levels = 0
            modifier.render_levels = 0
            modifier.show_viewport = False
            modifier.show_render = False

    strategy = "direct_base_cage_automatic_weights"
    operator_result: list[str] = []
    fallback_reason = None
    try:
        bpy.ops.object.select_all(action="DESELECT")
        body.select_set(True)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        result = bpy.ops.object.parent_set(type="ARMATURE_AUTO", keep_transform=True)
        operator_result = sorted(result)
    except Exception as exc:  # Blender reports bone-heat failures as RuntimeError.
        fallback_reason = repr(exc)
        clear_binding(body, rig)
        strategy = "base_cage_proxy_automatic_weights"

        proxy = body.copy()
        proxy.data = body.data.copy()
        proxy.name = "HumanBaseSculpt.BindingProxy"
        bpy.context.scene.collection.objects.link(proxy)
        for modifier in list(proxy.modifiers):
            proxy.modifiers.remove(modifier)

        bpy.ops.object.select_all(action="DESELECT")
        proxy.select_set(True)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        result = bpy.ops.object.parent_set(type="ARMATURE_AUTO", keep_transform=True)
        operator_result = sorted(result)

        if len(proxy.data.vertices) != len(body.data.vertices):
            raise RuntimeError("Binding proxy topology changed unexpectedly")
        for proxy_group in proxy.vertex_groups:
            body.vertex_groups.new(name=proxy_group.name)
        for vertex in proxy.data.vertices:
            for assignment in vertex.groups:
                group_name = proxy.vertex_groups[assignment.group].name
                body.vertex_groups[group_name].add([vertex.index], assignment.weight, "REPLACE")
        armature_modifier = body.modifiers.new(name="Rigify deformation", type="ARMATURE")
        armature_modifier.object = rig
        body.parent = rig
        bpy.data.objects.remove(proxy, do_unlink=True)

    for modifier, state in multires_state:
        modifier.levels = state["levels"]
        modifier.sculpt_levels = state["sculpt_levels"]
        modifier.render_levels = state["render_levels"]
        modifier.show_viewport = state["show_viewport"]
        modifier.show_render = state["show_render"]

    deform_names = {bone.name for bone in rig.data.bones if bone.use_deform}
    deform_group_names = [group.name for group in body.vertex_groups if group.name in deform_names]
    weighted_vertices = 0
    minimum_weight = 1.0
    maximum_influences = 0
    for vertex in body.data.vertices:
        influences = [
            assignment.weight
            for assignment in vertex.groups
            if body.vertex_groups[assignment.group].name in deform_names and assignment.weight > 1e-8
        ]
        if influences:
            weighted_vertices += 1
            minimum_weight = min(minimum_weight, sum(influences))
            maximum_influences = max(maximum_influences, len(influences))

    if weighted_vertices == 0:
        raise RuntimeError("Automatic weighting produced no deform assignments")

    return {
        "strategy": strategy,
        "operator_result": operator_result,
        "fallback_reason": fallback_reason,
        "multires_temporarily_disabled": bool(multires_state),
        "multires_restored": [state for _, state in multires_state],
        "deform_bone_count": len(deform_names),
        "deform_vertex_group_count": len(deform_group_names),
        "weighted_vertices": weighted_vertices,
        "vertex_count": len(body.data.vertices),
        "coverage": weighted_vertices / len(body.data.vertices),
        "minimum_total_deform_weight": minimum_weight,
        "maximum_influences": maximum_influences,
    }


def bind_eyes_to_head(eyes: list[bpy.types.Object], rig: bpy.types.Object) -> str:
    candidates = ("DEF-spine.006", "ORG-spine.006", "spine_fk.004", "torso")
    bone_name = next((name for name in candidates if name in rig.pose.bones), None)
    if bone_name is None:
        raise RuntimeError("Could not find a generated head/torso bone for the eyes")
    for eye in eyes:
        # The normalized eye objects have their transforms baked and share the
        # armature's world origin.  A rigid 1.0 vertex group is therefore more
        # reliable than object bone-parenting (which adds a bone-tail offset).
        group = eye.vertex_groups.get(bone_name) or eye.vertex_groups.new(name=bone_name)
        group.add(range(len(eye.data.vertices)), 1.0, "REPLACE")
        modifier = eye.modifiers.new(name="Rigify head deformation", type="ARMATURE")
        modifier.object = rig
        matrix = eye.matrix_world.copy()
        eye.parent = rig
        eye.parent_type = "OBJECT"
        eye.matrix_parent_inverse = rig.matrix_world.inverted()
        eye.matrix_world = matrix
    return bone_name


def key_pose(rig: bpy.types.Object, frame: int, rotations: dict[str, tuple[float, float, float]]) -> None:
    controls = (
        "upper_arm_fk.L",
        "upper_arm_fk.R",
        "forearm_fk.L",
        "forearm_fk.R",
        "thigh_fk.L",
        "thigh_fk.R",
        "shin_fk.L",
        "shin_fk.R",
        "torso",
    )
    for name in ("upper_arm_parent.L", "upper_arm_parent.R", "thigh_parent.L", "thigh_parent.R"):
        bone = rig.pose.bones.get(name)
        if bone is not None and "IK_FK" in bone:
            bone["IK_FK"] = 1.0
            bone.keyframe_insert(data_path='["IK_FK"]', frame=frame, group=name)
    for name in controls:
        bone = rig.pose.bones.get(name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = rotations.get(name, (0.0, 0.0, 0.0))
        bone.scale = (1.0, 1.0, 1.0)
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)


def create_pose_test(rig: bpy.types.Object) -> dict:
    action = bpy.data.actions.new("POSE_TEST_ELBOW_KNEE_SHOULDER")
    rig.animation_data_create()
    rig.animation_data.action = action
    rad = math.radians
    key_pose(rig, 1, {})
    key_pose(
        rig,
        20,
        {
            "upper_arm_fk.L": (rad(-18), rad(-10), rad(24)),
            "upper_arm_fk.R": (rad(12), rad(6), rad(-18)),
        },
    )
    key_pose(
        rig,
        40,
        {
            "upper_arm_fk.L": (rad(-18), rad(-10), rad(24)),
            "forearm_fk.L": (rad(-72), rad(8), rad(4)),
            "upper_arm_fk.R": (rad(12), rad(6), rad(-18)),
            "forearm_fk.R": (rad(-48), rad(-4), rad(-3)),
        },
    )
    key_pose(
        rig,
        60,
        {
            "upper_arm_fk.L": (rad(-18), rad(-10), rad(24)),
            "forearm_fk.L": (rad(-72), rad(8), rad(4)),
            "upper_arm_fk.R": (rad(12), rad(6), rad(-18)),
            "forearm_fk.R": (rad(-48), rad(-4), rad(-3)),
            "thigh_fk.L": (rad(30), rad(-3), rad(5)),
            "shin_fk.L": (rad(-58), rad(0), rad(0)),
            "thigh_fk.R": (rad(-8), rad(1), rad(-3)),
            "torso": (rad(2), rad(-2), rad(-4)),
        },
    )
    # Blender 5.2 stores curves in layered Action channel bags rather than the
    # legacy Action.fcurves collection.  Keyframe insertion already creates
    # Bezier interpolation, so no compatibility-only traversal is needed.
    return {
        "action": action.name,
        "frames": {"neutral": 1, "shoulders": 20, "elbows": 40, "knees_combined": 60},
        "controls": [
            "upper_arm_fk.L/R",
            "forearm_fk.L/R",
            "thigh_fk.L/R",
            "shin_fk.L/R",
            "torso",
        ],
    }


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_preview_scene() -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=0.72, depth=0.07, location=(0.0, 0.0, -0.045))
    plinth = bpy.context.object
    plinth.name = "Preview plinth"
    plinth.data.materials.append(make_material("Warm stone", (0.12, 0.10, 0.075, 1.0), roughness=0.86))

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.015, 0.025, 0.045, 1.0)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.32

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        point_at(obj, (0.0, 0.0, 1.02))
        return obj

    area("Key", (-2.8, -3.5, 4.2), 950.0, 2.7, (1.0, 0.78, 0.56))
    area("Fill", (3.0, -2.0, 2.8), 700.0, 2.4, (0.48, 0.70, 1.0))
    area("Rim", (0.0, 3.0, 3.4), 1100.0, 2.1, (1.0, 0.86, 0.58))

    camera_data = bpy.data.cameras.new("Preview Camera")
    camera = bpy.data.objects.new("Preview Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.data.lens = 66
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_start = 1
    scene.frame_end = 60
    return camera


def render_preview(camera: bpy.types.Object, path: Path, frame: int, position: tuple[float, float, float]) -> None:
    scene = bpy.context.scene
    scene.frame_set(frame)
    camera.location = position
    point_at(camera, (0.0, 0.0, 0.96))
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    enable_addon("rigify")
    clear_scene()

    source_collection, body, eyes = append_official_asset()
    source_metadata = {
        "collection": ASSET_COLLECTION,
        "description": source_collection.asset_data.description if source_collection.asset_data else None,
        "author": source_collection.asset_data.author if source_collection.asset_data else None,
        "license": "CC0",
        "bundle_version": "1.4.1",
    }
    original = {
        "vertices": len(body.data.vertices),
        "edges": len(body.data.edges),
        "polygons": len(body.data.polygons),
        "uv_layers": list(body.data.uv_layers.keys()),
        "attributes": list(body.data.attributes.keys()),
        "modifiers": [modifier.name for modifier in body.modifiers],
    }

    normalization = normalize_asset(body, eyes)
    set_preview_materials(body, eyes)
    face_sets, landmarks, landmark_report = build_landmarks(body)
    metarig = create_fitted_metarig(body, landmarks)
    rig = generate_rig(metarig)
    binding = bind_automatic_weights(body, rig)
    eye_bone = bind_eyes_to_head(eyes, rig)
    pose_test = create_pose_test(rig)

    camera = build_preview_scene()
    render_preview(camera, NEUTRAL_FRONT_PATH, 1, (0.0, -4.25, 1.03))
    render_preview(camera, NEUTRAL_3Q_PATH, 1, (2.75, -4.15, 1.38))
    render_preview(camera, POSE_PATH, 60, (2.85, -4.25, 1.35))
    bpy.context.scene.frame_set(1)

    reusable = bpy.data.collections.new("HUMAN_BASE_SCULPT_RIGGED")
    bpy.context.scene.collection.children.link(reusable)
    for obj in (body, *eyes, rig, metarig):
        for existing in list(obj.users_collection):
            existing.objects.unlink(obj)
        reusable.objects.link(obj)

    multires_final = [
        {
            "name": modifier.name,
            "levels": int(modifier.levels),
            "sculpt_levels": int(modifier.sculpt_levels),
            "render_levels": int(modifier.render_levels),
            "total_levels": int(modifier.total_levels),
            "show_viewport": bool(modifier.show_viewport),
            "show_render": bool(modifier.show_render),
        }
        for modifier in body.modifiers
        if modifier.type == "MULTIRES"
    ]
    final_min, final_max = world_bounds(body)
    report = {
        "blender_version": bpy.app.version_string,
        "source": {
            "path": str(SOURCE_BLEND),
            "sha256": sha256(SOURCE_BLEND),
            **source_metadata,
        },
        "body": {
            "object": body.name,
            "target_height_m": TARGET_HEIGHT_M,
            "actual_height_m": round(float(final_max.z - final_min.z), 6),
            "dimensions_m": [round(float(value), 6) for value in body.dimensions],
            "base_vertices": len(body.data.vertices),
            "base_edges": len(body.data.edges),
            "base_polygons": len(body.data.polygons),
            "sculpt_face_set_count": len(face_sets.vertices_by_set),
            "uv_layers": list(body.data.uv_layers.keys()),
            "multires": multires_final,
        },
        "preservation": {
            "base_vertex_count_unchanged": len(body.data.vertices) == original["vertices"],
            "base_edge_count_unchanged": len(body.data.edges) == original["edges"],
            "base_polygon_count_unchanged": len(body.data.polygons) == original["polygons"],
            "uv_layers_preserved": list(body.data.uv_layers.keys()) == original["uv_layers"],
            "sculpt_face_sets_preserved": ".sculpt_face_set" in body.data.attributes,
            "multires_preserved": bool(multires_final),
            "modifiers_never_applied": True,
        },
        "normalization": normalization,
        "landmarks": landmark_report,
        "rig": {
            "metarig": metarig.name,
            "metarig_bones": len(metarig.data.bones),
            "generated": rig.name,
            "generated_bones": len(rig.data.bones),
            "eye_parent_bone": eye_bone,
        },
        "binding": binding,
        "pose_test": pose_test,
        "outputs": {
            "blend": str(BLEND_PATH),
            "report": str(REPORT_PATH),
            "neutral_front": str(NEUTRAL_FRONT_PATH),
            "neutral_three_quarter": str(NEUTRAL_3Q_PATH),
            "pose_test": str(POSE_PATH),
        },
    }

    readme = bpy.data.texts.new("HUMAN_BASE_SCULPT_RIG_README.txt")
    readme.write(
        "Official Blender Human Base Meshes v1.4.1 / Body Male - Realistic / CC0.\n"
        "The exact base topology, UV map, sculpt face sets and Multires levels are retained.\n"
        "Collection HUMAN_BASE_SCULPT_RIGGED contains the reusable body, eyes, generated Rigify rig, and hidden metarig.\n"
        "Automatic heat weights were calculated with Multires temporarily set to level 0, then all original Multires levels were restored.\n"
        "Action POSE_TEST_ELBOW_KNEE_SHOULDER provides neutral, shoulder, elbow and knee deformation checks.\n"
    )

    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    print("HUMAN_BASE_SCULPT_REPORT", json.dumps(report, ensure_ascii=False))
    print("HUMAN_BASE_SCULPT_BLEND", BLEND_PATH)


if __name__ == "__main__":
    main()

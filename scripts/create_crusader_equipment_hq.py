"""Build reusable high-detail Crusader helmet and shield assets.

The equipment is authored at the project's 1.90 m human scale and intentionally
kept in two clean collections so another Blender file can append either asset.
All geometry, materials, lighting, inspection renders, and measurements are
generated without third-party dependencies.

Run with the project-local Blender build::

    blender.exe --background --python scripts/create_crusader_equipment_hq.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "human-base-sculpt-crusader-hq-v2" / "equipment-hq"
BLEND = OUT / "crusader_helmet_shield_hq.blend"
HELMET_FRONT = OUT / "helmet_front_1024.png"
HELMET_3Q = OUT / "helmet_3q_1024.png"
SHIELD_FRONT = OUT / "shield_front_1024.png"
SHIELD_BACK = OUT / "shield_back_3q_1024.png"
MEASUREMENTS = OUT / "equipment_measurements.json"

HELMET_COLLECTION = "CRUSADER_HELMET_HQ"
SHIELD_COLLECTION = "CRUSADER_SHIELD_HQ"
PRESENTATION_COLLECTION = "PRESENTATION_ONLY"


def srgb(hex_color: str, alpha: float = 1.0):
    value = hex_color.lstrip("#")
    rgb = [int(value[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]

    def linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (*[linear(c) for c in rgb], alpha)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def new_collection(name):
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj, collection):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def add_principled_material(name, color, metallic, roughness, *, bump_strength=0.0,
                            bump_distance=0.001, noise_scale=150.0, clearcoat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (620, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = 0.24
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    if bump_strength:
        tex = nodes.new("ShaderNodeTexNoise")
        tex.location = (-600, -80)
        tex.noise_dimensions = "3D"
        tex.inputs["Scale"].default_value = noise_scale
        tex.inputs["Detail"].default_value = 3.5
        tex.inputs["Roughness"].default_value = 0.72

        coarse = nodes.new("ShaderNodeTexNoise")
        coarse.location = (-600, 110)
        coarse.noise_dimensions = "3D"
        coarse.inputs["Scale"].default_value = 7.0
        coarse.inputs["Detail"].default_value = 6.0
        coarse.inputs["Roughness"].default_value = 0.82

        mix = nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 0.33
        mix.location = (-320, 0)
        links.new(tex.outputs["Fac"], mix.inputs[1])
        links.new(coarse.outputs["Fac"], mix.inputs[2])

        bump = nodes.new("ShaderNodeBump")
        bump.location = (30, -120)
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = bump_distance
        links.new(mix.outputs["Color"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

        rough_map = nodes.new("ShaderNodeMapRange")
        rough_map.location = (15, 105)
        rough_map.inputs["From Min"].default_value = 0.0
        rough_map.inputs["From Max"].default_value = 1.0
        rough_map.inputs["To Min"].default_value = max(0.08, roughness - 0.10)
        rough_map.inputs["To Max"].default_value = min(0.88, roughness + 0.16)
        links.new(coarse.outputs["Fac"], rough_map.inputs["Value"])
        links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])
    return mat


def add_emission_material(name, color, strength=4.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = strength
    mat.node_tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
    return mat


def make_mesh(name, vertices, faces, collection, materials, *, smooth=False):
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for material in materials:
        obj.data.materials.append(material)
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    return obj


def add_bevel(obj, width, segments=3, angle=0.52):
    modifier = obj.modifiers.new("Precision edge rounding", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = angle
    return modifier


def add_weighted_normals(obj):
    # Blender 4+ produces robust weighted shading through this geometry-node-free
    # operator when smoothing is enabled.
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(42.0))


def add_cube(name, location, scale, material, collection, *, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] / 2, scale[1] / 2, scale[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    if bevel:
        add_bevel(obj, bevel, 4)
    return obj


def add_sphere(name, location, radius, material, collection, scale=(1, 1, 1), segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(12, segments // 2),
                                       location=location, radius=radius)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    add_weighted_normals(obj)
    return obj


def add_cylinder(name, location, radius, depth, material, collection, *, vertices=48,
                 rotation=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                       location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    move_to_collection(obj, collection)
    if bevel:
        add_bevel(obj, bevel, 3)
    add_weighted_normals(obj)
    return obj


def curve_from_points(name, points, radius, material, collection, *, cyclic=False, resolution=3):
    data = bpy.data.curves.new(name + "_CURVE", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = resolution
    data.bevel_depth = radius
    data.bevel_resolution = 4
    data.resolution_u = 8
    spline = data.splines.new("NURBS" if not cyclic else "POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1.0)
    spline.use_cyclic_u = cyclic
    if not cyclic and len(points) >= 4:
        spline.order_u = min(4, len(points))
        spline.use_endpoint_u = True
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(material)
    return obj


def build_materials():
    return {
        "ivory": add_principled_material(
            "PBR_Hammered_Ivory_Steel", srgb("B7B19F"), 0.91, 0.31,
            bump_strength=0.17, bump_distance=0.0011, noise_scale=175.0, clearcoat=0.08,
        ),
        "gold": add_principled_material(
            "PBR_Aged_Holy_Gold", srgb("9A681D"), 0.88, 0.29,
            bump_strength=0.12, bump_distance=0.00075, noise_scale=215.0, clearcoat=0.07,
        ),
        "dark_gold": add_principled_material(
            "PBR_Darkened_Brass", srgb("4B3014"), 0.82, 0.38,
            bump_strength=0.10, bump_distance=0.0008, noise_scale=135.0,
        ),
        "dark_steel": add_principled_material(
            "PBR_Blackened_Steel", srgb("14181A"), 0.79, 0.36,
            bump_strength=0.12, bump_distance=0.00065, noise_scale=190.0,
        ),
        "slit": add_principled_material(
            "PBR_Eye_Slit_Black", srgb("020303"), 0.36, 0.15,
        ),
        "leather": add_principled_material(
            "PBR_Aged_Leather", srgb("342015"), 0.05, 0.57,
            bump_strength=0.24, bump_distance=0.0012, noise_scale=85.0,
        ),
        "leather_dark": add_principled_material(
            "PBR_Shield_Back_Leather", srgb("17110E"), 0.02, 0.69,
            bump_strength=0.24, bump_distance=0.0014, noise_scale=95.0,
        ),
        "cyan": add_emission_material("Spirit_Inset_Cyan", srgb("30D4DA"), 3.2),
    }


def helmet_profile(z):
    profile = [
        (1.505, 0.112, 0.101),
        (1.540, 0.123, 0.109),
        (1.610, 0.132, 0.119),
        (1.705, 0.136, 0.124),
        (1.790, 0.137, 0.125),
        (1.840, 0.133, 0.121),
        (1.885, 0.119, 0.108),
        (1.925, 0.089, 0.081),
        (1.952, 0.050, 0.046),
        (1.963, 0.012, 0.011),
    ]
    if z <= profile[0][0]:
        return profile[0][1:]
    if z >= profile[-1][0]:
        return profile[-1][1:]
    for a, b in zip(profile, profile[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return (a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
    return profile[-1][1:]


def helmet_front_y(x, z, extra=0.0):
    rx, ry = helmet_profile(z)
    normalized = min(0.999, abs(x) / max(rx, 0.001))
    return -ry * math.sqrt(max(0.0, 1.0 - normalized * normalized)) - extra


def build_helmet(materials, collection):
    rings = [
        (1.505, .112, .101), (1.540, .123, .109), (1.610, .132, .119),
        (1.705, .136, .124), (1.790, .137, .125), (1.840, .133, .121),
        (1.885, .119, .108), (1.925, .089, .081), (1.952, .050, .046),
        (1.963, .012, .011),
    ]
    segments = 96
    verts = []
    for z, rx, ry in rings:
        for index in range(segments):
            theta = 2 * math.pi * index / segments
            verts.append((rx * math.sin(theta), -ry * math.cos(theta), z))
    faces = []
    for ring in range(len(rings) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            a = ring * segments + index
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(segments))))
    faces.append(tuple((len(rings) - 1) * segments + i for i in range(segments)))
    shell = make_mesh("Helmet_Hammered_Shell", verts, faces, collection, [materials["ivory"]], smooth=True)
    shell["asset_role"] = "helmet_shell"
    solid = shell.modifiers.new("Forged shell thickness", "SOLIDIFY")
    solid.thickness = 0.0042
    solid.offset = -0.55
    add_bevel(shell, 0.0022, 3)

    # True black slit recesses sit in front of the closed shell; the wearer is
    # never visible even under harsh lighting.
    for side, center_x in (("L", -0.062), ("R", 0.062)):
        y = helmet_front_y(center_x, 1.774, 0.0054)
        slit = add_cube(f"Eye_Slit_{side}", (center_x, y, 1.774), (0.098, 0.005, 0.019),
                        materials["slit"], collection, bevel=0.0042)
        slit.rotation_euler.x = math.radians(-1.8)

    # Circumferential brow reinforcement and lower face seam.
    for name, z, radius, material, rx, ry in (
        ("Gold_Brow_Band", 1.810, 0.0052, materials["gold"], .141, .129),
        ("Lower_Face_Seam", 1.598, 0.0032, materials["dark_gold"], .132, .120),
    ):
        points = []
        for i in range(128):
            theta = 2 * math.pi * i / 128
            points.append((rx * math.sin(theta), -ry * math.cos(theta), z))
        curve_from_points(name, points, radius, material, collection, cyclic=True)

    # Cross-shaped frontal reinforcement. The vertical strip follows the dome
    # rather than floating as a flat toy-like extrusion.
    z_values = [1.625 + i * (0.325 / 18) for i in range(19)]
    strip_verts = []
    for z in z_values:
        half = 0.010 if z < 1.84 else max(0.005, 0.010 - (z - 1.84) * 0.08)
        for x in (-half, half):
            strip_verts.append((x, helmet_front_y(x, z, 0.0065), z))
    strip_faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2) for i in range(len(z_values) - 1)]
    nasal = make_mesh("Gold_Cross_Nasal", strip_verts, strip_faces, collection, [materials["gold"]])
    solid = nasal.modifiers.new("Nasal forged thickness", "SOLIDIFY")
    solid.thickness = 0.0048
    add_bevel(nasal, 0.0026, 3)

    # Sagittal crown seam provides a crafted, non-generic helmet silhouette.
    crown_points = [
        (0, -0.123, 1.835), (0, -0.104, 1.895), (0, -0.057, 1.946),
        (0, 0, 1.966), (0, 0.057, 1.946), (0, 0.104, 1.895), (0, 0.123, 1.835),
    ]
    curve_from_points("Gold_Crown_Seam", crown_points, 0.0042, materials["gold"], collection)

    # Mouth ventilation slots: restrained, inset, and asymmetrically spaced so
    # they read as forged details rather than a smiling face.
    vent_specs = [(-.072, 1.668, -6), (-.041, 1.657, -2), (-.070, 1.637, -7),
                  (.072, 1.668, 6), (.041, 1.657, 2), (.070, 1.637, 7)]
    for idx, (x, z, angle) in enumerate(vent_specs):
        y = helmet_front_y(x, z, 0.0060)
        add_cube(f"Mouth_Vent_{idx+1:02d}", (x, y, z), (0.027, .0045, .0065),
                 materials["slit"], collection, bevel=.0022,
                 rotation=(0, math.radians(angle), math.radians(angle)))

    # Side face-plate seam lines and compact hinge hardware.
    for side in (-1, 1):
        x = side * .113
        points = [
            (x, helmet_front_y(x, 1.79, .004), 1.79),
            (side * .124, helmet_front_y(side * .124, 1.70, .004), 1.70),
            (side * .112, helmet_front_y(side * .112, 1.61, .004), 1.61),
        ]
        curve_from_points(f"Faceplate_Seam_{'L' if side < 0 else 'R'}", points, .0025,
                          materials["dark_gold"], collection)
        add_sphere(f"Faceplate_Hinge_{'L' if side < 0 else 'R'}",
                   (side * .128, -0.053, 1.684), .010, materials["gold"], collection,
                   scale=(.48, .65, 1.0), segments=24)

    # Rivets around the brow and lower jaw bands.
    rivet_id = 0
    for z, rx, ry, count in ((1.810, .141, .129, 18), (1.598, .132, .120, 14)):
        for i in range(count):
            theta = 2 * math.pi * i / count
            # Leave the frontal cross readable.
            if abs(math.sin(theta)) < .10 and math.cos(theta) > 0:
                continue
            x = rx * math.sin(theta)
            y = -ry * math.cos(theta)
            add_sphere(f"Helmet_Rivet_{rivet_id:02d}", (x * 1.010, y * 1.010, z), .0052,
                       materials["gold"], collection, scale=(1, 1, .72), segments=20)
            rivet_id += 1

    # Articulated gorget: three overlapping steel collars with dark gaps and
    # gold seam rings. This prevents the head from reading as a floating bucket.
    for idx, (z, major, minor, yscale) in enumerate((
        (1.492, .124, .015, .82), (1.515, .130, .014, .84), (1.539, .135, .013, .86)
    )):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                        major_segments=72, minor_segments=16,
                                        location=(0, 0, z))
        collar = bpy.context.object
        collar.name = f"Gorget_Plate_{idx+1}"
        collar.scale.y = yscale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        collar.data.materials.append(materials["ivory"])
        move_to_collection(collar, collection)
        add_weighted_normals(collar)
        bpy.ops.mesh.primitive_torus_add(major_radius=major + .003, minor_radius=.0032,
                                        major_segments=72, minor_segments=10,
                                        location=(0, 0, z + .010))
        trim = bpy.context.object
        trim.name = f"Gorget_Gold_Trim_{idx+1}"
        trim.scale.y = yscale
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        trim.data.materials.append(materials["gold"])
        move_to_collection(trim, collection)

    # Tiny flush spirit seal: deliberately a jewel inset, not a floating orb.
    add_cylinder("Helmet_Spirit_Inset_Rim", (0, -0.082, 1.924), .017, .006,
                 materials["gold"], collection, vertices=24, rotation=(math.pi / 2, 0, 0), bevel=.0015)
    add_cylinder("Helmet_Spirit_Inset", (0, -0.086, 1.924), .010, .003,
                 materials["cyan"], collection, vertices=24, rotation=(math.pi / 2, 0, 0), bevel=.001)

    # Clean reusable origin near the head pivot.
    for obj in collection.objects:
        obj["human_scale_m"] = 1.90
        obj["attachment_hint"] = "head pivot approximately (0, 0, 1.73)"


SHIELD_OUTLINE = [
    (-.270, 1.555), (-.210, 1.600), (-.120, 1.620), (0.000, 1.592),
    (.120, 1.620), (.210, 1.600), (.270, 1.555), (.276, 1.390),
    (.268, 1.175), (.250, .925), (.220, .690), (.176, .475),
    (.112, .282), (0.000, .105), (-.112, .282), (-.176, .475),
    (-.220, .690), (-.250, .925), (-.268, 1.175), (-.276, 1.390),
]
SHIELD_CENTER = (0.0, .90)


def resample_closed_polyline(points, count):
    lengths = []
    total = 0.0
    for a, b in zip(points, points[1:] + points[:1]):
        length = math.dist(a, b)
        lengths.append(length)
        total += length
    result = []
    for i in range(count):
        distance = total * i / count
        cursor = 0.0
        for index, length in enumerate(lengths):
            if cursor + length >= distance:
                t = (distance - cursor) / length
                a = points[index]
                b = points[(index + 1) % len(points)]
                result.append((a[0] + (b[0] - a[0]) * t,
                               a[1] + (b[1] - a[1]) * t))
                break
            cursor += length
    return result


def shield_front_y(x, z):
    nx = min(1.0, abs(x) / .278)
    nz = (z - .90) / .81
    return -0.058 * (1.0 - nx ** 1.75) + 0.005 * nz * nz


def build_shield_surface(materials, collection):
    outline = resample_closed_polyline(SHIELD_OUTLINE, 80)
    rings = 7
    center_x, center_z = SHIELD_CENTER
    vertices = [(center_x, shield_front_y(center_x, center_z), center_z)]
    for ring in range(1, rings + 1):
        scale = ring / rings
        for x, z in outline:
            px = center_x + (x - center_x) * scale
            pz = center_z + (z - center_z) * scale
            vertices.append((px, shield_front_y(px, pz), pz))
    front_count = len(vertices)
    thickness = .027
    front_vertices = list(vertices)
    vertices.extend((x, y + thickness, z) for x, y, z in front_vertices)

    count = len(outline)
    faces = []
    face_materials = []
    # Front center fan.
    for i in range(count):
        a = 1 + i
        b = 1 + (i + 1) % count
        faces.append((0, a, b))
        face_materials.append(0)
    # Front concentric quads.
    for ring in range(1, rings):
        inner = 1 + (ring - 1) * count
        outer = 1 + ring * count
        for i in range(count):
            nxt = (i + 1) % count
            faces.append((inner + i, outer + i, outer + nxt, inner + nxt))
            face_materials.append(0)
    # Back center fan and quads.
    for i in range(count):
        a = front_count + 1 + i
        b = front_count + 1 + (i + 1) % count
        faces.append((front_count, b, a))
        face_materials.append(1)
    for ring in range(1, rings):
        inner = front_count + 1 + (ring - 1) * count
        outer = front_count + 1 + ring * count
        for i in range(count):
            nxt = (i + 1) % count
            faces.append((inner + i, inner + nxt, outer + nxt, outer + i))
            face_materials.append(1)
    # Actual thin side wall.
    outer_front = 1 + (rings - 1) * count
    outer_back = front_count + outer_front
    for i in range(count):
        nxt = (i + 1) % count
        faces.append((outer_front + i, outer_front + nxt, outer_back + nxt, outer_back + i))
        face_materials.append(2)

    shield = make_mesh("Shield_Convex_Forged_Body", vertices, faces, collection,
                       [materials["ivory"], materials["leather_dark"], materials["dark_gold"]],
                       smooth=True)
    for poly, material_index in zip(shield.data.polygons, face_materials):
        poly.material_index = material_index
    add_bevel(shield, .0035, 3)
    shield["asset_role"] = "shield_body"
    shield["overall_height_m"] = 1.515
    shield["overall_width_m"] = .552
    shield["forged_thickness_m"] = .027
    return shield, outline


def scaled_outline(outline, scale, z_center=.90, y_offset=-.006):
    points = []
    for x, z in outline:
        sx = x * scale
        sz = z_center + (z - z_center) * scale
        points.append((sx, shield_front_y(sx, sz) + y_offset, sz))
    return points


def add_shield_bar(name, path_points, half_width, thickness, material, collection):
    # A conforming forged strip with a true front/back thickness. Tangent-derived
    # width keeps the cross narrow and elegant on the convex face.
    vertices = []
    for index, point in enumerate(path_points):
        prev = Vector(path_points[max(0, index - 1)])
        nxt = Vector(path_points[min(len(path_points) - 1, index + 1)])
        tangent = (nxt - prev).normalized()
        side = Vector((tangent.z, 0, -tangent.x)).normalized() * half_width
        base = Vector(point)
        vertices.extend((tuple(base - side), tuple(base + side)))
    faces = [(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
             for i in range(len(path_points) - 1)]
    obj = make_mesh(name, vertices, faces, collection, [material])
    solid = obj.modifiers.new("Forged reinforcement thickness", "SOLIDIFY")
    solid.thickness = thickness
    add_bevel(obj, .004, 4)
    return obj


def build_shield(materials, collection):
    shield, outline = build_shield_surface(materials, collection)

    # Structural outer rim and narrower inner gold trim.
    curve_from_points("Shield_Outer_Deep_Rim", scaled_outline(outline, 1.006, y_offset=-.002),
                      .018, materials["dark_gold"], collection, cyclic=True)
    curve_from_points("Shield_Inner_Gold_Trim", scaled_outline(outline, .900, y_offset=-.011),
                      .0085, materials["gold"], collection, cyclic=True)

    vertical = []
    for i in range(17):
        z = .34 + i * (1.06 / 16)
        vertical.append((0, shield_front_y(0, z) - .014, z))
    add_shield_bar("Shield_Gold_Vertical_Cross", vertical, .025, .006,
                   materials["gold"], collection)

    horizontal = []
    for i in range(15):
        x = -.205 + i * (.410 / 14)
        z = .925
        horizontal.append((x, shield_front_y(x, z) - .014, z))
    add_shield_bar("Shield_Gold_Horizontal_Cross", horizontal, .025, .006,
                   materials["gold"], collection)

    # Cross center and tiny spirit inset.
    center_y = shield_front_y(0, .925)
    add_cylinder("Shield_Cross_Center", (0, center_y - .024, .925), .058, .014,
                 materials["gold"], collection, vertices=12, rotation=(math.pi / 2, 0, 0), bevel=.003)
    add_cylinder("Shield_Spirit_Inset", (0, center_y - .033, .925), .015, .005,
                 materials["cyan"], collection, vertices=24, rotation=(math.pi / 2, 0, 0), bevel=.001)

    # Dense but restrained perimeter rivets.
    rivet_points = scaled_outline(outline, .940, y_offset=-.016)
    for i in range(0, len(rivet_points), 4):
        x, y, z = rivet_points[i]
        add_sphere(f"Shield_Face_Rivet_{i//4:02d}", (x, y, z), .0065,
                   materials["gold"], collection, scale=(1, .55, 1), segments=20)

    # Back straps, forearm pad, and metal brackets. Their y placement stands
    # proud of the concave shield rear so they remain usable by a rigged hand.
    for idx, (z, width) in enumerate(((1.095, .360), (.785, .330))):
        strap = add_cube(f"Shield_Back_Leather_Strap_{idx+1}", (0, .038, z),
                         (width, .018, .058), materials["leather"], collection, bevel=.012)
        strap.rotation_euler.y = math.radians(1.5 if idx == 0 else -1.5)
        for side in (-1, 1):
            add_cylinder(f"Shield_Strap_Bracket_{idx+1}_{'L' if side < 0 else 'R'}",
                         (side * (width * .43), .026, z), .015, .010,
                         materials["gold"], collection, vertices=16,
                         rotation=(math.pi / 2, 0, 0), bevel=.002)

    pad = add_cube("Shield_Back_Forearm_Pad", (0, .018, .945), (.255, .020, .265),
                   materials["leather_dark"], collection, bevel=.025)
    pad["attachment_role"] = "forearm cushion"
    grip = add_cylinder("Shield_Back_Hand_Grip", (0, .095, .930), .018, .190,
                        materials["leather"], collection, vertices=24, bevel=.004)
    # Cylinder default axis Z, correct for a vertical hand grip.
    for z in (.835, 1.025):
        add_cube(f"Shield_Grip_Mount_{z:.3f}", (0, .058, z), (.075, .030, .030),
                 materials["dark_gold"], collection, bevel=.006)

    for obj in collection.objects:
        obj["human_scale_m"] = 1.90
        obj["attachment_hint"] = "left forearm; shield center approximately (0, 0, 0.90)"
    return shield


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def create_presentation(materials, collection):
    # Dark neutral floor and backdrop only; they are explicitly separated from
    # the reusable asset collections.
    floor_mat = add_principled_material("Presentation_Stone", srgb("111416"), 0.0, .76,
                                        bump_strength=.20, bump_distance=.003, noise_scale=30)
    add_cube("Presentation_Floor", (0, 0, .045), (5.5, 5.5, .09), floor_mat, collection, bevel=.025)
    add_cube("Presentation_Backdrop", (0, .95, 1.15), (5.5, .10, 2.3), floor_mat, collection, bevel=.02)

    world = bpy.data.worlds.new("Equipment_Studio_World")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = srgb("080B0D")
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .22

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name + "_DATA", "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color[:3]
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0, 0, 1.10))
        return obj

    area("Key_Large", (-1.7, -2.2, 2.55), 1050, 1.25, srgb("FFF0D2"))
    area("Fill_Cool", (1.9, -1.1, 1.75), 720, .95, srgb("B9D7FF"))
    area("Rim_Warm", (1.2, .55, 2.15), 980, .70, srgb("FFD28C"))
    area("Top_Soft", (-.15, -.1, 3.0), 600, .85, srgb("EAF6FF"))

    cam_data = bpy.data.cameras.new("Inspection_Camera_DATA")
    cam = bpy.data.objects.new("Inspection_Camera", cam_data)
    collection.objects.link(cam)
    cam.data.lens = 82
    cam.data.sensor_width = 36
    bpy.context.scene.camera = cam
    return cam


def set_collection_visibility(helmet_collection, shield_collection, helmet):
    helmet_collection.hide_render = not helmet
    shield_collection.hide_render = helmet


def render_view(camera, path, position, target, lens, helmet_collection, shield_collection, helmet):
    set_collection_visibility(helmet_collection, shield_collection, helmet)
    camera.location = position
    camera.data.lens = lens
    look_at(camera, target)
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def configure_render():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_percentage = 100
    scene.render.use_file_extension = True
    scene.render.filepath = str(HELMET_FRONT)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_mode = "RGB"
    # Eevee settings available in Blender 5.x.
    scene.render.resolution_percentage = 100


def write_measurements():
    data = {
        "units": "meters",
        "human_reference_height": 1.90,
        "coordinate_system": {
            "up": "+Z",
            "character_front": "-Y",
            "right": "+X",
        },
        "append_collections": [HELMET_COLLECTION, SHIELD_COLLECTION],
        "helmet": {
            "collection": HELMET_COLLECTION,
            "overall_bounds_approx": {"width": .282, "depth": .264, "height_with_gorget": .485},
            "head_pivot_hint": [0.0, 0.0, 1.73],
            "closed_shell": True,
            "skin_visible": False,
            "primary_objects": ["Helmet_Hammered_Shell", "Gold_Brow_Band", "Gold_Cross_Nasal"],
        },
        "shield": {
            "collection": SHIELD_COLLECTION,
            "overall_bounds_approx": {"width": .586, "height": 1.55, "body_thickness": .027},
            "center_hint": [0.0, 0.0, .90],
            "front_direction": "-Y",
            "primary_objects": ["Shield_Convex_Forged_Body", "Shield_Outer_Deep_Rim",
                                "Shield_Inner_Gold_Trim"],
        },
        "materials": [
            "PBR_Hammered_Ivory_Steel", "PBR_Aged_Holy_Gold", "PBR_Darkened_Brass",
            "PBR_Blackened_Steel", "PBR_Aged_Leather", "PBR_Shield_Back_Leather",
            "Spirit_Inset_Cyan",
        ],
        "render_files": [path.name for path in (HELMET_FRONT, HELMET_3Q, SHIELD_FRONT, SHIELD_BACK)],
        "notes": [
            "All equipment geometry is procedural and original to this project.",
            "PRESENTATION_ONLY can be excluded when appending assets.",
            "The cyan details are flush inset seals, not free-floating orbs.",
            "Rigid plate pieces are intentionally separate for straightforward bone parenting or weight transfer.",
        ],
    }
    MEASUREMENTS.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    reset_scene()
    helmet_collection = new_collection(HELMET_COLLECTION)
    shield_collection = new_collection(SHIELD_COLLECTION)
    presentation_collection = new_collection(PRESENTATION_COLLECTION)
    materials = build_materials()
    build_helmet(materials, helmet_collection)
    build_shield(materials, shield_collection)
    camera = create_presentation(materials, presentation_collection)
    configure_render()

    # Four clean inspection views. Framing is deliberately tight enough to show
    # forged texture, panel connections, rim thickness, and strap construction.
    render_view(camera, HELMET_FRONT, (0, -1.40, 1.735), (0, 0, 1.735), 88,
                helmet_collection, shield_collection, True)
    render_view(camera, HELMET_3Q, (.64, -1.12, 1.77), (0, 0, 1.735), 82,
                helmet_collection, shield_collection, True)
    render_view(camera, SHIELD_FRONT, (0, -3.05, .92), (0, 0, .90), 74,
                helmet_collection, shield_collection, False)
    render_view(camera, SHIELD_BACK, (.86, 2.65, 1.10), (0, 0, .90), 72,
                helmet_collection, shield_collection, False)

    # Save with both reusable collections visible; inspection cameras/lights stay
    # isolated in PRESENTATION_ONLY.
    helmet_collection.hide_render = False
    shield_collection.hide_render = False
    bpy.context.scene.render.filepath = str(HELMET_FRONT)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), check_existing=False)
    write_measurements()
    print(json.dumps({"blend": str(BLEND), "renders": [str(HELMET_FRONT), str(HELMET_3Q),
                                                        str(SHIELD_FRONT), str(SHIELD_BACK)]}, indent=2))


if __name__ == "__main__":
    main()

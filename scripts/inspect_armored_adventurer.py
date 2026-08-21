import bpy

print("SCENE OBJECTS")
for obj in bpy.data.objects:
    print(obj.name, obj.type, "parent", obj.parent.name if obj.parent else "-", "loc", tuple(round(v, 3) for v in obj.location), "scale", tuple(round(v, 3) for v in obj.scale))
    if obj.type == "MESH":
        print("  dimensions", tuple(round(v,3) for v in obj.dimensions), "world_scale", tuple(round(v,3) for v in obj.matrix_world.to_scale()))
        print("  mesh", len(obj.data.vertices), len(obj.data.polygons), "materials", [slot.material.name if slot.material else None for slot in obj.material_slots])
        mins = [min(v.co[i] for v in obj.data.vertices) for i in range(3)] if obj.data.vertices else [0,0,0]
        maxs = [max(v.co[i] for v in obj.data.vertices) for i in range(3)] if obj.data.vertices else [0,0,0]
        print("  bounds", tuple(round(x,3) for x in mins), tuple(round(x,3) for x in maxs))
    if obj.type == "ARMATURE":
        print("  bones")
        for b in obj.data.bones:
            print("   ", b.name, "head", tuple(round(v,3) for v in b.head_local), "tail", tuple(round(v,3) for v in b.tail_local), "parent", b.parent.name if b.parent else "-")

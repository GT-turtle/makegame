import bpy
from collections import deque, Counter

obj = bpy.data.objects.get("Plane.029")
mesh = obj.data

adj = [[] for _ in mesh.vertices]
for edge in mesh.edges:
    a, b = edge.vertices
    adj[a].append(b)
    adj[b].append(a)

seen = set()
components = []
for start in range(len(mesh.vertices)):
    if start in seen:
        continue
    stack = [start]
    seen.add(start)
    verts = []
    while stack:
        v = stack.pop()
        verts.append(v)
        for n in adj[v]:
            if n not in seen:
                seen.add(n)
                stack.append(n)
    coords = [mesh.vertices[i].co for i in verts]
    mins = tuple(min(c[j] for c in coords) for j in range(3))
    maxs = tuple(max(c[j] for c in coords) for j in range(3))
    vset = set(verts)
    polys = [p for p in mesh.polygons if all(i in vset for i in p.vertices)]
    mats = Counter(p.material_index for p in polys)
    components.append((len(verts), len(polys), mins, maxs, mats, verts[:5]))

for idx, comp in enumerate(sorted(components, reverse=True, key=lambda x: x[0])):
    if idx >= 80:
        break
    nv, nf, mins, maxs, mats, sample = comp
    print(idx, "verts", nv, "faces", nf,
          "bounds", tuple(round(x, 4) for x in mins), tuple(round(x, 4) for x in maxs),
          "mats", dict(mats), "sample", sample)
print("TOTAL_COMPONENTS", len(components))


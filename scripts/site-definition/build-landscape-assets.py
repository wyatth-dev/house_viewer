"""Build opaque low-poly landscape GLBs in millimeters; no external modeling packages."""
import argparse
import json
import math
import random
import struct
from pathlib import Path

PALETTE = {'trunk': '#6f7560', 'cypress': '#354c34', 'sage': '#9dab86', 'yellow': '#dfbd42', 'shrub': '#788967', 'shrub-brown': '#a09370'}


def rgb(value):
    return [int(value[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def ellipsoid(center, radii, rng, rings=9, segments=12, tapered=False):
    positions = []
    for ring in range(rings + 1):
        angle = math.pi * ring / rings
        for segment in range(segments):
            phi = 2 * math.pi * segment / segments
            jitter = 1 + rng.uniform(-0.065, 0.065)
            width = math.sin(angle)
            if tapered:
                width *= 0.45 + 0.55 * ring / rings
            positions.append([center[0] + radii[0] * width * math.cos(phi) * jitter,
                              center[1] + radii[1] * math.cos(angle),
                              center[2] + radii[2] * width * math.sin(phi) * jitter])
    faces = []
    for ring in range(rings):
        for segment in range(segments):
            a = ring * segments + segment
            b = ring * segments + (segment + 1) % segments
            c, d = a + segments, b + segments
            faces.extend([(a, c, b), (b, c, d)])
    return finish(positions, faces, center)


def trunk(height, radius):
    positions = []
    for y, scale in [(0, 1), (height, 0.6)]:
        for i in range(8):
            angle = 2 * math.pi * i / 8
            positions.append([radius * scale * math.cos(angle), y, radius * scale * math.sin(angle)])
    faces = []
    for i in range(8):
        j = (i + 1) % 8
        faces.extend([(i, j, i + 8), (j, j + 8, i + 8)])
    for i in range(1, 7):
        faces.extend([(0, i + 1, i), (8, i + 8, i + 9)])
    return finish(positions, faces, (0, height / 2, 0))


def finish(positions, faces, center):
    points, normals, indices = [], [], []
    for face in faces:
        a, b, c = [positions[i] for i in face]
        ab, ac = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
        normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
        length = math.sqrt(sum(v * v for v in normal))
        if length < 1e-8:
            continue
        outward = [(a[i] + b[i] + c[i]) / 3 - center[i] for i in range(3)]
        if sum(normal[i] * outward[i] for i in range(3)) < 0:
            b, c = c, b
            normal = [-v for v in normal]
        normal = [v / length for v in normal]
        for point in (a, b, c):
            indices.append(len(points)); points.append(point); normals.append(normal)
    return points, normals, indices


def smooth_surface(center, radii, rng, column=False, rings=8, segments=12):
    # One continuous crown, coherent lobes, shared vertices and smooth normals.
    phase = rng.uniform(0, math.tau)
    positions = []
    for ring in range(rings + 1):
        theta = math.pi * ring / rings
        for segment in range(segments):
            phi = math.tau * segment / segments
            envelope = math.sin(theta)
            lobes = (0.055 * math.sin(5 * phi + phase + 2 * theta)
                     + 0.035 * math.cos(7 * phi - 3 * theta + phase)
                     + 0.025 * math.sin(11 * phi + 5 * theta)) * envelope
            width = envelope * (1 + lobes)
            if column:
                width *= (0.35 + 0.65 * ring / rings)
            positions.append([center[0] + radii[0] * width * math.cos(phi),
                              center[1] + radii[1] * math.cos(theta) + radii[1] * lobes * envelope * 0.4,
                              center[2] + radii[2] * width * math.sin(phi)])
    # Weld the poles so their normals are continuous as well.
    positions = [positions[0]] + positions[segments:-segments] + [positions[-1]]
    faces = []
    bottom = len(positions) - 1
    for j in range(segments):
        k = (j + 1) % segments
        faces.append((0, 1 + j, 1 + k))
        faces.append((bottom, bottom - segments + k, bottom - segments + j))
    for r in range(rings - 2):
        for j in range(segments):
            a = 1 + r * segments + j
            b = 1 + r * segments + (j + 1) % segments
            faces.extend([(a, a + segments, b), (b, a + segments, b + segments)])
    normals = [[0., 0., 0.] for _ in positions]
    indices = []
    for a, b, c in faces:
        ab = [positions[b][i] - positions[a][i] for i in range(3)]
        ac = [positions[c][i] - positions[a][i] for i in range(3)]
        n = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
        if sum(n[i] * (positions[a][i] - center[i]) for i in range(3)) < 0:
            b, c = c, b
            n = [-v for v in n]
        indices.extend((a, b, c))
        for vertex in (a, b, c):
            for i in range(3):
                normals[vertex][i] += n[i]
    normals = [[v / math.sqrt(sum(x*x for x in n)) for v in n] for n in normals]
    return positions, normals, indices


def branch(start, end, radius):
    axis = [end[i] - start[i] for i in range(3)]
    length = math.sqrt(sum(v*v for v in axis))
    axis = [v / length for v in axis]
    side = [axis[1], -axis[0], 0]
    scale = math.sqrt(sum(v*v for v in side))
    side = [v / scale for v in side]
    other = [axis[1]*side[2]-axis[2]*side[1], axis[2]*side[0]-axis[0]*side[2], axis[0]*side[1]-axis[1]*side[0]]
    points, normals, indices = [], [], []
    for center, taper in ((start, 1), (end, .45)):
        for j in range(6):
            angle = math.tau * j / 6
            n = [side[i]*math.cos(angle) + other[i]*math.sin(angle) for i in range(3)]
            points.append([center[i] + radius*taper*n[i] for i in range(3)])
            normals.append(n)
    for j in range(6):
        k = (j+1)%6
        indices.extend((j, k, j+6, k, k+6, j+6))
    return points, normals, indices


def leaf(center, size, rng):
    # Thin folded leaf, facing a random 3D direction; both sides cast shadows.
    yaw, tilt = rng.uniform(0, math.tau), rng.uniform(-.9, .9)
    u = (math.cos(yaw), 0, math.sin(yaw))
    v = (-math.sin(yaw)*math.sin(tilt), math.cos(tilt), math.cos(yaw)*math.sin(tilt))
    normal = (-math.sin(yaw)*math.cos(tilt), -math.sin(tilt), math.cos(yaw)*math.cos(tilt))
    points = [[center[i]+size*(u[i]*x+v[i]*y) for i in range(3)]
              for x,y in [(0,-1),(.55,0),(0,1),(-.55,0)]]
    return points + points, [list(normal)]*4 + [[-x for x in normal]]*4, [0,1,2,0,2,3,4,6,5,4,7,6]


def plant(kind, seed):
    rng = random.Random(seed)
    meshes = []
    def add(mesh, color):
        meshes.append((mesh, color))
    if kind == 'cypress':
        add(branch((0, 0, 0), (70, 2300, 0), 60), PALETTE['trunk'])
        add(smooth_surface((70, 3650, 0), (560, 3150, 470), rng, column=True,
                           rings=16, segments=20), PALETTE[kind])
    elif kind in ('sage', 'yellow'):
        lean = rng.uniform(-180, 180)
        # Continuous leader with branches rooted at different heights.
        for j in range(6):
            start = (lean*j/6, j*820, 60*math.sin(j*.5))
            end = (lean*(j+1)/6, (j+1)*820, 60*math.sin((j+1)*.5))
            add(branch(start, end, 100*(1-j/7)), PALETTE['trunk'])
        for j in range(8):
            angle = j*2.399 + rng.uniform(-.25,.25)
            height = 1700+j*350
            reach = 1700*math.sqrt(max(.2, 1-((height-3400)/2200)**2))
            base = (lean*height/4920, height, 0)
            joint = (base[0]+reach*.55*math.cos(angle), height+500, reach*.55*math.sin(angle))
            add(branch(base, joint, 40-j*2), PALETTE['trunk'])
            for k in range(2):
                direction = angle + (k-.5)*.75
                end = (base[0]+reach*math.cos(direction), height+rng.uniform(750,1100), reach*math.sin(direction))
                add(branch(joint, end, 17), PALETTE['trunk'])
                for t in range(2):
                    tip = (end[0]+rng.uniform(-380,380), end[1]+rng.uniform(180,500), end[2]+rng.uniform(-380,380))
                    add(branch(end, tip, 7), PALETTE['trunk'])
                    for _ in range(18):
                        phi = rng.uniform(0,math.tau)
                        y = rng.uniform(-1,1)
                        radius = rng.random()**(1/3)
                        width = math.sqrt(1-y*y)*radius
                        center = (tip[0]+420*width*math.cos(phi), tip[1]+370*y*radius, tip[2]+420*width*math.sin(phi))
                        add(leaf(center, rng.uniform(130,230), rng), PALETTE[kind])
    else:
        base = rgb(PALETTE['shrub-brown' if kind == 'shrub-brown' else 'shrub'])
        for index, (x, z, radius) in enumerate([(-450, 0, 620), (450, 80, 700), (0, -380, 580)]):
            shade = [0.93, 1.04, 0.99][index]
            color = '#' + ''.join(f'{min(255, round(channel * shade * 255)):02x}' for channel in base)
            add(ellipsoid((x, radius * 0.65, z), (radius, radius * 0.65, radius * 0.85), rng, rings=7, segments=10), color)
    if kind in ('cypress', 'sage', 'yellow'):
        merged = {}
        for (points, normals, indices), color in meshes:
            out_points, out_normals, out_indices = merged.setdefault(color, ([], [], []))
            offset = len(out_points)
            out_points.extend(points); out_normals.extend(normals)
            out_indices.extend(i + offset for i in indices)
        return [(mesh, color) for color, mesh in merged.items()]
    return meshes


def write_glb(path, meshes):
    binary = bytearray()
    document = {'asset': {'version': '2.0', 'generator': 'House Viewer landscape asset builder', 'extras': {'units': 'millimeters'}},
                'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': path.stem}],
                'meshes': [{'primitives': []}], 'materials': [], 'accessors': [], 'bufferViews': [], 'buffers': []}
    colors = {}
    def accessor(values, count, kind, component=5126, bounds=None, target=34962):
        while len(binary) % 4:
            binary.append(0)
        data = struct.pack('<' + ('f' if component == 5126 else 'H') * len(values), *values)
        view = len(document['bufferViews'])
        document['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data), 'target': target})
        binary.extend(data)
        item = {'bufferView': view, 'componentType': component, 'count': count, 'type': kind}
        if bounds:
            item['min'], item['max'] = bounds
        document['accessors'].append(item)
        return len(document['accessors']) - 1
    for (points, normals, indices), color in meshes:
        if color not in colors:
            colors[color] = len(document['materials'])
            document['materials'].append({'name': color, 'pbrMetallicRoughness': {'baseColorFactor': rgb(color) + [1], 'metallicFactor': 0, 'roughnessFactor': 0.95}, 'alphaMode': 'OPAQUE', 'doubleSided': False})
        low = [min(p[i] for p in points) for i in range(3)]
        high = [max(p[i] for p in points) for i in range(3)]
        position = accessor([v for p in points for v in p], len(points), 'VEC3', bounds=(low, high))
        normal = accessor([v for p in normals for v in p], len(normals), 'VEC3')
        index = accessor(indices, len(indices), 'SCALAR', 5123, target=34963)
        document['meshes'][0]['primitives'].append({'attributes': {'POSITION': position, 'NORMAL': normal}, 'indices': index, 'material': colors[color]})
    document['buffers'].append({'byteLength': len(binary)})
    while len(binary) % 4:
        binary.append(0)
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    return document


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    variants = [('cypress-a', 'cypress', 11), ('cypress-b', 'cypress', 37), ('sage-tree-a', 'sage', 19), ('sage-tree-b', 'sage', 53), ('yellow-tree', 'yellow', 29), ('shrub-cluster', 'shrub', 71), ('shrub-brown', 'shrub-brown', 83)]
    manifest = {'units': 'millimeters', 'upAxis': 'Y', 'origin': 'ground-level trunk center', 'style': 'muted architectural smooth organic crowns', 'assets': []}
    preview = []
    for name, kind, seed in variants:
        meshes = plant(kind, seed)
        document = write_glb(args.output / f'{name}.glb', meshes)
        points = [p for (mesh, _) in meshes for p in mesh[0]]
        manifest['assets'].append({'id': name, 'file': f'{name}.glb', 'type': kind, 'heightMm': max(p[1] for p in points), 'triangles': sum(len(mesh[2]) // 3 for mesh, _ in meshes), 'castShadows': True, 'receiveShadows': True})
        preview.append((name, meshes))
    (args.output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    if args.preview:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        from mpl_toolkits.mplot3d.art3d import Poly3DCollection
        figure = plt.figure(figsize=(17.5, 5), facecolor='white')
        for index, (name, meshes) in enumerate(preview):
            ax = figure.add_subplot(1, len(preview), index + 1, projection='3d')
            for (points, normals, indices), color in meshes:
                faces = [[(points[i][0], points[i][2], points[i][1]) for i in indices[j:j + 3]] for j in range(0, len(indices), 3)]
                colors = []
                for j in range(0, len(indices), 3):
                    normal = normals[indices[j]]
                    shade = 0.72 + 0.28 * max(0, normal[0] * -0.4 + normal[1] * 0.8 + normal[2] * 0.4)
                    colors.append([c * shade for c in rgb(color)])
                ax.add_collection3d(Poly3DCollection(faces, facecolors=colors, linewidths=0))
            ax.set(xlim=(-2800, 2800), ylim=(-2800, 2800), zlim=(0, 7000))
            ax.set_box_aspect((5600, 5600, 7000)); ax.view_init(elev=18, azim=-50)
            ax.set_axis_off(); ax.set_title(name, fontsize=10)
        figure.tight_layout(); figure.savefig(args.output / 'preview.png', dpi=150)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()

"""Numerical acceptance checks for the three Sunningdale representations (SOP section 10)."""
import json, struct, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import sunningdale_baseline as B

ROOT = Path(__file__).resolve().parents[2]
HOUSE = ROOT / 'public/scenes/typology/sunningdale-house'
scene = json.loads((HOUSE / 'scene.json').read_text())


def load(rel):
    raw = (HOUSE / rel).read_bytes(); n = struct.unpack_from('<I', raw, 12)[0]; j = json.loads(raw[20:20 + n]); b = raw[28 + n:]
    def read(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; dim = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
        return np.frombuffer(b, dtype='<f4' if a['componentType'] == 5126 else '<u4', count=a['count'] * dim, offset=v['byteOffset']).reshape(-1, dim)
    meshes = {}
    for node in j['nodes']:
        mesh = j['meshes'][node['mesh']]; tris = []
        for p in mesh['primitives']:
            assert 'indices' in p and 'TEXCOORD_0' in p['attributes'] and 'NORMAL' in p['attributes'], node['name']
            pos = read(p['attributes']['POSITION']); ids = read(p['indices']).ravel()
            tri = pos[ids].reshape(-1, 3, 3).astype(float); assert len(tri), node['name']
            tris.append(tri)
        meshes[node['name']] = np.concatenate(tris)
    assert all(m['doubleSided'] for m in j['materials'])
    return j, meshes


def covered(tris, c, outward, u, v):
    for tri in tris:
        if np.max(np.abs((tri - c) @ outward)) > 3: continue
        xy = np.stack(((tri - c) @ u, (tri - c) @ v), axis=1); mat = np.column_stack((xy[1] - xy[0], xy[2] - xy[0]))
        if abs(np.linalg.det(mat)) < 1e-6: continue
        w = np.linalg.solve(mat, -xy[0])
        if min(w) >= -1e-6 and w.sum() <= 1 + 1e-6: return True
    return False


states = {mode: load(rel) for mode, rel in (('white', 'model.glb'), ('color-block', 'color-block/model.glb'), ('render', 'render/model.glb'))}
expected_materials = {'white': 2, 'color-block': 6, 'render': 9}
fp = scene['calibration']['sourceFootprint']
walls = [w[0] for w in B.WALLS]
for mode, (j, meshes) in states.items():
    assert len(j['materials']) == expected_materials[mode], mode
    # 1. Wall envelope equals the calibrated footprint; walls never move between states.
    pts = np.concatenate([meshes[w].reshape(-1, 3) for w in walls])
    assert np.allclose([pts[:, 0].min(), pts[:, 0].max(), pts[:, 2].min(), pts[:, 2].max()], [fp['minX'], fp['maxX'], fp['minZ'], fp['maxZ']], atol=.01), mode
    assert abs(scene['calibration']['actualWidthMm'] - (fp['maxX'] - fp['minX'])) < .01
    for w in walls:
        a = states['white'][1][w].reshape(-1, 3); b = meshes[w].reshape(-1, 3)
        assert np.allclose(a.min(0), b.min(0), atol=.01) and np.allclose(a.max(0), b.max(0), atol=.01), (mode, w)
    # 2. Nothing below ground; roofs only rise by the skin thickness above the White ridge.
    allp = np.concatenate([m.reshape(-1, 3) for m in meshes.values()])
    assert allp[:, 1].min() >= -.01, (mode, 'below ground')
    assert allp[:, 1].max() <= B.RIDGE + (0 if mode == 'white' else B.ROOF_THICKNESS) + .01, mode
    if mode != 'white':
        lim = B.OVERHANG + .01
        assert allp[:, 0].min() >= fp['minX'] - lim and allp[:, 0].max() <= fp['maxX'] + lim and allp[:, 2].min() >= fp['minZ'] - lim and allp[:, 2].max() <= fp['maxZ'] + lim, mode
    print(f'{mode}: {len(meshes)} meshes, {len(j["materials"])} materials, wall envelope and reference faces fixed')

# 3. Installation faces lie on exterior wall surfaces of every state.
for face in scene['installationFaces']:
    o = np.array([face['originMm']['x'], 0, face['originMm']['z']], dtype=float)
    along = np.array([face['alongWallUnit']['x'], 0, face['alongWallUnit']['z']], dtype=float)
    out = np.array([face['outwardUnit']['x'], 0, face['outwardUnit']['z']], dtype=float)
    for mode, (_, meshes) in states.items():
        tris = np.concatenate([meshes[w] for w in walls])
        for t in (.02, .5, .98):
            c = o + along * face['lengthMm'] * t + np.array([0, 300, 0])
            if mode == 'render' and any(abs((c - op['center']) @ op['u']) < op['width'] / 2 + 80 for op in B.OPENINGS if np.allclose(op['outward'], out) and abs((c - op['center']) @ out) < 3):
                continue
            assert covered(tris, c, out, along, np.array([0., 1, 0])), (face['wallFaceId'], mode, t)
print(f'{len(scene["installationFaces"])} installation faces lie on the shared wall planes')

# 4. Openings: fully inside their facade, cut only in Detailed render, with separate detail meshes.
for op in B.OPENINGS:
    c, u, v, out, w, h = op['center'], op['u'], op['v'], op['outward'], op['width'], op['height']
    face = states['color-block'][1][op['face']]
    for x in (-w / 2 - 75, w / 2 + 75):
        for y in (-h / 2 if c[1] - h / 2 <= 1 else -h / 2 - 75, h / 2 + 75):
            p = c + u * x + v * y
            if p[1] < 1: p = p + v * 1
            assert covered(face, p, out, u, v), (op['name'], 'frame leaves its facade')
    assert covered(face, c, out, u, v), op['name']
    assert not covered(states['render'][1][op['face']], c, out, u, v), op['name'] + ' not cut'
    assert 'Opening_' + op['name'] in states['render'][1]
print(f'{len(B.OPENINGS)} openings: inside their facades, cut in Detailed render only, detail geometry present')

"""Generate the three Sunningdale representations from the shared parametric baseline.

White -> public/scenes/typology/sunningdale-house/model.glb
Color blocks -> .../color-block/model.glb
Detailed render -> .../render/model.glb
Run with python3 from the web project root; requires numpy and Pillow.
"""
import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).parent))
import sunningdale_baseline as B

ROOT = Path(__file__).resolve().parents[2]
HOUSE = ROOT / 'public/scenes/typology/sunningdale-house'

# Material vocabulary (Typology Modelling SOP section 7). Unused Fairy legacy slots
# (chimney stone, skylight frame) are intentionally omitted.
MATERIALS = [('House_Roof_Slate', (72, 78, 83)), ('House_Wall_Horizontal', (224, 222, 213)),
             ('House_Gable_Vertical', (235, 233, 224)), ('House_Trim_White', (245, 243, 235)),
             ('House_Base_Stone', (131, 127, 114)), ('House_Floor_Concrete', (188, 185, 176))]
OPENING_MATERIALS = [('House_Window_Glass', (64, 94, 104), .15), ('House_Opening_Reveal', (209, 209, 199), .9),
                     ('House_Entry_Blue', (55, 83, 94), .65)]
ROOF, HORIZONTAL, VERTICAL, TRIM, STONE, FLOOR, GLASS, REVEAL, ENTRY = range(9)
WHITE_MATERIALS = [('WhiteModel_Roof', [0.89126205, 0.8993845, 0.9075472, 1.0]),
                   ('WhiteModel_Wall', [0.8355278, 0.85125166, 0.8671355, 1.0])]


# ---- Procedural textures (same physical scale rules as the Fairy prototype) ---------------
def texture(kind):
    size = 512; rng = np.random.default_rng(1539)
    base = {'roof': (72, 78, 83), 'horizontal': (224, 222, 213), 'vertical': (235, 233, 224)}.get(kind, (131, 127, 114))
    pixels = np.clip(np.array(base) + rng.normal(0, 2.2, (size, size, 1)), 0, 255).astype('uint8')
    im = Image.fromarray(pixels); d = ImageDraw.Draw(im)
    hm = Image.fromarray(np.full((size, size), 180, dtype=np.uint8)); hd = ImageDraw.Draw(hm)
    if kind == 'roof':
        for row, y in enumerate(range(0, size, 64)):
            d.line((0, y, size, y), fill=(44, 48, 52), width=3); hd.line((0, y, size, y), fill=70, width=3)
            for x in range(-128, size + 128, 128):
                x += 64 * (row % 2); d.line((x, y, x, y + 64), fill=(48, 53, 57), width=2); hd.line((x, y, x, y + 64), fill=100, width=2)
    elif kind in ('horizontal', 'vertical'):
        for t in range(0, size, 64):
            line = (0, t, size, t) if kind == 'horizontal' else (t, 0, t, size)
            d.line(line, fill=(190, 190, 181), width=2); hd.line(line, fill=95, width=2)
    else:
        im = Image.new('RGB', (size, size), (92, 91, 85)); d = ImageDraw.Draw(im)
        hm = Image.new('L', (size, size), 85); hd = ImageDraw.Draw(hm)
        for row, y in enumerate(range(0, size, 64)):
            widths = rng.integers(65, 165, size=5); widths = widths / widths.sum() * size
            bounds = np.round(np.r_[0, np.cumsum(widths)]).astype(int); offset = (row * 91) % size
            for k in range(5):
                left = bounds[k] + offset; right = bounds[k + 1] + offset
                var = int(rng.integers(-25, 22)); warm = int(rng.integers(-5, 6))
                color = (int(np.clip(132 + var + warm, 0, 255)), int(np.clip(131 + var, 0, 255)), int(np.clip(122 + var - warm, 0, 255)))
                poly = [(left + 4, y + 6), (left + 18, y + 3), (right - 12, y + 5), (right - 3, y + 11),
                        (right - 5, y + 53), (right - 15, y + 60), (left + 12, y + 58), (left + 3, y + 49)]
                for wrap in (-size, 0, size):
                    pp = [(x + wrap, z) for x, z in poly]; d.polygon(pp, fill=color); hd.polygon(pp, fill=int(rng.integers(175, 222)))
        px = np.asarray(im, dtype=float)
        mott = np.asarray(Image.fromarray(rng.integers(100, 156, (32, 32), dtype=np.uint8)).resize((size, size), Image.Resampling.BICUBIC), dtype=float) - 128
        im = Image.fromarray(np.clip(px + (mott * .35 + rng.normal(0, 3, (size, size)))[:, :, None], 0, 255).astype('uint8'))
        hm = Image.fromarray(np.clip(np.asarray(hm, dtype=float) + mott * .3, 0, 255).astype('uint8'))
    h = np.asarray(hm, dtype=float) / 255
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * .4; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * .4
    n = np.stack((-gx, gy, np.ones_like(h)), axis=-1); n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return im, Image.fromarray(np.clip((n * .5 + .5) * 255, 0, 255).astype('uint8'))


# ---- Geometry helpers ---------------------------------------------------------------------
def unit(v):
    v = np.asarray(v, dtype=float); return v / max(np.linalg.norm(v), 1e-12)


def oriented(tri, outward):
    n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
    return tri[::-1].copy() if n @ outward < 0 else tri


def split(poly, axis, value):
    """Split a convex polygon by the plane p@axis == value; returns the non-empty halves."""
    parts = []
    for above in (False, True):
        out = []
        for k, p in enumerate(poly):
            q = poly[(k + 1) % len(poly)]; a = p @ axis - value; b = q @ axis - value
            ins = a >= -1e-7 if above else a <= 1e-7; oth = b >= -1e-7 if above else b <= 1e-7
            if ins: out.append(p)
            if ins != oth and abs(a - b) > 1e-9: out.append(p + (q - p) * (a / (a - b)))
        if len(out) >= 3: parts.append(out)
    return parts


def fan(poly):
    for k in range(1, len(poly) - 1):
        t = np.array([poly[0], poly[k], poly[k + 1]])
        if np.linalg.norm(np.cross(t[1] - t[0], t[2] - t[0])) > 1e-5: yield t


def cut_openings(tri, face):
    polys = [list(tri)]
    for o in B.OPENINGS:
        if o['face'] != face: continue
        c, u, v, w, h = o['center'], o['u'], o['v'], o['width'] / 2, o['height'] / 2
        rel = tri - c
        if (rel @ u).max() < -w or (rel @ u).min() > w or (rel @ v).max() < -h or (rel @ v).min() > h: continue
        for axis, ext in ((u, w), (v, h)):
            for val in (c @ axis - ext, c @ axis + ext):
                polys = [part for poly in polys for part in split(poly, axis, val)]
        polys = [p for p in polys if not (abs((np.mean(p, axis=0) - c) @ u) < w - 1e-5 and abs((np.mean(p, axis=0) - c) @ v) < h - 1e-5)]
    for p in polys: yield from fan(p)


def wall_uv(tri, normal, mat):
    horiz = tri[:, 0] if abs(normal[2]) >= abs(normal[0]) else tri[:, 2]
    return np.stack((horiz, tri[:, 1]), axis=1) / (1200 if mat == STONE else 1600)


def slope_uv(tri, normal):
    u = np.cross([0, 1, 0], normal)
    u = unit(u) if np.linalg.norm(u) > .1 else np.array([1., 0, 0])
    v = np.cross(normal, u); return np.stack((tri @ u, tri @ v), axis=1) / 1600


# ---- Mesh collection --------------------------------------------------------------------
class Model:
    def __init__(self): self.meshes = []  # (name, {material: [tris, normals, uvs]})

    def mesh(self, name):
        groups = {}; self.meshes.append((name, groups)); return groups

    @staticmethod
    def add(groups, mat, tri, normal, uv):
        g = groups.setdefault(mat, [[], [], []]); g[0].append(tri); g[1].append(np.tile(normal, (3, 1))); g[2].append(uv)


def build(mode):
    """mode: 'white' | 'color-block' | 'render'."""
    m = Model(); white = mode == 'white'; openings = mode == 'render'
    # Walls ------------------------------------------------------------------
    for name, outward, pts in B.WALLS:
        outward = np.array(outward, dtype=float); groups = m.mesh(name)
        for tri in B.triangulate([B.web(*p) for p in pts], outward):
            tri = oriented(tri, outward)
            if white:
                m.add(groups, 1, tri, outward, wall_uv(tri, outward, 1) ); continue
            pieces = [tri]
            for level in (B.PLINTH, B.EAVE):
                pieces = [t for p in pieces for part in split(list(p), np.array([0., 1, 0]), level) for t in fan(part)]
            if openings: pieces = [t for p in pieces for t in cut_openings(p, name)]
            for t in pieces:
                t = oriented(t, outward); cy = t[:, 1].mean()
                mat = STONE if cy < B.PLINTH else (VERTICAL if cy > B.EAVE else HORIZONTAL)
                m.add(groups, mat, t, outward, wall_uv(t, outward, mat))
    for name, pts in B.FLOORS:
        groups = m.mesh(name)
        for tri in B.triangulate([B.web(*p) for p in pts], (0, 1, 0)):
            tri = oriented(tri, np.array([0., 1, 0]))
            m.add(groups, 1 if white else FLOOR, tri, np.array([0., 1, 0]), tri[:, [0, 2]] / 1600)
    # Roofs ------------------------------------------------------------------
    for roof in B.ROOFS:
        groups = m.mesh(roof['name'])
        poly = B.roof_polygon(roof, 'white' if white else 'eaves')
        n = B.polygon_normal(poly); n = n if n[1] > 0 else -n
        top_mat = TRIM if roof.get('flat') else ROOF
        for tri in B.triangulate(poly, n):
            tri = oriented(tri, n)
            if white: m.add(groups, 0, tri, n, slope_uv(tri, n)); continue
            up = np.array([0., B.ROOF_THICKNESS, 0])
            top = tri + up; m.add(groups, top_mat, top, n, slope_uv(top, n))
            bot = tri[::-1].copy(); m.add(groups, TRIM, bot, -n, slope_uv(bot, -n))
        if white: continue
        centre = np.mean(poly, axis=0)
        for e in roof['exposed']:
            a, b = poly[e], poly[(e + 1) % len(poly)]
            out = np.cross(b - a, [0, 1, 0]); out[1] = 0; out = unit(out)
            if out @ ((a + b) / 2 - centre) < 0: out = -out
            up = np.array([0., B.ROOF_THICKNESS, 0])
            for t in (np.array([a, b, b + up]), np.array([a, b + up, a + up])):
                t = oriented(t, out); m.add(groups, TRIM, t, out, wall_uv(t, out, TRIM))
    if openings: add_opening_details(m)
    return m


def add_opening_details(m):
    for o in B.OPENINGS:
        groups = m.mesh('Opening_' + o['name'])
        c, u, v, out, w, h, kind = o['center'], o['u'], o['v'], o['outward'], o['width'], o['height'], o['kind']
        def pt(x, y, depth=0.): return c + u * x + v * y + out * depth
        def face(points, mat, facing):
            for ids in ((0, 1, 2), (0, 2, 3)):
                t = oriented(np.array([points[k] for k in ids]), facing)
                nn = unit(np.cross(t[1] - t[0], t[2] - t[0]))
                m.add(groups, mat, t, nn, np.array([[0, 0], [1, 0], [1, 1]], dtype=float))
        def panel(x0, y0, x1, y1, depth, mat): face([pt(x0, y0, depth), pt(x1, y0, depth), pt(x1, y1, depth), pt(x0, y1, depth)], mat, out)
        corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
        for k, (x, y) in enumerate(corners):  # reveals face into the opening
            a, b = corners[(k + 1) % 4]; inward = -unit(u * (x + a) / 2 + v * (y + b) / 2)
            face([pt(x, y), pt(a, b), pt(a, b, -170), pt(x, y, -170)], REVEAL, inward)
        panel(-w / 2, -h / 2, w / 2, h / 2, -165, TRIM if kind == 'garage' else (ENTRY if kind == 'door' else GLASS))
        t = 75
        b = 0 if c[1] - h / 2 <= 1 else t
        panel(-w / 2 - t, -h / 2 - b, -w / 2, h / 2 + t, 25, TRIM); panel(w / 2, -h / 2 - b, w / 2 + t, h / 2 + t, 25, TRIM)
        if c[1] - h / 2 > 1: panel(-w / 2, -h / 2 - t, w / 2, -h / 2, 25, TRIM)  # no sill below ground at doors
        panel(-w / 2, h / 2, w / 2, h / 2 + t, 25, TRIM)
        if kind == 'vent':
            for y in np.arange(-h / 2, h / 2, 45): panel(-w / 2, y, w / 2, min(y + 20, h / 2), -120, TRIM)
        elif kind == 'garage':  # sectional door: horizontal panel joints
            for row in range(1, 5):
                y = -h / 2 + h * row / 5; panel(-w / 2, y - 10, w / 2, y + 10, -145, REVEAL)
        else:
            cols = 1 if w <= 700 else (3 if w >= 1700 and kind == 'window' else 2)
            for col in range(1, cols):
                x = -w / 2 + w * col / cols; panel(x - 25, -h / 2, x + 25, h / 2, -125, TRIM)
            if kind == 'window' and h >= 1000: panel(-w / 2, h / 2 - 450, w / 2, h / 2 - 415, -125, TRIM)
            if kind == 'door': panel(-w / 2 + 100, 50, w / 2 - 100, h / 2 - 100, -140, GLASS)


# ---- glTF writer ----------------------------------------------------------------------------
def write_glb(model, mode, dest):
    j = {'asset': {'version': '2.0', 'generator': 'Sunningdale parametric baseline',
                   'extras': {'source': 'scripts/typology/sunningdale_baseline.py', 'representation': mode}},
         'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'accessors': [], 'bufferViews': [], 'materials': []}
    binary = bytearray()
    def view(data, target=None):
        while len(binary) % 4: binary.append(0)
        v = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
        if target: v['target'] = target
        j['bufferViews'].append(v); binary.extend(data); return len(j['bufferViews']) - 1
    def accessor(values, typ, comp=5126, target=34962):
        values = np.ascontiguousarray(values, dtype='<f4' if comp == 5126 else '<u4')
        a = {'bufferView': view(values.tobytes(), target), 'componentType': comp, 'count': len(values), 'type': typ}
        if typ == 'VEC3' or typ == 'SCALAR': a.update(min=np.atleast_2d(values.reshape(len(values), -1)).min(0).tolist(),
                                                      max=np.atleast_2d(values.reshape(len(values), -1)).max(0).tolist())
        j['accessors'].append(a); return len(j['accessors']) - 1
    if mode == 'white':
        for name, rgb in WHITE_MATERIALS:
            j['materials'].append({'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorFactor': rgb, 'metallicFactor': 0, 'roughnessFactor': .9}})
    else:
        mats = MATERIALS + ([(n, c) for n, c, _ in OPENING_MATERIALS] if mode == 'render' else [])
        rough = {n: r for n, _, r in OPENING_MATERIALS}
        for name, rgb in mats:
            j['materials'].append({'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {
                'baseColorFactor': [(c / 255) ** 2.2 for c in rgb] + [1], 'metallicFactor': .15 if 'Glass' in name else 0,
                'roughnessFactor': rough.get(name, .88)}})
        j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]; j['images'] = []; j['textures'] = []
        for kind, ids in (('roof', [ROOF]), ('horizontal', [HORIZONTAL]), ('vertical', [VERTICAL]), ('stone', [STONE])):
            for image, channel in zip(texture(kind), ('baseColorTexture', 'normalTexture')):
                buf = io.BytesIO(); image.save(buf, format='PNG')
                j['images'].append({'bufferView': view(buf.getvalue()), 'mimeType': 'image/png', 'name': kind + '_' + channel})
                j['textures'].append({'source': len(j['images']) - 1, 'sampler': 0}); ti = len(j['textures']) - 1
                for mi in ids:
                    if channel == 'baseColorTexture': j['materials'][mi]['pbrMetallicRoughness'].update(baseColorFactor=[1, 1, 1, 1], baseColorTexture={'index': ti})
                    else: j['materials'][mi]['normalTexture'] = {'index': ti, 'scale': .45}
    for name, groups in model.meshes:
        prims = []
        for mat in sorted(groups):
            tris, normals, uvs = groups[mat]
            pos = np.concatenate(tris).reshape(-1, 3); nor = np.concatenate(normals).reshape(-1, 3); uv = np.concatenate(uvs).reshape(-1, 2)
            prims.append({'attributes': {'POSITION': accessor(pos, 'VEC3'), 'NORMAL': accessor(nor, 'VEC3'), 'TEXCOORD_0': accessor(uv, 'VEC2')},
                          'indices': accessor(np.arange(len(pos), dtype='<u4'), 'SCALAR', 5125, 34963), 'material': mat})
        if not prims: continue
        j['meshes'].append({'name': name, 'primitives': prims}); j['nodes'].append({'name': name, 'mesh': len(j['meshes']) - 1})
        j['scenes'][0]['nodes'].append(len(j['nodes']) - 1)
    while len(binary) % 4: binary.append(0)
    j['buffers'] = [{'byteLength': len(binary)}]
    text = json.dumps(j, separators=(',', ':')).encode(); text += b' ' * (-len(text) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 28 + len(text) + len(binary)) + struct.pack('<II', len(text), 0x4E4F534A) + text + struct.pack('<II', len(binary), 0x004E4942) + binary
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(out); print(dest.relative_to(ROOT), len(out), 'bytes')


if __name__ == '__main__':
    for mode, rel in (('white', 'model.glb'), ('color-block', 'color-block/model.glb'), ('render', 'render/model.glb')):
        write_glb(build(mode), mode, HOUSE / rel)

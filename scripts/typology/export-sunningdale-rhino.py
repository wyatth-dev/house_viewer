"""Write the Sunningdale modelling library (Rhino review exports + editable source).

- House_Sunningdale_source.3dm: closed Brep massing generated from sunningdale_baseline.py
- House_Sunningdale.glb: copy of the published White model
- House_Sunningdale_{White,ColorBlocks,Detailed}.3dm: mesh exports of the three GLBs
- textures/{ColorBlocks,Detailed}/*.png
Web (x, y, z) maps to Rhino (x, -z, y), identical to the Fairy exports. Requires rhino3dm.
Override the destination with SUNNINGDALE_CAD_DIR (and SUNNINGDALE_TEXTURE_ROOT for the recorded texture path).
"""
import io, json, os, shutil, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image
import rhino3dm as r
sys.path.insert(0, str(Path(__file__).parent))
import sunningdale_baseline as B

ROOT = Path(__file__).resolve().parents[2]
HOUSE = ROOT / 'public/scenes/typology/sunningdale-house'
DEST = Path(os.environ.get('SUNNINGDALE_CAD_DIR', '/Users/Celuplast/Documents/CeluplastVS/resources/modelling/House_Sunningdale'))
DEST.mkdir(parents=True, exist_ok=True)
# Path recorded inside the .3dm for bitmap textures (the Mac path when DEST is a mounted copy).
TEXTURE_ROOT = Path(os.environ.get('SUNNINGDALE_TEXTURE_ROOT', DEST))


def rh(px, d, y):
    p = B.web(px, d, y); return r.Point3d(float(p[0]), float(-p[2]), float(p[1]))


# ---- Editable Brep source ------------------------------------------------------------------
def write_source():
    f = r.File3dm(); f.Settings.ModelUnitSystem = r.UnitSystem.Millimeters
    layers = {}
    for name, color in (('House_Walls', (230, 200, 170, 255)), ('House_Roof', (90, 90, 100, 255))):
        layer = r.Layer(); layer.Name = name; layer.Color = color; layers[name] = f.Layers.Add(layer)
    def attr(layer, name):
        a = r.ObjectAttributes(); a.LayerIndex = layers[layer]; a.Name = name; return a
    def prism(name, pts, y0, y1):
        pts = [rh(px, d, y0) for px, d in pts]
        area = sum(pts[i].X * pts[(i + 1) % len(pts)].Y - pts[(i + 1) % len(pts)].X * pts[i].Y for i in range(len(pts)))
        if area < 0: pts = pts[::-1]
        curve = r.Polyline(pts + [pts[0]]).ToNurbsCurve()
        brep = r.Extrusion.Create(curve, y1 - y0, True).ToBrep(True)
        assert brep.IsSolid and brep.IsValid, name; f.Objects.AddBrep(brep, attr('House_Walls', name))
    # Brep.CreateFromMesh leaves edge tolerances unset (invalid Breps that Rhino cannot
    # render), so every roof is built from Extrusions or trimmed planar faces instead.
    def extrude(name, profile, direction, length, layer='House_Roof'):
        """Extrude a planar profile `length` mm along `direction` (Extrusion follows the curve normal)."""
        for pts in (profile, profile[::-1]):
            brep = r.Extrusion.Create(r.Polyline(pts + [pts[0]]).ToNurbsCurve(), length, True).ToBrep(True)
            o = profile[0]; locs = [brep.Vertices[i].Location for i in range(len(brep.Vertices))]
            proj = [(q.X - o.X) * direction.X + (q.Y - o.Y) * direction.Y + (q.Z - o.Z) * direction.Z for q in locs]
            if abs(max(proj) - length) < .01 and abs(min(proj)) < .01: break
        else: raise AssertionError(name)
        assert brep.IsSolid and brep.IsValid, name
        f.Objects.AddBrep(brep, attr(layer, name))
    def planar_faces(name, faces):
        g = r.Group(); g.Name = name; f.Groups.Add(g); gi = f.Groups.FindName(name).Index
        for label, pts in faces:
            plane = r.Plane(pts[0], pts[1], pts[2])
            boundary = r.PolyCurve()  # one edge per side so Rhino's Join can match neighbouring faces
            for k in range(len(pts)): boundary.Append(r.LineCurve(pts[k], pts[(k + 1) % len(pts)]))
            brep = r.Brep.CreateTrimmedPlane(plane, boundary)
            assert brep and brep.IsValid, label
            a = attr('House_Roof', f'{name}_{label}'); a.AddToGroup(gi); f.Objects.AddBrep(brep, a)
    W, G = B.WIDTH, B.GF
    prism('Ground_Floor', [(0, 0), (W, 0), (W, 4600), (5800, 4600), (5800, 8100), (4000, 8100), (4000, 9900), (0, 9900)], 0, G)
    prism('Garage', [(5800, 4600), (W, 4600), (W, 10400), (5800, 10400)], 0, G)
    prism('First_Floor', [(0, 0), (W, 0), (W, 6800), (4000, 6800), (4000, 9900), (0, 9900)], G, B.EAVE)
    # Main gable roof: triangular section through the left gable, extruded across the width.
    extrude('Roof_Main', [rh(0, 0, B.EAVE), rh(0, 3400, B.RIDGE), rh(0, 6800, B.EAVE)], r.Vector3d(1, 0, 0), W)
    # Front gable roof: section at the front wall, extruded back to the valley apex (inside the main roof).
    extrude('Roof_Front_Gable', [rh(0, 9900, B.EAVE), rh(2000, 9900, B.WING_RIDGE), rh(4000, 9900, B.EAVE)], r.Vector3d(0, 1, 0), 9900 - 4800)
    extrude('Roof_Entry_Canopy', [rh(4000, 6800, G), rh(5800, 6800, G), rh(5800, 9900, G), rh(4000, 9900, G)], r.Vector3d(0, 0, 1), B.ROOF_THICKNESS)
    a, b, c, d = rh(5800, 6800, G), rh(W, 6800, G), rh(W, 10400, G), rh(5800, 10400, G)
    r1, r2 = rh(8550, 6800, B.GARAGE_RIDGE), rh(8550, 7650, B.GARAGE_RIDGE)
    planar_faces('Roof_Garage_Hipped', [('Left', [a, r1, r2, d]), ('Right', [b, c, r2, r1]), ('Front_Hip', [d, r2, c]),
                                        ('Back_Closure', [a, b, r1]), ('Base', [a, d, c, b])])
    dest = DEST / 'House_Sunningdale_source.3dm'; assert f.Write(str(dest), 8)
    assert all(o.Geometry.IsValid for o in f.Objects)
    print(dest, len(f.Objects), 'valid Breps')


# ---- Mesh review exports ---------------------------------------------------------------------
def export(mode, path):
    raw = path.read_bytes(); length = struct.unpack_from('<I', raw, 12)[0]; j = json.loads(raw[20:20 + length]); binary = raw[28 + length:]
    f = r.File3dm(); f.Settings.ModelUnitSystem = r.UnitSystem.Millimeters
    layers = {}; texture_dir = DEST / 'textures' / mode
    for index, mat in enumerate(j['materials']):
        name = mat['name']; layer = r.Layer(); layer.Name = name
        rgb = mat.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1, 1, 1, 1])
        color = tuple(round(max(0, min(1, v)) ** (1 / 2.2) * 255) for v in rgb[:3]) + (255,)
        layer.Color = color; layers[index] = f.Layers.Add(layer)
        m = r.Material(); m.Name = name; m.DiffuseColor = color; m.Shine = 10
        pbr = mat.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr:
            image = j['images'][j['textures'][pbr['baseColorTexture']['index']]['source']]; view = j['bufferViews'][image['bufferView']]
            data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
            texture_dir.mkdir(parents=True, exist_ok=True); texture_path = texture_dir / (name + '.png'); texture_path.write_bytes(data)
            m.SetBitmapTexture(str(TEXTURE_ROOT / 'textures' / mode / (name + '.png')))
            mean = np.mean(np.asarray(Image.open(io.BytesIO(data)).convert('RGB')), axis=(0, 1)); m.DiffuseColor = tuple(int(v) for v in mean) + (255,)
        f.Materials.Add(m)
    def read(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; dim = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2'}[a['componentType']]
        return np.ndarray((a['count'], dim), dtype=dtype, buffer=binary, offset=v.get('byteOffset', 0) + a.get('byteOffset', 0))
    count = 0
    for node in j['nodes']:
        source = j['meshes'][node['mesh']]
        for part, p in enumerate(source['primitives']):
            mesh = r.Mesh(); points = read(p['attributes']['POSITION']); ids = read(p['indices']).ravel()
            for x, y, z in points: mesh.Vertices.Add(float(x), float(-z), float(y))
            for u, v in read(p['attributes']['TEXCOORD_0']): mesh.TextureCoordinates.__add__(float(u), float(1 - v))
            for a, b, c in ids.reshape(-1, 3): mesh.Faces.AddFace(int(a), int(b), int(c))
            mesh.Normals.ComputeNormals(); mesh.Compact()
            attr = r.ObjectAttributes(); attr.Name = f"{node['name']}__{part:02}"; material = p['material']
            attr.LayerIndex = layers[material]; attr.MaterialSource = r.ObjectMaterialSource.MaterialFromObject; attr.MaterialIndex = material
            f.Objects.AddMesh(mesh, attr); count += 1
    dest = DEST / f'House_Sunningdale_{mode}.3dm'; assert f.Write(str(dest), 8)
    check = r.File3dm.Read(str(dest)); assert check is not None and len(check.Objects) == count and check.Settings.ModelUnitSystem == r.UnitSystem.Millimeters
    print(f'{dest} — {count} mesh objects, verified mm units')


if __name__ == '__main__':
    write_source()
    shutil.copy2(HOUSE / 'model.glb', DEST / 'House_Sunningdale.glb'); print(DEST / 'House_Sunningdale.glb')
    for mode, rel in (('White', 'model.glb'), ('ColorBlocks', 'color-block/model.glb'), ('Detailed', 'render/model.glb')):
        export(mode, HOUSE / rel)

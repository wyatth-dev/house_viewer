"""Export all three GLB representations as aligned, editable Rhino mesh documents."""
import io,json,struct
from pathlib import Path
import numpy as np
from PIL import Image
import rhino3dm as r
ROOT=Path(__file__).resolve().parents[2]
HOUSE=ROOT/'public/scenes/typology/fairy-house'
DEST=Path('/Users/Celuplast/Documents/CeluplastVS/resources/modelling/House_Fairy')
DEST.mkdir(parents=True,exist_ok=True)
for mode,path in [('White',HOUSE/'model.glb'),('ColorBlocks',HOUSE/'color-block/model.glb'),('Detailed',HOUSE/'render/model.glb')]:
    raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=raw[28+length:]
    f=r.File3dm();f.Settings.ModelUnitSystem=r.UnitSystem.Millimeters
    layers={}
    texture_dir=DEST/'textures'/mode
    for index,mat in enumerate(j['materials']):
        name=mat.get('name',f'Material_{index}');layer=r.Layer();layer.Name=name
        rgb=mat.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1]);color=tuple(round(max(0,min(1,v))**(1/2.2)*255) for v in rgb[:3])+(255,)
        layer.Color=color;layers[index]=f.Layers.Add(layer)
        m=r.Material();m.Name=name;m.DiffuseColor=color;m.Shine=10
        pbr=mat.get('pbrMetallicRoughness',{})
        if 'baseColorTexture' in pbr:
            image=j['images'][j['textures'][pbr['baseColorTexture']['index']]['source']];view=j['bufferViews'][image['bufferView']];data=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
            texture_dir.mkdir(parents=True,exist_ok=True);texture_path=texture_dir/(name+'.png');texture_path.write_bytes(data)
            m.SetBitmapTexture(str(texture_path))
            # A useful solid display colour when a viewport does not show bitmap textures.
            im=np.asarray(Image.open(io.BytesIO(data)).convert('RGB'));mean=np.mean(im,axis=(0,1));m.DiffuseColor=tuple(int(v) for v in mean)+(255,)
        f.Materials.Add(m)
    def read(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dim={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
        return np.ndarray((a['count'],dim),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
    count=0
    for index,node in enumerate(j['nodes']):
        if 'mesh' not in node:continue
        source=j['meshes'][node['mesh']]
        for part,p in enumerate(source['primitives']):
            mesh=r.Mesh();points=read(p['attributes']['POSITION']);ids=read(p['indices']).ravel() if 'indices' in p else np.arange(len(points))
            for x,y,z in points:mesh.Vertices.Add(float(x),float(-z),float(y))
            if 'TEXCOORD_0' in p['attributes']:
                for u,v in read(p['attributes']['TEXCOORD_0']):mesh.TextureCoordinates.__add__(float(u),float(1-v))
            for a,b,c in ids.reshape(-1,3):mesh.Faces.AddFace(int(a),int(b),int(c))
            mesh.Normals.ComputeNormals();mesh.Compact();material=p.get('material',0)
            attr=r.ObjectAttributes();attr.Name=node.get('name',source.get('name',f'Fairy_Part_{index:02}'))+f'__{part:02}'
            attr.LayerIndex=layers[material];attr.MaterialSource=r.ObjectMaterialSource.MaterialFromObject;attr.MaterialIndex=material
            if node.get('name')=='Restored house floor':attr.Visible=False
            f.Objects.AddMesh(mesh,attr);count+=1
    dest=DEST/f'House_Fairy_{mode}.3dm';assert f.Write(str(dest),8)
    check=r.File3dm.Read(str(dest));assert check is not None and len(check.Objects)==count and check.Settings.ModelUnitSystem==r.UnitSystem.Millimeters
    print(f'{dest} — {count} mesh objects, verified mm units')

"""Check that each intended opening removes the underlying wall/roof at its centre."""
import json,struct
from pathlib import Path
import numpy as np
from fairy_openings import OPENINGS
import importlib.util
spec=importlib.util.spec_from_file_location("prepare",Path(__file__).with_name("prepare-fairy-render.py"));source=importlib.util.module_from_spec(spec);spec.loader.exec_module(source)
p=Path(__file__).resolve().parents[2]/'public/scenes/typology/fairy-house/render/model.glb'
raw=p.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);b=raw[28+length:]
def read(i):
    a=j['accessors'][i];v=j['bufferViews'][a['bufferView']]
    return np.frombuffer(b,dtype='<f4',count=a['count']*3,offset=v['byteOffset']).reshape(-1,3)
def covered(triangles,o):
    for tri in triangles:
        if np.max(np.abs((tri-o['center'])@o['outward']))>3:continue
        xy=np.stack(((tri-o['center'])@o['u'],(tri-o['center'])@o['v']),axis=1)
        matrix=np.column_stack((xy[1]-xy[0],xy[2]-xy[0]))
        if abs(np.linalg.det(matrix))<1e-6:continue
        uv=np.linalg.solve(matrix,-xy[0])
        if min(uv)>=-1e-5 and uv.sum()<=1+1e-5:return True
    return False
for o in OPENINGS:
    baseline=[]
    for primitive in source.original['meshes'][o['mesh']]['primitives']:
        pos=source.read_accessor(primitive['attributes']['POSITION']);indices=source.read_accessor(primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(pos))
        baseline.extend(pos[indices].reshape(-1,3,3))
    assert covered(baseline,o),o['name']+' does not lie on its baseline facade'
    triangles=[tri for primitive in j['meshes'][o['mesh']]['primitives'] for tri in read(primitive['attributes']['POSITION']).reshape(-1,3,3)]
    cap=covered(triangles,o)
    assert not cap, o['name']+' is still capped by the original surface'
    assert any(n.get('name')=='Opening_'+o['name'] for n in j['nodes'])
print(f'{len(OPENINGS)} recessed openings: original centre surfaces removed and separate frame/glazing meshes present')

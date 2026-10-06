"""Verify material splitting preserves each original surface and reference transform."""
from pathlib import Path
import importlib.util, json, struct, sys
sys.path.insert(0,str(Path(__file__).parent))
import numpy as np
spec=importlib.util.spec_from_file_location('prepare',Path(__file__).with_name('prepare-fairy-render.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def surfaces(j,b):
    result=[]
    def read(i):
        a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];dim={'VEC3':3,'SCALAR':1}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
        return np.ndarray((a['count'],dim),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
    for mesh in j['meshes']:
        points=[];area=0;centroid=np.zeros(3)
        for p in mesh['primitives']:
            pos=read(p['attributes']['POSITION']);ind=read(p['indices']).ravel() if 'indices' in p else np.arange(len(pos));tri=pos[ind].reshape(-1,3,3).astype(float)
            areas=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)/2
            area+=areas.sum();centroid+=(tri.mean(axis=1)*areas[:,None]).sum(axis=0);points.extend(pos)
        result.append((np.min(points,axis=0),np.max(points,axis=0),area,centroid/area))
    return result
expected=surfaces(m.original,m.original_binary)
for mode in ['render','color-block']:
    raw=(m.HOUSE/mode/'model.glb').read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);actual=surfaces(j,raw[28+length:])
    for node,source in zip(j['nodes'],m.original['nodes']):
        expected_node=dict(source)
        if source.get('mesh') in (16,29):expected_node['scale']=[0,0,0]
        assert node==expected_node, 'Reference transforms changed'
    assert all(node.get('scale')==[0,0,0] for node in j['nodes'] if node.get('mesh') in (16,29)), 'Embedded corner posts still visible'
    assert j['scenes'][0]['nodes'][:len(m.original['scenes'][0]['nodes'])]==m.original['scenes'][0]['nodes']
    for i,(a,b) in enumerate(zip(expected,actual)):
        # Only roof skins rise by 120 mm; installation wall X/Z bounds stay fixed.
        for endpoint in (0,1):
            np.testing.assert_allclose(a[endpoint][[0,2]],b[endpoint][[0,2]],atol=.01)
            assert -.01<=b[endpoint][1]-a[endpoint][1]<=120.01, 'Unexpected vertical change'
        if mode=="color-block":
            np.testing.assert_allclose(a[2],b[2],rtol=1e-6,atol=.01);np.testing.assert_allclose(a[3][[0,2]],b[3][[0,2]],atol=.01)
            assert -.01<=b[3][1]-a[3][1]<=120.01
        else:assert b[2]<=a[2]+.1, "Openings must remove facade area"
    assert len(actual)>=len(expected)
    if mode=="render":assert len(actual)>len(expected), "Roof thickness and eaves must be present"
    assert len(j['materials'])==(11 if mode=='render' else 7)
    assert all('TEXCOORD_0' in p['attributes'] for mesh in j['meshes'] for p in mesh['primitives'])
    print(mode+': wall reference bounds preserved; roof rise limited to 120 mm; material mapping valid')

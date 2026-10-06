"""Proportion study of both dormers; update their shared shell and adjoining roof cuts."""
import json,struct,shutil
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2];HOUSE=ROOT/'public/scenes/typology/fairy-house';SOURCE=ROOT/'assets/typology/fairy-house/source/base-before-dormer-proportions.glb'
SOURCE.parent.mkdir(parents=True,exist_ok=True)
if not SOURCE.exists():shutil.copy2(HOUSE/'model.glb',SOURCE)
raw=SOURCE.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])

def transform(points):
    p=points.copy();x,y,z=points.T
    # Rear: 3190 -> 2800 mm wide, centred on the existing dormer axis.
    rear=(y>=2740)&(z<-9945)&(z>=-14803)
    for old,new in [(-8453,-8258),(-5263,-5458)]:p[rear&(np.abs(x-old)<1),0]=new
    # Front face height: 1184 -> 1040 mm; roof still intersects the main slope.
    front=(x>=-10208)&(x<=-7654)&(z>=-7825)&(z<=-5094)&(y>3478)
    p[front&(np.abs(z+5095)<1)&(np.abs(y-4663.44)<1),1]-=144
    # Rear face height: 1184 -> 1244 mm, avoiding an excessively wide flat box.
    body_rear=rear&(x>=-8454)&(x<=-5262)&(z<=-12064)
    p[body_rear&(np.abs(z+14794)<1)&(np.abs(y-4663.44)<1),1]+=60
    # Move the intersection edges on the main roof along the same planar slope.
    for oldz,oldy,dz,dy in [(-7824,5087,-205,-175),(-12065,5087,86,74)]:
        matched=(np.abs(z-oldz)<1)&(np.abs(y-oldy)<1)
        p[matched,2]=z[matched]-dz if oldz==-7824 else z[matched]+dz
        p[matched,1]=y[matched]+dy
    return p

seen=set()
for mesh in j['meshes']:
 for primitive in mesh['primitives']:
  index=primitive['attributes']['POSITION']
  if index in seen:continue
  seen.add(index);a=j['accessors'][index];v=j['bufferViews'][a['bufferView']]
  points=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4));points[:]=transform(points.copy());a['min']=points.min(0).tolist();a['max']=points.max(0).tolist()
# Recalculate flat surface normals after modifying the shared geometric proportions.
for mesh in j['meshes']:
 for primitive in mesh['primitives']:
  attrs=primitive['attributes'];a=j['accessors'][attrs['POSITION']];v=j['bufferViews'][a['bufferView']];p=np.ndarray((a['count'],3),dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4))
  if 'indices' in primitive:
   aidx=j['accessors'][primitive['indices']];vidx=j['bufferViews'][aidx['bufferView']];dtype={5125:'<u4',5123:'<u2',5121:'u1'}[aidx['componentType']];ids=np.frombuffer(binary,dtype=dtype,count=aidx['count'],offset=vidx.get('byteOffset',0)+aidx.get('byteOffset',0)).reshape(-1,3)
  else:ids=np.arange(len(p)).reshape(-1,3)
  na=j['accessors'][attrs['NORMAL']];nv=j['bufferViews'][na['bufferView']];normal=np.ndarray((na['count'],3),dtype='<f4',buffer=binary,offset=nv.get('byteOffset',0)+na.get('byteOffset',0),strides=(nv.get('byteStride',12),4))
  for tri in ids:
   n=np.cross(p[tri[1]]-p[tri[0]],p[tri[2]]-p[tri[0]]);length=np.linalg.norm(n)
   if length>1e-5:normal[tri]=n/length
text=json.dumps(j,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
(HOUSE/'model.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary)
print('Shared dormers: front face height 1040 mm; rear width 2800 mm and height 1244 mm. Original centres/front planes retained.')

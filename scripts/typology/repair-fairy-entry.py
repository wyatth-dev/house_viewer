"""Fill the missing front-left room under its existing gable; preserve installation datums."""
import json,struct,shutil
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[2]
HOUSE=ROOT/'public/scenes/typology/fairy-house'
BACKUP=ROOT/'assets/typology/fairy-house/source/base-before-entry-repair.glb'
BACKUP.parent.mkdir(parents=True,exist_ok=True)
if not BACKUP.exists():shutil.copy2(HOUSE/'model.glb',BACKUP)
raw=BACKUP.read_bytes();length=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+length]);binary=bytearray(raw[28+length:])
geometry=[]
def accessor(vals):
    vals=np.array(vals,dtype='<f4')
    while len(binary)%4:binary.append(0)
    view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':vals.nbytes,'target':34962});binary.extend(vals.tobytes())
    index=len(j['accessors']);j['accessors'].append({'bufferView':view,'componentType':5126,'count':len(vals),'type':'VEC3','min':vals.min(0).tolist(),'max':vals.max(0).tolist()});return index

def surface(name,quads,material=1):
    positions=[];normals=[]
    for quad in quads:
        q=np.array(quad,dtype=float)
        for ids in [(0,1,2),(0,2,3)]:
            p=q[list(ids)];n=np.cross(p[1]-p[0],p[2]-p[0]);n/=np.linalg.norm(n);positions.extend(p.tolist());normals.extend([n.tolist()]*3)
    mesh=len(j['meshes']);j['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':accessor(positions),'NORMAL':accessor(normals)},'material':material}]});j['nodes'].append({'name':name,'mesh':mesh});j['scenes'][0]['nodes'].append(len(j['nodes'])-1);geometry.append({'name':name,'quads':quads,'material':material})
surface('Front_Left_Room_Facade',[[[-13716,0,-2301],[-10287,0,-2301],[-10287,2743.2,-2301],[-13716,2743.2,-2301]]])
surface('Front_Left_Room_Left_Return',[[[-13716,0,-5088],[-13716,0,-2301],[-13716,2743.2,-2301],[-13716,2743.2,-5088]]])
surface('Front_Left_Room_Porch_Return',[[[-10287,0,-2301],[-10287,0,-5088],[-10287,2743.2,-5088],[-10287,2743.2,-2301]]])
x0,x1=-7297,-7017;z0,z1=-2473,-2313;h=2743.2
surface('House_Trim_Front_Porch_Post',[
 [[x0,0,z0],[x1,0,z0],[x1,h,z0],[x0,h,z0]],[[x1,0,z1],[x0,0,z1],[x0,h,z1],[x1,h,z1]],
 [[x0,0,z1],[x0,0,z0],[x0,h,z0],[x0,h,z1]],[[x1,0,z0],[x1,0,z1],[x1,h,z1],[x1,h,z0]]],0)
# A local porch deck establishes the recessed entry, instead of the oversized legacy slab.
surface('Front_Porch_Deck',[[[-10287,15,-5088],[-7017,15,-5088],[-7017,15,-2313],[-10287,15,-2313]]],1)
while len(binary)%4:binary.append(0)
j['buffers'][0]['byteLength']=len(binary);j['asset']['extras']={'entryRepair':'Front-left room extends to the existing gable plane; installation reference meshes unchanged'}
text=json.dumps(j,separators=(',',':')).encode();text+=b' '*(-len(text)%4)
(HOUSE/'model.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary)
(BACKUP.parent/'entry-repair-geometry.json').write_text(json.dumps(geometry,indent=2)+'\n')
print('Shared white baseline repaired; original 31 mesh data and node transforms retained; 5 room/porch meshes added')

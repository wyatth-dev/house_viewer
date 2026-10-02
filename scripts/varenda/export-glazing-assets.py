"""Export exact glass box and measured gasket sections in PlayCanvas millimeters.
Requires rhino3dm and shapely. Rhino source files are read-only.
"""
import json, math, struct
from pathlib import Path
import rhino3dm as r
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
ROOT = Path(__file__).resolve().parents[3] / 'CeluplastVS/resources/modelling/Product_Varenda'
OUT = Path(__file__).resolve().parents[2] / 'public/models/varenda'
TOLERANCE = 0.001

def write_glb(name, triangles, color, metallic=0, roughness=0.8, transparent=False):
    positions, normals = [], []
    for tri in triangles:
        pc = [(x,z,-y) for x,y,z in tri]
        a,b,c = pc; u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length=math.sqrt(sum(x*x for x in n))
        if length < 1e-12: continue
        for p in pc: positions.extend(p);normals.extend(x/length for x in n)
    pb=struct.pack('<%df'%len(positions),*positions);nb=struct.pack('<%df'%len(normals),*normals)
    binary=pb+nb;count=len(positions)//3
    material={'name':name,'pbrMetallicRoughness':{'baseColorFactor':color,'metallicFactor':metallic,'roughnessFactor':roughness},'doubleSided':True}
    if transparent: material['alphaMode']='BLEND'
    doc={'asset':{'version':'2.0','generator':'Varenda measured glazing profile export'},'scene':0,'scenes':[{'nodes':[0]}],
      'nodes':[{'mesh':0,'name':name}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1},'material':0}]}],
      'materials':[material],'buffers':[{'byteLength':len(binary)}],
      'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':len(pb),'target':34962},{'buffer':0,'byteOffset':len(pb),'byteLength':len(nb),'target':34962}],
      'accessors':[{'bufferView':0,'componentType':5126,'count':count,'type':'VEC3','min':[min(positions[i::3]) for i in range(3)],'max':[max(positions[i::3]) for i in range(3)]},{'bufferView':1,'componentType':5126,'count':count,'type':'VEC3'}]}
    jb=json.dumps(doc,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);binary+=b'\0'*((-len(binary))%4)
    path=OUT/(name+'.glb');path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(binary))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(binary),0x004e4942)+binary)
    return {'file':path.name,'triangles':count//3,'bytes':path.stat().st_size}

# A 1 mm cube centered on its entity origin. Scale dimensions independently.
triangles=[]
for axis in range(3):
    remaining=[i for i in range(3) if i!=axis]
    for face in [-0.5,0.5]:
        points=[]
        for a,b in [(-0.5,-0.5),(0.5,-0.5),(0.5,0.5),(-0.5,0.5)]:
            p=[0.,0.,0.];p[axis]=face;p[remaining[0]]=a;p[remaining[1]]=b;points.append(p)
        a,b,c=points[:3];u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        if normal[axis]*face<0:points.reverse()
        triangles.extend([[points[0],points[1],points[2]],[points[0],points[2],points[3]]])
report=[write_glb('glass-panel',triangles,[0.66,0.86,0.9,0.28],roughness=0.08,transparent=True)]
f=r.File3dm.Read(str(ROOT/'rafter-source.3dm'))
for role,name in [('support','Glazing Support Gasket'),('wedge-a','Glazing Wedge Gasket A'),('wedge-b','Glazing Wedge Gasket B')]:
    obj=next(o for o in f.Objects if o.Attributes.Name==name and isinstance(o.Geometry,r.Brep) and min(v.Location.X for v in o.Geometry.Vertices)>0)
    edges=[e for e in obj.Geometry.Edges if e.PointAtStart.Y<-49.99 and e.PointAtEnd.Y<-49.99]
    def point(e,t):
        p=e.PointAt(t);return (p.X,p.Z)
    def distance(a,b):return math.hypot(a[0]-b[0],a[1]-b[1])
    def sample(e,t0,t1,depth=0):
        a=point(e,t0);b=point(e,t1)
        errors=[distance(point(e,t0+(t1-t0)*q),(a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q)) for q in [0.25,0.5,0.75]]
        if max(errors)<=TOLERANCE or depth>=20:return [a]
        mid=(t0+t1)/2;return sample(e,t0,mid,depth+1)+sample(e,mid,t1,depth+1)
    loops=[]
    while edges:
        e=edges.pop(0);start=point(e,e.Domain.T0);end=point(e,e.Domain.T1)
        ring=sample(e,e.Domain.T0,e.Domain.T1)
        while distance(end,start)>1e-5:
            found=False
            for i,e in enumerate(edges):
                a=point(e,e.Domain.T0);b=point(e,e.Domain.T1)
                if distance(a,end)<1e-5:ts=(e.Domain.T0,e.Domain.T1);end=b
                elif distance(b,end)<1e-5:ts=(e.Domain.T1,e.Domain.T0);end=a
                else:continue
                ring.extend(sample(e,*ts));edges.pop(i);found=True;break
            assert found,'Unconnected gasket section'
        loops.append(ring)
    loops.sort(key=lambda x:Polygon(x).area,reverse=True)
    poly=orient(Polygon(loops[0],loops[1:]),sign=1);assert poly.is_valid
    # Ear clipping retains every concave boundary; unconstrained Delaunay can leave gaps.
    assert len(poly.interiors)==0, 'Unexpected hollow gasket section'
    vertices=list(poly.exterior.coords)[:-1];caps=[]
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    while len(vertices)>3:
        for i,b in enumerate(vertices):
            a=vertices[i-1];c=vertices[(i+1)%len(vertices)]
            if abs(cross(a,b,c))<1e-12:
                vertices.pop(i);break
            if cross(a,b,c)<=0:continue
            others=[p for j,p in enumerate(vertices) if j not in {(i-1)%len(vertices),i,(i+1)%len(vertices)}]
            if any(cross(a,b,p)>=-1e-12 and cross(b,c,p)>=-1e-12 and cross(c,a,p)>=-1e-12 for p in others):continue
            caps.append(Polygon([a,b,c]));vertices.pop(i);break
        else:raise ValueError('Cannot triangulate gasket section')
    caps.append(Polygon(vertices))
    assert abs(sum(t.area for t in caps)-poly.area)<1e-7
    triangles=[]
    for t in caps:
        points=list(orient(t,sign=1).exterior.coords)[:3]
        triangles.extend([[(x,-50,z) for x,z in points],[(x,50,z) for x,z in reversed(points)]])
    for ring in [poly.exterior,*poly.interiors]:
        pts=list(ring.coords)
        for (x,z),(xx,zz) in zip(pts[:-1],pts[1:]):
            triangles.extend([[(x,-50,z),(x,50,z),(xx,50,zz)],[(x,-50,z),(xx,50,zz),(xx,-50,zz)]])
    result=write_glb('glazing-'+role,triangles,[0.055,0.055,0.055,1]);result.update({'sourceObjectId':str(obj.Attributes.Id),'sectionChordToleranceMm':TOLERANCE,'sourceLengthMm':100,'origin':'rafter underside center','canonicalSide':'+X'})
    report.append(result)
(ROOT/'docs/glazing-assets-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))

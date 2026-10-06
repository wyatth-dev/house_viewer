"""Prepare aligned render/color-block variants from the calibrated Fairy export.
Run with python3; requires numpy and Pillow. Never overwrites the white model or Rhino source.
"""
import copy, hashlib, io, json, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from fairy_openings import OPENINGS, cut_triangle
ROOT = Path(__file__).resolve().parents[2]
HOUSE = ROOT / 'public/scenes/typology/fairy-house'
SOURCE = HOUSE / 'model.glb'
raw = SOURCE.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
original = json.loads(raw[20:20+length])
original_binary = raw[28+length:]

def read_accessor(index):
    a = original['accessors'][index]; v = original['bufferViews'][a['bufferView']]
    dtype = {5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    dim = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
    offset = v.get('byteOffset',0)+a.get('byteOffset',0)
    return np.ndarray((a['count'],dim),dtype=dtype,buffer=original_binary,offset=offset,
        strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize)).copy()

# Tiles are generated at physical scales, not stretched to fit each facade.
def texture(kind):
    size=512; rng=np.random.default_rng(1539)
    base={'roof':(72,78,83),'horizontal':(224,222,213),'vertical':(235,233,224),'stone':(131,127,114)}[kind]
    noise=rng.normal(0,2.2,(size,size,1)); pixels=np.clip(np.array(base)+noise,0,255).astype('uint8')
    im=Image.fromarray(pixels); d=ImageDraw.Draw(im); height=np.full((size,size),180,dtype=np.uint8)
    hm=Image.fromarray(height); hd=ImageDraw.Draw(hm)
    if kind=='roof':
        for row,y in enumerate(range(0,size,64)):
            d.line((0,y,size,y),fill=(44,48,52),width=3);hd.line((0,y,size,y),fill=70,width=3)
            for x in range(-128,size+128,128):
                x+=64*(row%2);d.line((x,y,x,y+64),fill=(48,53,57),width=2);hd.line((x,y,x,y+64),fill=100,width=2)
    elif kind in ('horizontal','vertical'):
        for t in range(0,size,64):
            line=(0,t,size,t) if kind=='horizontal' else (t,0,t,size)
            d.line(line,fill=(190,190,181),width=2);hd.line(line,fill=95,width=2)
    else:
        # Rough coursed stone: varied lengths, staggered joints and chipped edges.
        im=Image.new('RGB',(size,size),(92,91,85));d=ImageDraw.Draw(im)
        hm=Image.new('L',(size,size),85);hd=ImageDraw.Draw(hm)
        for row,y in enumerate(range(0,size,64)):
            widths=rng.integers(65,165,size=5);widths=widths/widths.sum()*size
            boundaries=np.round(np.r_[0,np.cumsum(widths)]).astype(int)
            offset=(row*91)%size
            for k in range(5):
                left=boundaries[k]+offset;right=boundaries[k+1]+offset
                variation=int(rng.integers(-25,22));warm=int(rng.integers(-5,6))
                color=(int(np.clip(132+variation+warm,0,255)),int(np.clip(131+variation,0,255)),int(np.clip(122+variation-warm,0,255)))
                polygon=[(left+4,y+6),(left+18,y+3),(right-12,y+5),(right-3,y+11),
                         (right-5,y+53),(right-15,y+60),(left+12,y+58),(left+3,y+49)]
                for wrap in [-size,0,size]:
                    poly=[(x+wrap,z) for x,z in polygon]
                    d.polygon(poly,fill=color);hd.polygon(poly,fill=int(rng.integers(175,222)))
        pixels=np.asarray(im,dtype=float)
        mottling=np.asarray(Image.fromarray(rng.integers(100,156,(32,32),dtype=np.uint8)).resize((size,size),Image.Resampling.BICUBIC),dtype=float)-128
        grain=rng.normal(0,3,(size,size))
        im=Image.fromarray(np.clip(pixels+(mottling*.35+grain)[:,:,None],0,255).astype('uint8'))
        hm=Image.fromarray(np.clip(np.asarray(hm,dtype=float)+mottling*.3,0,255).astype('uint8'))
    h=np.asarray(hm,dtype=float)/255; gx=(np.roll(h,-1,1)-np.roll(h,1,1))*0.4;gy=(np.roll(h,-1,0)-np.roll(h,1,0))*0.4
    normals=np.stack((-gx,gy,np.ones_like(h)),axis=-1);normals/=np.linalg.norm(normals,axis=-1,keepdims=True)
    normal=Image.fromarray(np.clip((normals*.5+.5)*255,0,255).astype('uint8'))
    return im,normal

NAMES=['House_Roof_Slate','House_Wall_Horizontal','House_Gable_Vertical','House_Trim_White','House_Base_Stone','House_Chimney_Stone','House_Floor_Concrete']
COLORS=[(72,78,83),(224,222,213),(235,233,224),(245,243,235),(131,127,114),(150,146,133),(188,185,176)]


def wall_triangles(points, normals):
    # Cut only the material boundary on the existing surface; no volume or opening changes.
    polygons=[list(zip(points,normals))]
    for height in [520,2743.2]:
        output=[]
        for poly in polygons:
            for above in [False,True]:
                clipped=[]
                for k,(p,n) in enumerate(poly):
                    q,m=poly[(k+1)%len(poly)]
                    inside=(p[1]>=height) if above else (p[1]<=height)
                    other=(q[1]>=height) if above else (q[1]<=height)
                    if inside:clipped.append((p,n))
                    if inside!=other:
                        t=(height-p[1])/(q[1]-p[1]);clipped.append((p+(q-p)*t,n+(m-n)*t))
                if len(clipped)>=3:output.append(clipped)
        polygons=output
    for poly in polygons:
        for k in range(1,len(poly)-1):
            tri=[poly[0],poly[k],poly[k+1]]
            p=np.array([v[0] for v in tri]);n=np.array([v[1] for v in tri])
            if np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))>1e-5:yield p,n

def build(detailed, openings=False):
    j=copy.deepcopy(original);j['meshes']=[];j['accessors']=[];j['bufferViews']=[];j.pop('extensionsRequired',None);j.pop('extensionsUsed',None)
    j['materials']=[{'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[(c/255)**2.2 for c in rgb]+[1],'metallicFactor':0,'roughnessFactor':.88}} for name,rgb in zip(NAMES,COLORS)]
    binary=bytearray()
    def view(data,target=None):
        while len(binary)%4:binary.append(0)
        i=len(j['bufferViews']);v={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
        if target:v['target']=target
        j['bufferViews'].append(v);binary.extend(data);return i
    def accessor(values,typ):
        values=np.array(values,dtype='<f4');a={'bufferView':view(values.tobytes(),34962),'componentType':5126,'count':len(values),'type':typ}
        if typ=='VEC3':a.update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
        i=len(j['accessors']);j['accessors'].append(a);return i
    if detailed:
        j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}];j['images']=[];j['textures']=[]
        for kind,matids in [('roof',[0]),('horizontal',[1]),('vertical',[2]),('stone',[4,5])]:
            for image,channel in zip(texture(kind),['baseColorTexture','normalTexture']):
                out=io.BytesIO();image.save(out,format='PNG');i=len(j['images']);j['images'].append({'bufferView':view(out.getvalue()),'mimeType':'image/png','name':kind+'_'+channel});j['textures'].append({'source':i,'sampler':0})
                for mi in matids:
                    if channel=='baseColorTexture':j['materials'][mi]['pbrMetallicRoughness'].update(baseColorFactor=[1,1,1,1],baseColorTexture={'index':i})
                    else:j['materials'][mi]['normalTexture']={'index':i,'scale':.45}
    if openings:
        for name,rgb,rough in [('House_Window_Glass',(64,94,104),.15),('House_Opening_Reveal',(209,209,199),.9),('House_Entry_Blue',(55,83,94),.65),('House_Skylight_Frame',(75,81,83),.8)]:
            j['materials'].append({'name':name,'doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[(c/255)**2.2 for c in rgb]+[1],'metallicFactor':.15 if 'Glass' in name else 0,'roughnessFactor':rough}})
    # Old corner posts are embedded in the repaired front room, not porch supports.
    for node in j['nodes']:
        if node.get('mesh') in (16,29):node['scale']=[0,0,0]
    columns={16,19,20,21,22,29,34}
    roof_parts=[]
    roof_baseline={}
    for mi,mesh in enumerate(original['meshes']):
        groups={}
        roof_triangles=[]
        baseline_triangles=[]
        for primitive in mesh['primitives']:
            pos=read_accessor(primitive['attributes']['POSITION']);norm=read_accessor(primitive['attributes']['NORMAL']);indices=read_accessor(primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(pos))
            for ids in indices.reshape(-1,3):
                parts=wall_triangles(pos[ids],norm[ids]) if primitive.get("material")==1 else [(pos[ids],norm[ids])]
                parts=list(parts)
                for bp,bn in parts:
                    bf=np.cross(bp[1]-bp[0],bp[2]-bp[0]);bf/=max(np.linalg.norm(bf),1e-9)
                    if primitive.get('material')!=1 and mi not in columns and mi!=1 and bf[1]>.15 and bp[:,1].mean()>2740:baseline_triangles.append(bp.copy())
                if openings:parts=[piece for p,n in parts for piece in cut_triangle(p,n,mi)]
                for p,n in parts:
                    center=p.mean(axis=0);face=np.cross(p[1]-p[0],p[2]-p[0]);face/=max(np.linalg.norm(face),1e-9)
                    if mi in (30,35):mat=6
                    elif mi in columns:mat=3
                    elif mi==1:mat=5
                    elif primitive.get('material')==1:
                        mat=4 if center[1]<520 else (2 if center[1]>2743 else 1)
                    elif abs(face[1])>.15 and center[1]>2740:mat=0 if face[1]>0 or abs(face[1])<.97 or mi in (2,23,25) else 3
                    else:mat=2 if center[1]>2743 else 3
                    if mat==0 and face[1]>.15:roof_triangles.append(p.copy())
                    # Grow roof thickness above its source surface, clear of gable walls.
                    if mat==0 and face[1]>.15:p=p+np.array([0.,120.,0.])
                    # World-aligned facade mapping; sloped roof uses its own orthonormal plane.
                    if mat==0:
                        u=np.cross([0,1,0],face);u/=max(np.linalg.norm(u),1e-9)
                        if np.linalg.norm(u)<.1:u=np.array([1.,0,0])
                        v=np.cross(face,u);uv=np.stack((p@u,p@v),axis=1)/1600
                    else:
                        horizontal=p[:,0] if abs(face[2])>=abs(face[0]) else p[:,2]
                        uv=np.stack((horizontal,p[:,1]),axis=1)/(1600 if mat in (1,2) else 1200)
                    group=groups.setdefault(mat,[[],[],[]]);group[0].extend(p.tolist());group[1].extend(n.tolist());group[2].extend(uv.tolist())
        primitives=[]
        for mat,(p,n,uv) in groups.items():
            primitives.append({'attributes':{'POSITION':accessor(p,'VEC3'),'NORMAL':accessor(n,'VEC3'),'TEXCOORD_0':accessor(uv,'VEC2')},'material':mat})
        j['meshes'].append({'name':mesh.get('name',f'Fairy_Part_{mi:02}'),'primitives':primitives})
        if roof_triangles:roof_parts.append((mi,roof_triangles));roof_baseline[mi]=baseline_triangles
    if detailed:
        # Add thickness and projecting eaves around existing roof surfaces.
        # The original 31 meshes, wall reference planes and columns stay untouched.
        thickness=120.0; projection=180.0
        # Find true perimeter edges first, then share mitered endpoints across roof
        # pieces. Per-edge offset strips previously left square notches at corners.
        boundaries=[]
        all_roofs=[t for _,ts in roof_parts for t in ts]
        def contains(tri,point,tolerance=5):
            xz=tri[:,[0,2]];matrix=np.column_stack((xz[1]-xz[0],xz[2]-xz[0]))
            if abs(np.linalg.det(matrix))<1e-6:return False
            weights=np.linalg.solve(matrix,point[[0,2]]-xz[0])
            if min(weights)<-1e-5 or weights.sum()>1+1e-5:return False
            height=tri[0,1]+weights[0]*(tri[1,1]-tri[0,1])+weights[1]*(tri[2,1]-tri[0,1])
            return abs(height-point[1])<tolerance
        for mi,triangles in roof_parts:
            edges={}
            for tri in triangles:
                n=np.cross(tri[1]-tri[0],tri[2]-tri[0]);n/=np.linalg.norm(n)
                for k in range(3):
                    p=tri[k];q=tri[(k+1)%3]
                    key=tuple(sorted((tuple(np.round(p,2)),tuple(np.round(q,2)))))
                    if key in edges:edges[key][0]+=1
                    else:edges[key]=[1,p,q,n]
            peak=max(float(t[:,1].max()) for t in triangles)
            for count,p,q,n in edges.values():
                if count!=1 or np.linalg.norm(q-p)<25:continue
                if abs(p[1]-q[1])<20 and min(p[1],q[1])>peak-100:continue
                direction=np.cross(q-p,n);direction[1]=0
                size=np.linalg.norm(direction)
                if size<1e-6:continue
                direction/=size
                probe=(p+q)/2+direction*20
                probe[1]=(p[1]+q[1])/2-(n[0]*direction[0]+n[2]*direction[2])*20/n[1]
                if any(contains(t,probe) for t in all_roofs):continue
                # Re-entrant roof valleys abut another roof; they are not exposed fascia.
                if any(contains(t,(p+q)/2) and abs(np.dot(n,np.cross(t[1]-t[0],t[2]-t[0])/np.linalg.norm(np.cross(t[1]-t[0],t[2]-t[0]))))<.999 for t in all_roofs):continue
                boundaries.append((mi,p,q,n,direction))
        corners=[]
        def corner(point):
            for c in corners:
                if np.linalg.norm(c['point']-point)<25:return c
            c={'point':point.copy(),'directions':[]};corners.append(c);return c
        for mi,p,q,n,direction in boundaries:
            corner(p)['directions'].append(direction[[0,2]])
            corner(q)['directions'].append(direction[[0,2]])
        def endpoint(point,n):
            directions=np.array(corner(point)['directions'])
            offset=np.linalg.lstsq(directions,np.full(len(directions),projection),rcond=None)[0]
            if np.linalg.norm(offset)>projection*3:offset=directions[0]*projection
            delta=np.array([offset[0],0.,offset[1]])
            delta[1]=-(n[0]*delta[0]+n[2]*delta[2])/n[1]
            return point+delta+np.array([0.,thickness,0.])
        for mi,triangles in roof_parts:
            additions={0:[[],[],[]],3:[[],[],[]]}
            def triangle(a,b,c,material):
                p=np.array([a,b,c]);normal=np.cross(p[1]-p[0],p[2]-p[0]);length=np.linalg.norm(normal)
                if length<1e-5:return
                normal/=length
                group=additions[material];group[0].extend(p.tolist());group[1].extend([normal.tolist()]*3)
                if material==0:
                    u=np.cross([0,1,0],normal);u/=max(np.linalg.norm(u),1e-9)
                    v=np.cross(normal,u);uv=np.stack((p@u,p@v),axis=1)
                else:
                    horizontal=p[:,0] if abs(normal[2])>=abs(normal[0]) else p[:,2]
                    uv=np.stack((horizontal,p[:,1]),axis=1)
                group[2].extend(uv.tolist())
            def quad(a,b,c,d,material):
                triangle(a,b,c,material);triangle(a,c,d,material)
            down=np.array([0.,-thickness,0.]);up=-down
            for tri in triangles:triangle(tri[2],tri[1],tri[0],3)
            for owner,p,q,n,direction in boundaries:
                if owner!=mi:continue
                a=endpoint(p,n);b=endpoint(q,n)
                quad(p+up,q+up,b,a,0)
                quad(a,b,b+down,a+down,3)
                quad(q,p,a+down,b+down,3)
            primitives=[]
            for mat,(p,n,uv) in additions.items():
                if not p:continue
                uv=np.array(uv)/1600
                primitives.append({'attributes':{'POSITION':accessor(p,'VEC3'),'NORMAL':accessor(n,'VEC3'),'TEXCOORD_0':accessor(uv,'VEC2')},'material':mat})
            index=len(j['meshes']);j['meshes'].append({'name':f'House_Roof_Thickness_Eaves_{mi:02}','primitives':primitives})
            j['nodes'].append({'name':f'House_Roof_Thickness_Eaves_{mi:02}','mesh':index})
            j['scenes'][j.get('scene',0)]['nodes'].append(len(j['nodes'])-1)
    # The source has a left porch roof closure (mesh 10) but no matching right
    # closure above the recessed rear wall. Close that exposed triangular gap.
    closure=np.array([[-3828.,2743.2,-17577.],[-3828.,2743.2,-14802.],
                      [-3828.,2743.2+(17577-14802)*(3805.8594-2743.2)/4016,-14802.]])
    normal=np.cross(closure[1]-closure[0],closure[2]-closure[0]);normal/=np.linalg.norm(normal)
    mesh_index=len(j['meshes'])
    j['meshes'].append({'name':'House_Rear_Porch_Right_Closure','primitives':[{
        'attributes':{'POSITION':accessor(closure,'VEC3'),
                      'NORMAL':accessor([normal]*3,'VEC3'),
                      'TEXCOORD_0':accessor(closure[:,[2,1]]/1600,'VEC2')},'material':3}]})
    j['nodes'].append({'name':'House_Rear_Porch_Right_Closure','mesh':mesh_index})
    j['scenes'][j.get('scene',0)]['nodes'].append(len(j['nodes'])-1)
    if openings:
        for o in OPENINGS:
            groups={}
            c=o['center'];u=o['u'];v=o['v'];out=o['outward'];w=o['width'];h=o['height']
            def point(x,y,depth=0):return c+u*x+v*y+out*depth
            def face(points,mat):
                group=groups.setdefault(mat,[[],[],[]])
                for ids in [(0,1,2),(0,2,3)]:
                    p=np.array([points[k] for k in ids]);n=np.cross(p[1]-p[0],p[2]-p[0]);n/=max(np.linalg.norm(n),1e-9)
                    group[0].extend(p.tolist());group[1].extend([n.tolist()]*3);group[2].extend([[0,0],[1,0],[1,1]])
            def panel(x0,y0,x1,y1,depth,mat):face([point(x0,y0,depth),point(x1,y0,depth),point(x1,y1,depth),point(x0,y1,depth)],mat)
            # Four reveal surfaces make the opening visibly recessed.
            corners=[(-w/2,-h/2),(w/2,-h/2),(w/2,h/2),(-w/2,h/2)]
            for k,(x,y) in enumerate(corners):
                a,b=corners[(k+1)%4];face([point(x,y),point(a,b),point(a,b,-170),point(x,y,-170)],8)
            kind=o['kind'];panel(-w/2,-h/2,w/2,h/2,-165,3 if kind=='garage' else (9 if kind=='door' else 7))
            # Perimeter trim stands proud of the wall; mullions sit forward of the glass.
            t=75 if kind!='skylight' else 45
            trim=10 if kind=='skylight' else 3
            panel(-w/2-t,-h/2-t,-w/2,h/2+t,25,trim);panel(w/2,-h/2-t,w/2+t,h/2+t,25,trim)
            panel(-w/2,-h/2-t,w/2,-h/2,25,trim);panel(-w/2,h/2,w/2,h/2+t,25,trim)
            if kind=='vent':
                for y in np.arange(-h/2,h/2,45):panel(-w/2,y,w/2,y+20,-120,3)
            elif kind=='garage':
                for row in range(1,5):
                    y=-h/2+h*row/5;panel(-w/2,y-10,w/2,y+10,-145,8)
                for col in range(1,5):
                    x=-w/2+w*col/5;panel(x-8,-h/2,x+8,h/2,-144,8)
                for col in range(5):
                    x=-w/2+w*(col+.5)/5;panel(x-330,h/2-440,x+330,h/2-100,-140,7)
            else:
                cols=3 if 'Dormer' in o['name'] else (2 if kind!='skylight' else 1)
                for col in range(1,cols):
                    x=-w/2+w*col/cols;panel(x-25,-h/2,x+25,h/2,-125,3)
                if kind!='skylight':
                    panel(-w/2,0,w/2,35,-125,3)
                    if kind=='door':panel(-w/2+100,50,w/2-100,h/2-100,-140,7)
                if o['name'] in ('Front_Gable_Window','Front_Porch_Window'):
                    for side in [-1,1]:
                        x=side*(w/2+250);panel(x-150,-h/2,x+150,h/2,35,9)
            primitives=[]
            for mat,(p,n,uv) in groups.items():primitives.append({'attributes':{'POSITION':accessor(p,'VEC3'),'NORMAL':accessor(n,'VEC3'),'TEXCOORD_0':accessor(uv,'VEC2')},'material':mat})
            index=len(j['meshes']);j['meshes'].append({'name':'Opening_'+o['name'],'primitives':primitives});j['nodes'].append({'name':'Opening_'+o['name'],'mesh':index});j['scenes'][j.get('scene',0)]['nodes'].append(len(j['nodes'])-1)
    while len(binary)%4:binary.append(0)
    j['buffers']=[{'byteLength':len(binary)}];j['asset']['generator']='Fairy aligned material variant';j['asset']['extras']={'whiteModelSHA256':hashlib.sha256(raw).hexdigest(),'source':'House_Fairy_source.3dm via calibrated export','openings':openings}
    data=json.dumps(j,separators=(',',':')).encode();data+=b' '*(-len(data)%4)
    result=struct.pack('<III',0x46546c67,2,28+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(binary),0x004e4942)+binary
    dest=HOUSE/('render' if openings else 'color-block')/'model.glb';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(result);print(dest,len(result))

if __name__=='__main__':
    build(True);build(True, openings=True)

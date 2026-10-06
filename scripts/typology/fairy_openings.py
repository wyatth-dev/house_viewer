"""Reference-image opening study in the unchanged calibrated house coordinates (mm)."""
import numpy as np

def opening(name,mesh,center,width,height,outward,kind='window',u=(1,0,0),v=(0,1,0)):
    return dict(name=name,mesh=mesh,center=np.array(center,dtype=float),width=width,height=height,
                outward=np.array(outward,dtype=float),u=np.array(u,dtype=float),v=np.array(v,dtype=float),kind=kind)

OPENINGS=[
 opening('Front_Garage',26,(-3508,1220,0),4900,2440,(0,0,1),'garage'),
 opening('Front_Gable_Vent',26,(-3508,5250,0),900,300,(0,0,1),'vent'),
 opening('Front_Small_Gable_Vent',15,(-12000,4150,-2301),650,250,(0,0,1),'vent'),
 opening('Front_Gable_Window',26,(-3508,4100,0),1000,1350,(0,0,1)),
 opening('Front_Porch_Window',31,(-12000,1500,-2301),1450,1600,(0,0,1)),
 opening('Front_Entry',28,(-8650,1120,-5088),1000,2240,(0,0,1),'door'),
 opening('Front_Dormer',4,(-8931,4000,-5095.1),2050,750,(0,0,1)),
 opening('Rear_Dormer',3,(-6858,4110,-14794),2250,900,(0,0,-1)),
 opening('Rear_Right_Window',18,(-1914,1500,-17577),1700,1600,(0,0,-1)),
 opening('Rear_Left_Window',6,(-11803,1500,-14802),1450,1600,(0,0,-1)),
 opening('Rear_Patio_Doors',5,(-7350,1150,-14802),1750,2300,(0,0,-1),'patio'),
 opening('Rear_Patio_Window',5,(-5000,1500,-14802),1500,1600,(0,0,-1)),
 opening('Right_Lower_Window',11,(0,1500,-15700),1500,1600,(1,0,0),u=(0,0,1)),
 opening('Right_Upper_Window',11,(0,4700,-9945),1000,1400,(1,0,0),u=(0,0,1)),
 opening('Left_Window',14,(-13716,1500,-12000),1500,1600,(-1,0,0),u=(0,0,1)),
]
def split(poly,axis,value):
    parts=[]
    for above in [False,True]:
        result=[]
        for k,(p,n) in enumerate(poly):
            q,m=poly[(k+1)%len(poly)];a=p@axis-value;b=q@axis-value
            inside=a>=-1e-7 if above else a<=1e-7
            other=b>=-1e-7 if above else b<=1e-7
            if inside:result.append((p,n))
            if inside!=other and abs(a-b)>1e-9:
                t=a/(a-b);result.append((p+(q-p)*t,n+(m-n)*t))
        if len(result)>=3:parts.append(result)
    return parts

def cut_triangle(points,normals,mesh):
    polygons=[list(zip(points,normals))]
    for o in OPENINGS:
        if o['mesh']!=mesh:continue
        # Match only the intended facade / slope, never its opposite or adjacent surface.
        if np.max(np.abs((points-o['center'])@o['outward']))>3:continue
        center=o['center'];u=o['u'];v=o['v'];w=o['width']/2;h=o['height']/2
        if np.max((points-center)@u)<-w or np.min((points-center)@u)>w or np.max((points-center)@v)<-h or np.min((points-center)@v)>h:continue
        for axis,extent in [(u,w),(v,h)]:
            for value in [center@axis-extent,center@axis+extent]:
                polygons=[part for poly in polygons for part in split(poly,axis,value)]
        polygons=[poly for poly in polygons if not (abs((np.mean([p for p,n in poly],axis=0)-center)@u)<w-1e-5 and abs((np.mean([p for p,n in poly],axis=0)-center)@v)<h-1e-5)]
    for poly in polygons:
        for k in range(1,len(poly)-1):
            t=[poly[0],poly[k],poly[k+1]];p=np.array([a for a,b in t]);n=np.array([b for a,b in t])
            if np.linalg.norm(np.cross(p[1]-p[0],p[2]-p[0]))>1e-5:yield p,n

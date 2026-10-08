"""Shared architectural baseline for the Redrow Sunningdale typology (mm).

Single source of truth for every Sunningdale representation. Dimensions are rounded
interpretations of the Redrow G-Series floor plan (09.02.2023) scaled against the room
schedule (garage 5.64 x 4.97 m, lounge 5.12 x 3.56 m). Storey heights, roof pitches,
eave/ridge levels and opening sizes are estimates; no elevation drawing was available.

Plan coordinates: px = 0..11300 from the left facade (viewed from the street), d = depth
from the rear wall (0) to the garage front (10400). Web coordinates follow the typology
contract: +Y up, +Z front, envelope X -11300..0, Z -10400..0.
"""
import numpy as np

WIDTH = 11300.0
DEPTH = 10400.0
GF = 2700.0          # ground storey / single-storey eave
EAVE = 5200.0        # two-storey eave
PLINTH = 520.0       # stone plinth band (material only)
K = 0.85             # main + front gable pitch, ~40.4 deg
RIDGE = EAVE + 3400 * K          # 8090
WING_RIDGE = EAVE + 2000 * K     # 6900
KG = 1900 / 2750                  # garage hipped roof pitch, ~34.6 deg
GARAGE_RIDGE = GF + 2750 * KG     # 4600
ROOF_THICKNESS = 120.0
OVERHANG = 180.0


def web(px, d, y):
    return np.array([px - WIDTH, y, d - DEPTH], dtype=float)


# ---- Walls: (name, outward(web), [(px, d, y), ...]) -------------------------------------
WALLS = [
    ('Back', (0, 0, -1), [(0, 0, 0), (WIDTH, 0, 0), (WIDTH, 0, EAVE), (0, 0, EAVE)]),
    ('Left', (-1, 0, 0), [(0, 0, 0), (0, 9900, 0), (0, 9900, EAVE), (0, 6800, EAVE), (0, 3400, RIDGE), (0, 0, EAVE)]),
    ('right', (1, 0, 0), [(WIDTH, 0, 0), (WIDTH, 10400, 0), (WIDTH, 10400, GF), (WIDTH, 6800, GF), (WIDTH, 6800, EAVE),
                          (WIDTH, 3400, RIDGE), (WIDTH, 0, EAVE)]),
    ('Front', (0, 0, 1), [(5800, 10400, 0), (WIDTH, 10400, 0), (WIDTH, 10400, GF), (5800, 10400, GF)]),
    ('Front_Wing', (0, 0, 1), [(0, 9900, 0), (4000, 9900, 0), (4000, 9900, EAVE), (2000, 9900, WING_RIDGE), (0, 9900, EAVE)]),
    ('Front_Wing_Porch_Return', (1, 0, 0), [(4000, 9900, 0), (4000, 8100, 0), (4000, 8100, GF), (4000, 6800, GF),
                                            (4000, 6800, EAVE), (4000, 9900, EAVE)]),
    ('Front_Entry', (0, 0, 1), [(4000, 8100, 0), (5800, 8100, 0), (5800, 8100, GF), (4000, 8100, GF)]),
    ('Garage_Porch_Return', (-1, 0, 0), [(5800, 8100, 0), (5800, 10400, 0), (5800, 10400, GF), (5800, 8100, GF)]),
    ('Front_Upper', (0, 0, 1), [(4000, 6800, GF), (5800, 6800, GF), (8550, 6800, GARAGE_RIDGE), (WIDTH, 6800, GF),
                                (WIDTH, 6800, EAVE), (4000, 6800, EAVE)]),
]
FLOORS = [('Front_Porch_Deck', [(4000, 8100, 15), (5800, 8100, 15), (5800, 9900, 15), (4000, 9900, 15)])]


# ---- Roofs ---------------------------------------------------------------------------------
# Each roof plane: height function, White polygon (no overhang), overhang polygon and the
# overhang-polygon edges that are exposed (fascia/verge). Ridges, hips, valleys and edges
# abutting walls or the entry canopy are not exposed. Thickness grows upward (SOP section 4).
def _main_back(px, d): return EAVE + d * K
def _main_front(px, d): return EAVE + (6800 - d) * K
def _wing_left(px, d): return EAVE + px * K
def _wing_right(px, d): return EAVE + (4000 - px) * K
def _garage_left(px, d): return GF + (px - 5800) * KG
def _garage_right(px, d): return GF + (WIDTH - px) * KG
def _garage_front(px, d): return GF + (10400 - d) * KG
def _canopy(px, d): return GF


O = OVERHANG
ROOFS = [
    dict(name='Roof_Main_Back', height=_main_back,
         white=[(0, 0), (WIDTH, 0), (WIDTH, 3400), (0, 3400)],
         eaves=[(-O, -O), (WIDTH + O, -O), (WIDTH + O, 3400), (-O, 3400)], exposed=[0, 1, 3]),
    dict(name='Roof_Main_Front', height=_main_front,
         white=[(0, 3400), (WIDTH, 3400), (WIDTH, 6800), (4000, 6800), (2000, 4800), (0, 6800)],
         eaves=[(-O, 3400), (WIDTH + O, 3400), (WIDTH + O, 6800 + O), (4000 + O, 6800 + O), (2000, 4800), (-O, 6800 + O)],
         exposed=[1, 2, 5]),
    dict(name='Roof_Front_Gable_Left', height=_wing_left,
         white=[(0, 6800), (2000, 4800), (2000, 9900), (0, 9900)],
         eaves=[(-O, 6800 + O), (2000, 4800), (2000, 9900 + O), (-O, 9900 + O)], exposed=[2, 3]),
    dict(name='Roof_Front_Gable_Right', height=_wing_right,
         white=[(4000, 6800), (4000, 9900), (2000, 9900), (2000, 4800)],
         eaves=[(4000 + O, 6800 + O), (4000 + O, 9900 + O), (2000, 9900 + O), (2000, 4800)], exposed=[0, 1]),
    dict(name='Roof_Garage_Left', height=_garage_left,
         white=[(5800, 6800), (8550, 6800), (8550, 7650), (5800, 10400)],
         eaves=[(5800, 6800), (8550, 6800), (8550, 7650), (5800, 10400), (5800, 9900)], exposed=[3]),
    dict(name='Roof_Garage_Hip_Front', height=_garage_front,
         white=[(5800, 10400), (8550, 7650), (WIDTH, 10400)],
         eaves=[(5800, 10400), (8550, 7650), (WIDTH + O, 10400 + O), (5800, 10400 + O)], exposed=[2, 3]),
    dict(name='Roof_Garage_Right', height=_garage_right,
         white=[(WIDTH, 6800), (WIDTH, 10400), (8550, 7650), (8550, 6800)],
         eaves=[(WIDTH, 6800), (WIDTH + O, 6800), (WIDTH + O, 10400 + O), (8550, 7650), (8550, 6800)], exposed=[0, 1]),
    dict(name='Roof_Entry_Canopy', height=_canopy, flat=True,
         white=[(4000, 6800), (5800, 6800), (5800, 9900), (4000, 9900)],
         eaves=[(4000, 6800), (5800, 6800), (5800, 9900), (4000, 9900)], exposed=[2]),
]


def roof_polygon(roof, key):
    return [web(px, d, roof['height'](px, d)) for px, d in roof[key]]


# ---- Openings (Detailed render) --------------------------------------------------------
def _opening(name, face, px, d, y, width, height, kind='window'):
    wall = next(w for w in WALLS if w[0] == face)
    outward = np.array(wall[1], dtype=float)
    u = np.array((1., 0, 0)) if abs(outward[2]) > .5 else np.array((0., 0, 1))
    return dict(name=name, face=face, center=web(px, d, y), width=width, height=height,
                outward=outward, u=u, v=np.array((0., 1, 0)), kind=kind)


OPENINGS = [
    _opening('Front_Garage_Door', 'Front', 8550, 10400, 1050, 2400, 2100, 'garage'),
    _opening('Front_Lounge_Window', 'Front_Wing', 2000, 9900, 1500, 1800, 1350),
    _opening('Front_Bedroom1_Window', 'Front_Wing', 2000, 9900, 4100, 1500, 1200),
    _opening('Front_Gable_Vent', 'Front_Wing', 2000, 9900, 6100, 600, 250, 'vent'),
    _opening('Front_Entry_Door', 'Front_Entry', 4900, 8100, 1050, 1000, 2100, 'door'),
    _opening('Front_Landing_Window', 'Front_Upper', 4900, 6800, 4250, 1000, 1000),
    _opening('Rear_Snug_Window', 'Back', 1750, 0, 1500, 1500, 1350),
    _opening('Rear_Utility_Window', 'Back', 4300, 0, 1600, 600, 900),
    _opening('Rear_Patio_Doors', 'Back', 6800, 0, 1050, 1800, 2100, 'patio'),
    _opening('Rear_Kitchen_Window', 'Back', 9600, 0, 1550, 1200, 1050),
    _opening('Rear_Ensuite2_Window', 'Back', 1300, 0, 4300, 600, 900),
    _opening('Rear_Bedroom2_Window', 'Back', 3750, 0, 4100, 1200, 1200),
    _opening('Rear_Bedroom3_Window', 'Back', 6500, 0, 4100, 1200, 1200),
    _opening('Rear_Bedroom4_Window', 'Back', 9500, 0, 4100, 1200, 1200),
    _opening('Left_Cloaks_Window', 'Left', 0, 3800, 1550, 500, 900),
    _opening('Left_Ensuite1_Window', 'Left', 0, 4000, 4300, 500, 900),
    _opening('Right_Bathroom_Window', 'right', WIDTH, 5400, 4300, 600, 900),
]

# Product-installation reference planes (web coordinates; fixed across representations).
INSTALLATION_FACES = [
    dict(wallFaceId='front-garage', side='front', originMm=dict(x=-5500, y=0, z=0), lengthMm=5500,
         alongWallUnit=dict(x=1, z=0), outwardUnit=dict(x=0, z=1)),
    dict(wallFaceId='front-wing', side='front', originMm=dict(x=-11300, y=0, z=-500), lengthMm=4000,
         alongWallUnit=dict(x=1, z=0), outwardUnit=dict(x=0, z=1)),
    dict(wallFaceId='back-main', side='back', originMm=dict(x=-11300, y=0, z=-10400), lengthMm=11300,
         alongWallUnit=dict(x=1, z=0), outwardUnit=dict(x=0, z=-1)),
    dict(wallFaceId='left-main', side='left', originMm=dict(x=-11300, y=0, z=-10400), lengthMm=9900,
         alongWallUnit=dict(x=0, z=1), outwardUnit=dict(x=-1, z=0)),
    dict(wallFaceId='right-main', side='right', originMm=dict(x=0, y=0, z=-10400), lengthMm=10400,
         alongWallUnit=dict(x=0, z=1), outwardUnit=dict(x=1, z=0)),
]


# ---- Polygon helpers -----------------------------------------------------------------------
def triangulate(points, normal):
    """Ear-clip a planar simple polygon; triangles wind counter-clockwise about `normal`."""
    p = [np.asarray(q, dtype=float) for q in points]
    n = np.asarray(normal, dtype=float)
    a = np.array([1., 0, 0]) if abs(n[0]) < .9 else np.array([0., 1, 0])
    u = np.cross(n, a); u /= np.linalg.norm(u); v = np.cross(n, u)
    q = [np.array([x @ u, x @ v]) for x in p]
    area = sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q)))
    idx = list(range(len(p)))
    if area < 0: idx.reverse()
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    out = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            if cross(q[i0], q[i1], q[i2]) <= 1e-9: continue
            if any(cross(q[i0], q[i1], q[j]) >= -1e-9 and cross(q[i1], q[i2], q[j]) >= -1e-9 and cross(q[i2], q[i0], q[j]) >= -1e-9
                   for j in idx if j not in (i0, i1, i2) and not any(np.allclose(q[j], q[t]) for t in (i0, i1, i2))):
                continue
            out.append((p[i0], p[i1], p[i2])); idx.pop(k); break
        else:
            raise ValueError('Triangulation failed')
    out.append(tuple(p[i] for i in idx))
    return [np.array(t) for t in out]


def polygon_normal(points):
    p = np.asarray(points, dtype=float); n = np.zeros(3)
    for i in range(len(p)): n += np.cross(p[i], p[(i + 1) % len(p)])
    return n / np.linalg.norm(n)

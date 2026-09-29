"""Build src/data/campus.json for the Yonsei site from OpenStreetMap
(© OpenStreetMap contributors, ODbL; scripts/osm.json via fetch_osm.py).

Metres around the campus centre: x east, z south. Campus buildings are every
building inside OSM's 연세대학교 신촌캠퍼스 boundary (scripts/campus_boundary.json,
relation 18619603), named from OSM, or from a named institution point inside
the footprint; everything else nearby is background. The flight route follows the real
백양로 from the main gate north to Underwood Hall.
"""
import json, math, os, re

HERE = os.path.dirname(__file__)
M_LAT = 110540
els = json.load(open(os.path.join(HERE, 'osm.json')))['elements']


def node(name):
    return next((e['lat'], e['lon']) for e in els if e['type'] == 'node' and e.get('tags', {}).get('name') == name)


def way(name):
    return next(e for e in els if e['type'] == 'way' and e.get('tags', {}).get('name') == name and 'geometry' in e)


GATE = node('연세대 정문')
UNDERWOOD = way('언더우드관 (501)')
uw_c = (sum(p['lat'] for p in UNDERWOOD['geometry']) / len(UNDERWOOD['geometry']),
        sum(p['lon'] for p in UNDERWOOD['geometry']) / len(UNDERWOOD['geometry']))
lat0 = (GATE[0] + uw_c[0]) / 2
lon0 = (GATE[1] + uw_c[1]) / 2
M_LON = M_LAT * math.cos(math.radians(lat0))
to_xz = lambda lat, lon: [round((lon - lon0) * M_LON, 1), round(-(lat - lat0) * M_LAT, 1)]
dist = lambda a, b: math.hypot((a[0] - b[0]) * M_LAT, (a[1] - b[1]) * M_LON)

# Campus boundary: outer rings minus inner rings (ways joined end to end).
def rings(role):
    parts = [[(p['lat'], p['lon']) for p in m['geometry']] for m in json.load(open(os.path.join(HERE, 'campus_boundary.json')))['members'] if m['role'] == role]
    out = []
    while parts:
        ring = parts.pop(0)
        while ring[0] != ring[-1]:
            nxt = next((q for q in parts if q[0] == ring[-1] or q[-1] == ring[-1]), None)
            if nxt is None:
                break
            parts.remove(nxt)
            ring += (nxt if nxt[0] == ring[-1] else nxt[::-1])[1:]
        out.append(ring)
    return out


def inside(pt, ring):
    y, x = pt
    c = False
    for (y1, x1), (y2, x2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


OUTER, INNER = rings('outer'), rings('inner')
on_campus = lambda pt: any(inside(pt, r) for r in OUTER) and not any(inside(pt, r) for r in INNER)
# Named institution points (a hall, institute, school…) used to name footprints.
INST = re.compile(r'(관|원|당|센터|병원|학교|대학|대학원|연구소|연구동|기념관|홀|채플|극장|본부|학사|하우스)(\s*\(\d+\))?$')
points = [((e['lat'], e['lon']), e['tags']['name']) for e in els
          if e['type'] == 'node' and 'name' in e.get('tags', {}) and INST.search(e['tags']['name'])
          and not re.search(r'\d층|자습실|룸|카페|편의점|식당', e['tags']['name'])]

YONSEI_NAME = re.compile(r'세브란스|연세대학교|의과대학|치과대학|간호대학|에비슨|연세암병원|심장혈관병원|재활병원|안과병원|어린이병원|연세삼성|\(\d{3}\)')
# Structures that are real footprints but not buildings worth a name tag.
NOT_A_HALL = re.compile(r'계단|그네|연결|통로|다리|휴식장|창고|온실|정자|식당|돔|지하|아케이|차량실|영선실|사택|공관')

buildings = []
for e in els:
    t = e.get('tags', {})
    if 'building' not in t or e['type'] != 'way' or 'geometry' not in e:
        continue
    ring = [(p['lat'], p['lon']) for p in e['geometry']]
    c = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    name = t.get('name', '')
    # Plus the Severance medical campus next door, which OSM draws outside
    # the boundary but is Yonsei's own.
    campus = on_campus(c) or bool(YONSEI_NAME.search(name))
    if dist(c, (lat0, lon0)) > (1400 if campus else 750):
        continue
    if campus and not name:
        name = min((n for pt, n in points if inside(pt, ring)), key=len, default='')
    try:
        levels = float(t.get('building:levels', 0))
    except ValueError:
        levels = 0
    h = levels * 4 if levels else (18 if campus else 12)
    b = {'p': [to_xz(*p) for p in ring], 'h': round(h, 1), 'c': 1 if campus else 0}
    if campus and levels:
        b['lv'] = int(levels)
    if campus and name and not NOT_A_HALL.search(name):
        b['n'] = re.sub(r'\s*\(\d+\)', '', name)
        code = re.search(r'\((\d+)\)', name)
        if code:
            b['code'] = code.group(1)
    buildings.append(b)

# 백양로: chain the ways named 백양로 into one line from the gate northward.
parts = [[(p['lat'], p['lon']) for p in e['geometry']] for e in els
         if e['type'] == 'way' and e.get('tags', {}).get('name') == '백양로' and 'geometry' in e]
line = min(parts, key=lambda q: min(dist(q[0], GATE), dist(q[-1], GATE)))
parts.remove(line)
if dist(line[-1], GATE) < dist(line[0], GATE):
    line = line[::-1]
while parts:
    nxt = min(parts, key=lambda q: min(dist(line[-1], q[0]), dist(line[-1], q[-1])))
    if min(dist(line[-1], nxt[0]), dist(line[-1], nxt[-1])) > 40:
        break
    parts.remove(nxt)
    line += nxt if dist(line[-1], nxt[0]) <= dist(line[-1], nxt[-1]) else nxt[::-1]
# Finish in front of Underwood Hall.
line = [GATE] + line + [uw_c]
route = [to_xz(*p) for p in line]
print('백양로 points', len(route), 'length m', round(sum(dist(a, b) for a, b in zip(line, line[1:]))))

landmarks = {}
for key, name in [('gate', '연세대 정문'), ('eagle', '연세대학교 독수리상'), ('underwoodStatue', '언더우드 동상')]:
    try:
        landmarks[key] = to_xz(*node(name))
    except StopIteration:
        pass
for key, name in [('underwood', '언더우드관 (501)'), ('library', '중앙도서관 (301)'), ('union', '학생회관 (207)'),
                  ('baekyang', '백양관 (310)'), ('amphitheater', '노천극장')]:
    w = way(name)
    landmarks[key] = to_xz(sum(p['lat'] for p in w['geometry']) / len(w['geometry']), sum(p['lon'] for p in w['geometry']) / len(w['geometry']))
    landmarks[key + 'Ring'] = [to_xz(p['lat'], p['lon']) for p in w['geometry']]

paths = []
for e in els:
    t = e.get('tags', {})
    if t.get('highway') and 'geometry' in e:
        pts = [to_xz(p['lat'], p['lon']) for p in e['geometry']]
        if any(abs(x) < 750 and abs(z) < 750 for x, z in pts):
            paths.append(pts)

out = {'origin': [round(lat0, 6), round(lon0, 6)], 'buildings': buildings, 'route': route, 'paths': paths, 'landmarks': landmarks}
os.makedirs(os.path.join(HERE, '..', 'src', 'data'), exist_ok=True)
json.dump(out, open(os.path.join(HERE, '..', 'src', 'data', 'campus.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('buildings', len(buildings), 'campus', sum(b['c'] for b in buildings), 'named', sum(1 for b in buildings if 'n' in b))
print('landmarks', {k: v for k, v in landmarks.items() if not k.endswith('Ring')})

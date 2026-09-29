"""Build src/data/campus.json for the Yonsei site from OpenStreetMap
(© OpenStreetMap contributors, ODbL; scripts/osm.json via fetch_osm.py).

Metres around the campus centre: x east, z south. Campus buildings are the
ones OSM tags as university buildings (most carry Yonsei's building numbers);
everything else nearby is background. The flight route follows the real
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

buildings = []
for e in els:
    t = e.get('tags', {})
    if 'building' not in t or e['type'] != 'way' or 'geometry' not in e:
        continue
    ring = [(p['lat'], p['lon']) for p in e['geometry']]
    c = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring))
    if dist(c, (lat0, lon0)) > 750:
        continue
    name = t.get('name', '')
    campus = t.get('building') == 'university' or bool(re.search(r'\(\d{3}\)', name)) or name in ('노천극장',)
    try:
        levels = float(t.get('building:levels', 0))
    except ValueError:
        levels = 0
    h = levels * 4 if levels else (18 if campus else 12)
    b = {'p': [to_xz(*p) for p in ring], 'h': round(h, 1), 'c': 1 if campus else 0}
    if campus and name:
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

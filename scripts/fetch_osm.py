import json, sys, time, urllib.parse, urllib.request
B = '37.5585,126.9300,37.5760,126.9475'  # the whole Sinchon campus boundary + surroundings
q = f'''[out:json][timeout:120];
(way["building"]({B}); relation["building"]({B});
 way["highway"]({B});
 way["amenity"="university"]({B}); relation["amenity"="university"]({B});
 node["name"]({B}););
out geom tags;'''
for i in range(8):
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request('https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q), headers={'User-Agent': 'yonsei-flight/1.0'}), timeout=180).read())
        break
    except Exception as e:
        print('retry', e, file=sys.stderr); time.sleep(10)
json.dump(d, open('osm.json', 'w'), ensure_ascii=False)
els = d['elements']
print('elements', len(els))
for e in els:
    t = e.get('tags', {}); n = t.get('name', '')
    if ('building' in t and n) or t.get('amenity') == 'university' or any(k in n for k in ['정문', '백양', '언더우드', '노천', '독수리']):
        print(e['type'], n, t.get('building'), t.get('building:levels'), t.get('highway'))

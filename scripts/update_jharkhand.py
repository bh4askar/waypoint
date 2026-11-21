import io,json,pathlib,urllib.request,zipfile
BASE=pathlib.Path(__file__).resolve().parents[1]
rows=json.loads((BASE/'lib'/'catalogue.json').read_text(encoding='utf8'))
archive=zipfile.ZipFile(io.BytesIO(urllib.request.urlopen('https://download.geonames.org/export/dump/cities5000.zip',timeout=45).read()))
for wanted,lat,lng in [('Koderma',24.47,85.59),('Ramgarh',23.63,85.52)]:
    candidates=[]
    for line in archive.read('cities5000.txt').decode('utf8').splitlines():
        v=line.split('\t')
        if v[8]!='IN':continue
        names=(v[1]+' '+v[2]+' '+v[3]).lower()
        if (wanted.lower() in names or wanted=='Koderma' and 'kodarma' in names) and abs(float(v[4])-lat)<0.4 and abs(float(v[5])-lng)<0.4:candidates.append(v)
    assert candidates,wanted
    v=min(candidates,key=lambda v:abs(float(v[4])-lat)+abs(float(v[5])-lng))
    if not any(r['id']==v[0] for r in rows):
        remove=next(r for r in reversed(rows) if r['countryCode']=='IN' and r['region']!='Jharkhand')
        rows.remove(remove)
        rows.insert(0,{'id':v[0],'name':wanted,'aliases':list(set(v[3].split(',')+[v[1],v[2],wanted]))[:30],'lat':float(v[4]),'lng':float(v[5]),'countryCode':'IN','country':'India','region':'Jharkhand','source':'https://www.geonames.org/'+v[0],'guideUrl':'https://'+wanted.lower()+'.nic.in/tourism/'})
    print(wanted,v[0],v[4],v[5],flush=True)
assert len(rows)==600 and sum(r['countryCode']=='IN' for r in rows)==520
(BASE/'lib'/'catalogue.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf8')

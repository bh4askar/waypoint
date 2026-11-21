import concurrent.futures,html,io,json,math,pathlib,re,time,urllib.parse,urllib.request
from PIL import Image,ImageOps
BASE=pathlib.Path(__file__).resolve().parents[1]
OUT=BASE/'public'/'assets'/'destinations';OUT.mkdir(exist_ok=True)
rows=json.loads((BASE/'lib/catalogue.json').read_text(encoding='utf8'))
credits={}
def query(params,host='en.wikipedia.org'):
    req=urllib.request.Request('https://'+host+'/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json',**params}),headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (single travel catalogue snapshot; attribution retained)'})
    with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)
def km(a,b,c,d):
    r=math.pi/180;x=math.sin((c-a)*r/2)**2+math.cos(a*r)*math.cos(c*r)*math.sin((d-b)*r/2)**2
    return 6371*2*math.asin(math.sqrt(min(1,x)))
aliases={'Cinque Terre':'Cinque Terre','Bengaluru':'Bangalore','Mysuru':'Mysore','Koderma':'Kodarma','Ramgarh':'Ramgarh Cantonment','Alleppey':'Alappuzha','Ooty':'Ooty','Puducherry':'Pondicherry'}
def batch(group):
    titles=[aliases.get(d['name'],d['name']) for d in group]
    try:
        data=query({'titles':'|'.join(titles),'prop':'pageimages|coordinates','piprop':'thumbnail|name','pithumbsize':900,'pilicense':'free','redirects':1})
        q=data.get('query',{});norm={x['from']:x['to'] for x in q.get('normalized',[])};norm.update({x['from']:x['to'] for x in q.get('redirects',[])})
        pages={p['title']:p for p in q.get('pages',{}).values()};candidates=[]
        for d,title in zip(group,titles):
            p=pages.get(norm.get(title,title));
            if not p or not p.get('thumbnail') or not p.get('pageimage'):continue
            if re.search(r'\.svg$|map|logo|flag|locator|coat.of.arms|emblem|seal',p['pageimage'],re.I):continue
            coord=p.get('coordinates',[{}])[0]
            if coord and 'lat' in coord and km(d['lat'],d['lng'],coord['lat'],coord['lon'])>100:continue
            candidates.append((d,p))
        names=list(set('File:'+p['pageimage'] for _,p in candidates));meta={}
        if names:
            data=query({'titles':'|'.join(names),'prop':'imageinfo','iiprop':'extmetadata'},'commons.wikimedia.org')
            meta={p['title'].removeprefix('File:').replace('_',' '):p.get('imageinfo',[{}])[0].get('extmetadata',{}) for p in data.get('query',{}).get('pages',{}).values()}
        result={}
        for d,p in candidates:
            ext=meta.get(p['pageimage'].replace('_',' '),{});clean=lambda key:html.unescape(re.sub('<[^>]+>','',ext.get(key,{}).get('value',''))).strip()
            if not clean('LicenseShortName') or re.search(r'logo|flag|map of',clean('ImageDescription'),re.I):continue
            try:
                url=p['thumbnail']['source'];req=urllib.request.Request(url,headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (educational catalogue)'})
                with urllib.request.urlopen(req,timeout=15) as r:b=r.read()
                im=ImageOps.exif_transpose(Image.open(io.BytesIO(b))).convert('RGB');im.thumbnail((900,700));file=OUT/(d['id']+'.jpg');im.save(file,'JPEG',quality=84,optimize=True)
                result[d['id']]={'image':'/assets/destinations/'+d['id']+'.jpg','subject':p['title'],'artist':clean('Artist')[:200],'source':'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(p['pageimage']),'license':clean('LicenseShortName'),'licenseUrl':clean('LicenseUrl')}
            except Exception:pass
        time.sleep(0.5)
        print('photo catalogue batch',group[0]['name'],len(result),'of',len(group),flush=True)
        return result
    except Exception as exc:
        print('photo batch unavailable',type(exc).__name__,flush=True);time.sleep(2);return {}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    for result in executor.map(batch,[rows[i:i+20] for i in range(0,len(rows),20)]):
        credits.update(result)
        (BASE/'lib/destination-photos.json').write_text(json.dumps(credits,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(BASE/'public/assets/destination-photo-credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2),encoding='utf8')
print('DONE',len(credits),'destination photographs across India and the world',flush=True)

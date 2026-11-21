"""Resumable, source-attributed photo audit. No city-photo fallback for landmarks.
Run node scripts/photo-targets.mjs, then this script. Python + Pillow required.
All network response caches live in ignored data/photo-audit/. Output is public assets + credits.
"""
from pathlib import Path
import ast, concurrent.futures as futures, hashlib, html, io, json, math, re, time, unicodedata
import urllib.request, urllib.parse, argparse, threading
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'data'/'photo-audit'; CACHE.mkdir(parents=True,exist_ok=True)
USER_AGENT='Waypoint/1.0 (https://github.com/bh4askar/waypoint; educational photo audit; source attribution retained)'
LOCK=threading.Lock()
NEXT_REQUEST={}
parser=argparse.ArgumentParser();parser.add_argument('--search-missing',action='store_true');args=parser.parse_args()
targets=json.loads((ROOT/'data/photo-targets.json').read_text(encoding='utf8'))
rows=targets['destinations']+targets['landmarks']
bad=re.compile(r'\.svg$|\.pdf$|logo|locator|location.map|district.map|coat.of.arms|emblem|seal\b|flag\b|map.of|(?:^|[ _-])map(?:[ _.-]|$)|portrait|signature|icon\b|symbol',re.I)
def normal(s):
    text=''.join(c for c in unicodedata.normalize('NFKD',str(s).lower().replace('_',' ')) if not unicodedata.combining(c))
    return re.sub(r'[^\w]+',' ',text).strip()
def clean(s):return html.unescape(re.sub('<[^>]*>','',str(s))).strip()
def km(a,b,c,d):
    if any(v is None for v in [a,b,c,d]):return None
    r=math.pi/180;x=math.sin((c-a)*r/2)**2+math.cos(a*r)*math.cos(c*r)*math.sin((d-b)*r/2)**2
    return 6371*2*math.asin(math.sqrt(min(1,x)))
def request(url,expect_json=True):
    file=CACHE/(hashlib.sha256(url.encode()).hexdigest()+('.json' if expect_json else '.bin'))
    if file.exists():return json.loads(file.read_text(encoding='utf8')) if expect_json else file.read_bytes()
    for attempt in range(3):
        try:
            host=urllib.parse.urlparse(url).hostname
            bucket='media' if host in ['thumb.wikimedia.org','upload.wikimedia.org'] else 'metadata'
            interval=.7 if bucket=='media' else 1.2
            with LOCK:
                when=max(time.monotonic(),NEXT_REQUEST.get(bucket,0));NEXT_REQUEST[bucket]=when+interval
            time.sleep(max(0,when-time.monotonic()))
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':USER_AGENT}),timeout=45) as response:
                data=response.read(8_000_001)
            if len(data)>8_000_000:raise ValueError('Response too large')
            value=json.loads(data) if expect_json else data
            if expect_json and value.get('error'):raise ValueError('API error: '+value['error'].get('code','unknown'))
            file.write_bytes(data);return value
        except Exception as exc:
            if getattr(exc,'code',None)==429:
                retry=exc.headers.get('Retry-After','30')
                seconds=float(retry) if retry.isdigit() else 30
                with LOCK:NEXT_REQUEST[bucket]=max(NEXT_REQUEST.get(bucket,0),time.monotonic()+seconds)
            if attempt==2:raise
            time.sleep(1+attempt*2)
def api(params,host='en.wikipedia.org'):
    return request('https://'+host+'/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','maxlag':5,**params}))
def chunks(values,size=40):return [values[i:i+size] for i in range(0,len(values),size)]
aliases={}
old=ROOT/'scripts/fetch_place_photos.py'
for node in ast.parse(old.read_text(encoding='utf8')).body:
    if isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='mapping' for x in node.targets):aliases=ast.literal_eval(node.value)
aliases.update({'Mathura|Krishna Janmabhoomi':'Krishna Janmasthan Temple Complex','Mathura|Government Museum':'Government Museum, Mathura','Mathura|Dwarkadheesh Temple':'Dwarkadhish Temple, Mathura','Mathura|Jama Masjid':'Jama Mosque, Mathura','Mathura|Jai Gurudev Temple':'Jai Gurudev','Mathura|Gita Mandir':'Birla Mandir, Mathura','Jaipur|City Palace':'City Palace, Jaipur'})
city_alias={'Bengaluru':'Bangalore','Mysuru':'Mysore','Alleppey':'Alappuzha','Puducherry':'Pondicherry','Koderma':'Kodarma','Ramgarh':'Ramgarh Cantonment'}
def titles(row):
    name=row['name']
    if row['kind']=='destination':return list(dict.fromkeys([city_alias.get(name,name),name+', '+row['region'],name+', '+row['country'],*row.get('aliases',[])[:2]]))
    manual=aliases.get(row['city']+'|'+name)
    return list(dict.fromkeys([*( [manual] if manual else []),name+', '+row['city'],name+' ('+row['city']+')',name]))
all_titles=list(dict.fromkeys(t for row in rows for t in titles(row) if t))
pages={};redirects={};failures=[]
def fetch_pages(group):
    return api({'titles':'|'.join(group),'redirects':1,'prop':'pageimages|coordinates|pageprops|images','piprop':'name','pilicense':'free','imlimit':25})
def consume(data):
    q=data.get('query',{})
    redirects.update({x['from']:x['to'] for x in q.get('normalized',[])+q.get('redirects',[])})
    pages.update({p['title']:p for p in q.get('pages',{}).values() if 'missing' not in p})
groups=chunks(all_titles)
with futures.ThreadPoolExecutor(max_workers=4) as pool:
    jobs={pool.submit(fetch_pages,g):n for n,g in enumerate(groups)}
    for done,job in enumerate(futures.as_completed(jobs),1):
        try:consume(job.result())
        except Exception as exc:failures.append({'stage':'article','batch':jobs[job],'error':type(exc).__name__})
        if done%20==0 or done==len(groups):print('Article identity batches',done,'/',len(groups),'pages',len(pages),flush=True)

# GeoNames IDs identify a city even when its display name is ambiguous.
geodata={}
def wikidata_group(group):
    values=' '.join('"'+r['id']+'"' for r in group)
    query='SELECT ?geo ?item ?image ?article WHERE { VALUES ?geo { '+values+' } ?item wdt:P1566 ?geo . OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } }'
    return request('https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':query,'format':'json'}))
for n,group in enumerate(chunks(targets['destinations'],100),1):
    try:
        data=wikidata_group(group)
        for record in data.get('results',{}).get('bindings',[]):
            geo=record['geo']['value'];item=geodata.setdefault(geo,{'files':[]})
            if 'image' in record:item['files'].append('File:'+urllib.parse.unquote(record['image']['value'].rsplit('/',1)[-1]))
            if 'article' in record:item['title']=urllib.parse.unquote(record['article']['value'].split('/wiki/')[-1]).replace('_',' ')
            item['wikidata']=record['item']['value']
    except Exception as exc:failures.append({'stage':'geonames','batch':n,'error':type(exc).__name__})
    print('GeoNames identity batch',n,'/',11,'matched',len(geodata),flush=True)
extra=list({d['title'] for d in geodata.values() if d.get('title') and d['title'] not in pages})
with futures.ThreadPoolExecutor(max_workers=3) as pool:
    for result in pool.map(fetch_pages,chunks(extra)):
        consume(result)

def resolve(title):
    for _ in range(5):
        nxt=redirects.get(title)
        if not nxt or nxt==title:break
        title=nxt
    return pages.get(title)
def match(row,page):
    if not page or page.get('pageprops',{}).get('disambiguation') is not None:return False
    coord=page.get('coordinates',[{}])[0]
    if row['kind']=='destination':
        d=km(row['lat'],row['lng'],coord.get('lat'),coord.get('lon'))
        return d is not None and d<25
    d=km(row.get('lat'),row.get('lng'),coord.get('lat'),coord.get('lon'))
    if d is not None:return d<3
    city_dist=km(row['cityLat'],row['cityLng'],coord.get('lat'),coord.get('lon'))
    if city_dist is not None:return city_dist<65 and len(normal(row['name']).split())>=2
    return normal(row['city']) in normal(page['title']) and normal(row['name']).split()[0] in normal(page['title'])

selected={}
for row in rows:
    identified=geodata.get(row['key'],{}) if row['kind']=='destination' else {}
    primary=resolve(identified.get('title','')) if identified else None
    if not primary:primary=next((resolve(t) for t in titles(row) if match(row,resolve(t))),None)
    selected[row['key']]={'page':primary,'identity':identified}

files=set()
for item in selected.values():
    page=item['page'] or {}
    item['files']=list(dict.fromkeys(item['identity'].get('files',[])+(['File:'+page['pageimage']] if page.get('pageimage') else [])+[i['title'] for i in page.get('images',[]) if not bad.search(i['title'])]))
    files.update(item['files'])
metadata={}
def file_info(group):return api({'titles':'|'.join(group),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':900},'commons.wikimedia.org')
with futures.ThreadPoolExecutor(max_workers=4) as pool:
    jobs=[pool.submit(file_info,g) for g in chunks(sorted(files),40)]
    for n,job in enumerate(futures.as_completed(jobs),1):
        try:
            q=job.result().get('query',{})
            for page in q.get('pages',{}).values():
                if page.get('imageinfo'):metadata[normal(page['title'])]=page['imageinfo'][0]
        except Exception as exc:failures.append({'stage':'credits','error':type(exc).__name__})
        if n%20==0 or n==len(jobs):print('Photo metadata batches',n,'/',len(jobs),flush=True)

stop_words={'the','of','in','and','a','an','sri','shri','temple','museum','park','palace','church','fort','city','lake','mandir','national','new','old','garden','garden','government'}
def specific(row,title):
    terms={x for x in normal(title).split() if x not in stop_words and len(x)>2}
    return terms
def candidates(row):
    item=selected[row['key']];page=item['page'] or {};primary=normal('File:'+page.get('pageimage',''));identified={normal(f) for f in item['identity'].get('files',[])}
    terms=specific(row,page.get('title',row['name']))
    result=[]
    for filename in item['files']:
        info=metadata.get(normal(filename));ext=(info or {}).get('extmetadata',{})
        if not info or bad.search(filename):continue
        rejection_file=ROOT/'lib/photo-rejections.json'
        rejections=json.loads(rejection_file.read_text(encoding='utf8')) if rejection_file.exists() else []
        if any(p['key']==row['key'] and normal(p['source'])==normal(info.get('descriptionurl','')) for p in rejections):continue
        license=clean(ext.get('LicenseShortName',{}).get('value',''))
        description=clean(ext.get('ImageDescription',{}).get('value',''))
        if not license or bad.search(description[:90]) or license.lower() in ['fair use','copyrighted']:continue
        main=normal(filename)==primary or normal(filename) in identified or normal(filename) in item.get('exactFiles',set())
        words=set(normal(filename+' '+description).split())
        if not main and (not terms or len(terms&words)<min(2,len(terms))):continue
        url=info.get('thumburl') or info.get('url','')
        parsed=urllib.parse.urlparse(url)
        if parsed.scheme!='https' or parsed.hostname not in ['upload.wikimedia.org','thumb.wikimedia.org']:continue
        result.append((not main,filename,info,ext,description))
    return sorted(result,key=lambda x:(x[0],x[1]))[:5]

if args.search_missing:
    # Search original Commons captions for missing subjects and extra views.
    # Small OR batches avoid thousands of separate search requests.
    missing=[r for r in rows if len(candidates(r))<3]
    def commons_search(group):
        terms=[]
        for row in group:
            name=aliases.get(row.get('city','')+'|'+row['name'],row['name'])
            place=row.get('city') or row.get('region') or row['country']
            terms.append('("'+name.replace('"','')+'" "'+place.replace('"','')+'")')
        return group,api({'generator':'search','gsrsearch':' OR '.join(terms),'gsrnamespace':6,'gsrlimit':50,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':900},'commons.wikimedia.org')
    groups=chunks(missing,5)
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs=[pool.submit(commons_search,g) for g in groups]
        for n,job in enumerate(futures.as_completed(jobs),1):
            try:
                group,data=job.result()
                for page in data.get('query',{}).get('pages',{}).values():
                    if not page.get('imageinfo') or bad.search(page['title']):continue
                    info=page['imageinfo'][0];ext=info.get('extmetadata',{})
                    text=normal(page['title']+' '+clean(ext.get('ImageDescription',{}).get('value','')))
                    words=set(text.split())
                    for row in group:
                        name_terms=specific(row,row['name'])
                        location=row.get('city') or row.get('region') or row['country']
                        if not name_terms or len(name_terms&words)<min(2,len(name_terms)) or normal(location) not in text:continue
                        item=selected[row['key']];filename=page['title'];metadata[normal(filename)]=info
                        if filename not in item['files']:item['files'].append(filename)
                        item.setdefault('exactFiles',set()).add(normal(filename))
            except Exception as exc:failures.append({'stage':'commons search','batch':n,'error':type(exc).__name__})
            if n%20==0 or n==len(groups):print('Exact caption search batches',n,'/',len(groups),flush=True)

photos={};destinations={};status=[]
def download_row(row):
    gallery=[];hashes=set()
    for _,filename,info,ext,description in candidates(row):
        try:
            content=request(info.get('thumburl') or info['url'],False)
            im=ImageOps.exif_transpose(Image.open(io.BytesIO(content))).convert('RGB');im.thumbnail((900,700))
            buf=io.BytesIO();im.save(buf,'JPEG',quality=82,optimize=True);data=buf.getvalue();digest=hashlib.sha256(data).hexdigest()
            if digest in hashes:continue
            hashes.add(digest)
            folder='destinations' if row['kind']=='destination' else 'places'
            path=ROOT/'public'/'assets'/folder/(digest+'.jpg');path.parent.mkdir(parents=True,exist_ok=True)
            if not path.exists():path.write_bytes(data)
            page=selected[row['key']]['page'] or {}
            gallery.append({'image':'/assets/'+folder+'/'+digest+'.jpg','subject':row['name'],'resolvedSubject':page.get('title',row['name']),'scope':'destination' if row['kind']=='destination' else 'place','source':info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/'+urllib.parse.quote(filename),'artist':clean(ext.get('Artist',{}).get('value',''))[:200],'license':clean(ext.get('LicenseShortName',{}).get('value','')),'licenseUrl':clean(ext.get('LicenseUrl',{}).get('value','')),'description':description[:350],'identitySource':selected[row['key']]['identity'].get('wikidata') or ('https://en.wikipedia.org/wiki/'+urllib.parse.quote(page['title']) if page.get('title') else info.get('descriptionurl'))})
            if len(gallery)>=3:break
        except Exception as exc:
            if len(failures)<50:failures.append({'stage':'download','key':row['key'],'error':type(exc).__name__,'detail':str(exc)[:120]})
            continue
    return row,gallery
with futures.ThreadPoolExecutor(max_workers=4) as pool:
    for n,(row,gallery) in enumerate(pool.map(download_row,rows),1):
        if gallery:
            record={**gallery[0],'photos':gallery}
            (destinations if row['kind']=='destination' else photos)[row['key']]=record
        status.append({'key':row['key'],'kind':row['kind'],'name':row['name'],'city':row.get('city'),'count':len(gallery),'status':'matched source article or GeoNames entity' if gallery else 'no verified reusable photo found'})
        if n%100==0 or n==len(rows):
            print('Photo subjects',n,'/',len(rows),'destinations',len(destinations),'landmarks',len(photos),'multiple',sum(len(v['photos'])>1 for v in photos.values()),flush=True)
            (CACHE/'progress.json').write_text(json.dumps({'destinations':destinations,'landmarks':photos,'status':status},ensure_ascii=False),encoding='utf8')
for file,value in [(ROOT/'lib/destination-photos.json',destinations),(ROOT/'lib/place-photos.json',photos),(ROOT/'public/assets/destination-photo-credits.json',destinations),(ROOT/'public/assets/place-photo-credits.json',photos)]:file.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf8')
report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'destinations':{'total':len(targets['destinations']),'withPhotos':len(destinations)},'landmarks':{'total':len(targets['landmarks']),'withPhotos':len(photos),'withMultiplePhotos':sum(len(v['photos'])>1 for v in photos.values())},'policy':'No destination-photo fallback on landmark cards. Matches use source article coordinates/title or exact GeoNames entity. Automated matches remain subject to editorial review.','networkFailures':failures,'subjects':status}
(ROOT/'public/assets/photo-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print('DONE',json.dumps({k:v for k,v in report.items() if k not in ['subjects','networkFailures']}),flush=True)

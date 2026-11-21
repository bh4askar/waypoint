import concurrent.futures,html,json,pathlib,re,urllib.parse,urllib.request
BASE=pathlib.Path(__file__).resolve().parents[1]
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (educational site; image attribution retained)'}),timeout=30) as r:return r.read()
titles={'Hazaribagh':'Hazaribagh','Ranchi':'Ranchi','Koderma':'Kodarma','Ramgarh':'Ramgarh Cantonment','Dhanbad':'Dhanbad','Jamshedpur':'Jamshedpur'}
query=urllib.parse.urlencode({'action':'query','titles':'|'.join(titles.values()),'prop':'pageimages','piprop':'thumbnail|name','pithumbsize':1000,'pilicense':'free','format':'json','redirects':1})
data=json.loads(get('https://en.wikipedia.org/w/api.php?'+query))
pages={p['title']:p for p in data.get('query',{}).get('pages',{}).values()}
credits={}
def fetch_one(item):
    name,title=item;p=pages.get(title)
    if not p or not p.get('thumbnail'):return (name,'no free image')
    image=p.get('pageimage');source=p['thumbnail']['source'];slug=name.lower()
    b=get(source);(BASE/'public'/'assets'/(slug+'-jh.jpg')).write_bytes(b)
    metaquery=urllib.parse.urlencode({'action':'query','titles':'File:'+image,'prop':'imageinfo','iiprop':'extmetadata','format':'json'})
    meta=json.loads(get('https://commons.wikimedia.org/w/api.php?'+metaquery))
    records=list(meta.get('query',{}).get('pages',{}).values());ext=records[0].get('imageinfo',[{}])[0].get('extmetadata',{})
    clean=lambda key:html.unescape(re.sub('<[^>]+>','',ext.get(key,{}).get('value','')))
    credits[name]={'file':slug+'-jh.jpg','source':'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(image),'artist':clean('Artist'),'license':clean('LicenseShortName'),'licenseUrl':clean('LicenseUrl')}
    return(name,len(b),credits[name]['license'])
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
    futures=[executor.submit(fetch_one,item) for item in titles.items()]
    for future in futures:
        try:print(future.result(),flush=True)
        except Exception as exc:print(type(exc).__name__,str(exc)[:100],flush=True)
(BASE/'public'/'assets'/'jharkhand-photo-credits.json').write_text(json.dumps(credits,ensure_ascii=False,indent=2),encoding='utf8')

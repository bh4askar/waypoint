from pathlib import Path
import concurrent.futures,hashlib,io,json,threading,time,urllib.request,urllib.parse,sys
from PIL import Image,ImageOps
REPO=Path(__file__).resolve().parents[1];BASE=REPO/'data/photo-audit';BASE.mkdir(parents=True,exist_ok=True)
manifest=json.loads((REPO/'lib/external-photo-sources.json').read_text(encoding='utf8'))
OUT=REPO/'public/assets/exact';OUT.mkdir(parents=True,exist_ok=True)
indexfile=REPO/'lib/source-photo-files.json'
index=json.loads(indexfile.read_text(encoding='utf8')) if indexfile.exists() else {}
urls=list(dict.fromkeys(p['url'] for r in manifest.values() for p in r['photos']));failures=[]
if '--new-only' in sys.argv:
    failed_file=BASE/'source-photo-download-failures.json'
    previous_failures=json.loads(failed_file.read_text(encoding='utf8')) if failed_file.exists() else []
    attempted={r['url'] for r in previous_failures}
    urls=[url for url in urls if url not in index and url not in attempted]
    failures=previous_failures
wiki_lock=threading.Lock()
def download_url(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.hostname in ['upload.wikimedia.org','thumb.wikimedia.org']:
        parts=urllib.parse.unquote(parsed.path).split('/')
        filename=parts[-2] if 'thumb' in parts else parts[-1]
        cache=REPO/'data/photo-audit'/('thumb960-'+hashlib.sha256(filename.encode()).hexdigest()+'.json')
        with wiki_lock:
            if cache.exists():data=json.loads(cache.read_text(encoding='utf8'))
            else:
                time.sleep(1.3)
                endpoint='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url','iiurlwidth':960})
                with urllib.request.urlopen(urllib.request.Request(endpoint,headers={'User-Agent':'Waypoint/1.0 (https://github.com/bh4askar/waypoint; source photo audit)'}),timeout=20) as r:data=json.load(r)
                cache.write_text(json.dumps(data),encoding='utf8')
        info=next((p['imageinfo'][0] for p in data.get('query',{}).get('pages',{}).values() if p.get('imageinfo')),None)
        if info and info.get('thumburl'):return info['thumburl']
    if '/_next/image' in parsed.path:
        candidate=urllib.parse.parse_qs(parsed.query).get('url',[''])[0]
        if candidate.startswith('https://'):return candidate
    return url
def download(url):
    digest=hashlib.sha256(url.encode()).hexdigest();file=OUT/(digest+'.jpg')
    if file.exists():return url,{'image':'/assets/exact/'+file.name,'bytes':file.stat().st_size}
    try:
        with urllib.request.urlopen(urllib.request.Request(download_url(url),headers={'User-Agent':'Mozilla/5.0 (compatible; Waypoint/1.0; photo source verification)'}),timeout=18) as r:
            content=r.read(20_000_001)
        if len(content)>20_000_000:raise ValueError('Image exceeds 20 MB')
        with Image.open(io.BytesIO(content)) as im:
            if im.width*im.height>32_000_000:raise ValueError('Image dimensions exceed limit')
            if im.width<180 or im.height<160 or im.width*im.height<60000:raise ValueError('Small icon or placeholder image')
            im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((900,700));im.save(file,'JPEG',quality=82,optimize=True)
        return url,{'image':'/assets/exact/'+file.name,'bytes':file.stat().st_size}
    except Exception as e:return url,{'error':type(e).__name__+': '+str(e)[:140]}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for n,(url,result) in enumerate(pool.map(download,urls),1):
        if 'image' in result:index[url]=result
        else:failures.append({'url':url,**result})
        if n%25==0 or n==len(urls):
            indexfile.write_text(json.dumps(index,separators=(',',':')),encoding='utf8')
            print('Original image files',n,'/',len(urls),'downloaded',len(index),'failed',len(failures),flush=True)
(BASE/'source-photo-download-failures.json').write_text(json.dumps(failures,indent=2),encoding='utf8')
print('DONE',len(index),'original photo files',sum(p['bytes'] for p in index.values())//1024//1024,'MB',flush=True)

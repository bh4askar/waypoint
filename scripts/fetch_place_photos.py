import concurrent.futures,html,json,math,pathlib,re,urllib.parse,urllib.request
BASE=pathlib.Path(__file__).resolve().parents[1]
OUT=BASE/'public'/'assets'/'places';OUT.mkdir(exist_ok=True)
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (educational travel guide; photo attribution retained)'}),timeout=35) as r:return r.read()
def query(params,host='en.wikipedia.org'):
    return json.loads(get('https://'+host+'/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json',**params})))
def km(a,b,c,d):
    r=math.pi/180;x=math.sin((c-a)*r/2)**2+math.cos(a*r)*math.cos(c*r)*math.sin((d-b)*r/2)**2
    return 6371*2*math.asin(math.sqrt(min(1,x)))

mapping={
 'Hazaribagh|Hazaribagh Lake':'Hazaribagh Lake', 'Hazaribagh|Canary Hill':'Canary Hill, Hazaribagh', 'Hazaribagh|Hazaribagh Wildlife Sanctuary':'Hazaribagh Wildlife Sanctuary',
 'Koderma|Tilaiya Dam':'Tilaiya Dam','Koderma|Dhwajadhari Hill':'Dhwajadhari','Koderma|Koderma Wildlife Sanctuary':'Koderma Wildlife Sanctuary',
 'Ramgarh|Patratu Dam':'Patratu','Ramgarh|Patratu Valley':'Patratu','Ramgarh|Rajrappa Chhinnamastika Temple':'Chhinnamasta Temple','Ramgarh|Shiv Mandir Tuti Jharna':'Tuti Jharna',
 'Ranchi|Rock Garden, Ranchi':'Rock Garden, Ranchi','Ranchi|Kanke Dam':'Kanke Dam','Ranchi|Tagore Hill':'Tagore Hill','Ranchi|Pahari Mandir':'Pahari Mandir',
 'Ranchi|Jagannath Temple, Ranchi':'Jagannath Temple, Ranchi','Ranchi|State Museum Hotwar':'State Museum Hotwar','Ranchi|Hundru Falls':'Hundru Falls','Ranchi|Jonha Falls':'Jonha Falls','Ranchi|Dassam Falls':'Dassam Falls',
 'Dhanbad|Birsa Munda Park':'Birsa Munda Park','Dhanbad|Shakti Mandir':'Shakti Mandir','Dhanbad|Bhatinda Falls':'Bhatinda Falls','Dhanbad|Maithon Dam':'Maithon Dam','Dhanbad|Kalyaneshwari Temple':'Kalyaneshwari Temple','Dhanbad|Panchet Dam':'Panchet Dam','Dhanbad|Topchanchi Lake':'Topchanchi','Dhanbad|Lilori Sthan Temple':'Lilori Sthan',
 'Jamshedpur|Jubilee Park, Jamshedpur':'Jubilee Park, Jamshedpur','Jamshedpur|Tata Steel Zoological Park':'Tata Steel Zoological Park','Jamshedpur|Russi Modi Centre of Excellence':'Russi Modi Centre of Excellence','Jamshedpur|Sir Dorabji Tata Park':'Sir Dorabji Tata Park','Jamshedpur|Dimna Lake':'Dimna Lake','Jamshedpur|Dalma Wildlife Sanctuary':'Dalma Wildlife Sanctuary','Jamshedpur|Bhuvaneshwari Temple':'Bhuvaneshwari Temple, Jamshedpur','Jamshedpur|Hudco Lake':'Hudco Lake',
 'Jaipur|Amber Fort':'Amer Fort','Jaipur|City Palace':'City Palace, Jaipur','Jaipur|Hawa Mahal':'Hawa Mahal','Jaipur|Jal Mahal':'Jal Mahal','Jaipur|Jaigarh Fort':'Jaigarh Fort','Jaipur|Nahargarh Fort':'Nahargarh Fort','Jaipur|Albert Hall Museum':'Albert Hall Museum','Jaipur|Jantar Mantar':'Jantar Mantar, Jaipur',
 'Agra|Taj Mahal':'Taj Mahal','Agra|Agra Fort':'Agra Fort','Agra|Mehtab Bagh':'Mehtab Bagh','Agra|Tomb of I\'timad-ud-Daulah':"Tomb of I'timad-ud-Daulah",
 'Kyoto|Kiyomizu-dera':'Kiyomizu-dera','Kyoto|Fushimi Inari Taisha':'Fushimi Inari-taisha','Kyoto|Kinkaku-ji':'Kinkaku-ji',
 'Paris|Louvre Museum':'Louvre','Paris|Eiffel Tower':'Eiffel Tower','Paris|Musee d\'Orsay':"Musee d'Orsay",
 'Goa|Basilica of Bom Jesus':'Basilica of Bom Jesus','Kochi|Chinese fishing nets':'Chinese fishing nets',
}
catalogue=json.loads((BASE/'lib'/'catalogue.json').read_text(encoding='utf8'));cities={d['name']:d for d in catalogue}
titles=list(set(mapping.values()));photos={};pages={};norm={}
for start in range(0,len(titles),20):
    data=query({'titles':'|'.join(titles[start:start+20]),'prop':'pageimages|coordinates','piprop':'thumbnail|name','pithumbsize':900,'pilicense':'free','redirects':1})
    q=data.get('query',{});norm.update({x['from']:x['to'] for x in q.get('normalized',[])});norm.update({x['from']:x['to'] for x in q.get('redirects',[])})
    pages.update({p['title']:p for p in q.get('pages',{}).values()})
    print('Wikipedia photo batch',start,flush=True)
files=list(set('File:'+p['pageimage'] for p in pages.values() if p.get('pageimage')));metadata={}
for start in range(0,len(files),20):
    data=query({'titles':'|'.join(files[start:start+20]),'prop':'imageinfo','iiprop':'extmetadata'},'commons.wikimedia.org')
    metadata.update({p['title'].removeprefix('File:').replace('_',' '):p.get('imageinfo',[{}])[0].get('extmetadata',{}) for p in data.get('query',{}).get('pages',{}).values()})
def fetch_one(item):
    key,title=item;resolved=norm.get(title,title);p=pages.get(resolved)
    if not p or not p.get('thumbnail') or not p.get('pageimage'):return
    name=p['pageimage']
    ext=metadata.get(name.replace('_',' '),{})
    if not ext.get('LicenseShortName') or re.search(r'logo|flag|map of',ext.get('ImageDescription',{}).get('value',''),re.I):return
    if key=='Kochi|Chinese fishing nets':return
    if re.search(r'\.svg$|logo|locator|location map|district map',name,re.I):return
    coord=p.get('coordinates',[{}])[0];city=cities.get(key.split('|')[0])
    if city and 'lat' in coord and km(city['lat'],city['lng'],coord['lat'],coord['lon'])>85:return
    slug=re.sub('[^a-z0-9]+','-',key.lower()).strip('-');file=OUT/(slug+'.jpg')
    try:
        if not file.exists():file.write_bytes(get(p['thumbnail']['source']))
        ext=metadata.get(name.replace('_',' '),{})
        clean=lambda k:html.unescape(re.sub('<[^>]+>','',ext.get(k,{}).get('value',''))).strip()
        photos[key]={'image':'/assets/places/'+slug+'.jpg','subject':title,'source':'https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(name),'artist':clean('Artist')[:200],'license':clean('LicenseShortName'),'licenseUrl':clean('LicenseUrl')}
    except Exception as exc:print('photo unavailable',key,type(exc).__name__,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:list(executor.map(fetch_one,mapping.items()))
(BASE/'lib'/'place-photos.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2),encoding='utf8')
(BASE/'public'/'assets'/'place-photo-credits.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2),encoding='utf8')
print('Ready',len(photos),'place photographs',flush=True)

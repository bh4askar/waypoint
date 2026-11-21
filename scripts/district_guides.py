import concurrent.futures,json,re,urllib.parse,urllib.request
from fetch_waypoint_guides import BASE,catalogue,extract,aliases
names=['Agra','Delhi','Kochi','Manali','Paris','Kyoto','Ubud','Goa','Bengaluru','Mumbai','Chennai','Hyderabad','Munnar','Ooty','London','Rome','Florence','Tokyo','Bangkok','Singapore','Amsterdam','Lisbon','Barcelona']
rows=[r for r in catalogue if r['name'] in names]
guides=json.loads((BASE/'lib/guides.json').read_text(encoding='utf8'))
def fetch(titles):
    args=urllib.parse.urlencode({'action':'query','prop':'revisions','rvprop':'content|timestamp','rvslots':'main','format':'json','redirects':1,'titles':'|'.join(titles)})
    req=urllib.request.Request('https://en.wikivoyage.org/w/api.php?'+args,headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (educational guide snapshot)'})
    with urllib.request.urlopen(req,timeout=40) as response:return json.load(response).get('query',{})
for row in rows:
    name=aliases.get(row['name'],row['name'])
    try:
        q=fetch([name]);parent=next(iter(q.get('pages',{}).values()));rev=parent.get('revisions',[{}])[0];text=rev.get('slots',{}).get('main',{}).get('*','');title=parent.get('title',name)
        children=list(dict.fromkeys(re.findall(r'\[\[('+re.escape(title)+r'/[^|\]#\n]+)',text)))[:25]
        if not children:continue
        combined=guides.get(row['id'],extract(text,row,title,rev.get('timestamp','')))
        for start in range(0,len(children),8):
            childq=fetch(children[start:start+8])
            for page in childq.get('pages',{}).values():
                if 'revisions' not in page:continue
                revision=page['revisions'][0];child=extract(revision['slots']['main']['*'],row,page['title'],revision.get('timestamp',''))
                combined['attractions']+=child['attractions'];combined['restaurants']+=child['restaurants']
        seen=set();unique=[]
        for place in combined['attractions']:
            key=place['name'].lower()
            if key not in seen:unique.append(place);seen.add(key)
        combined['attractions']=unique[:80];combined['restaurants']=combined['restaurants'][:20]
        if combined['attractions']:guides[row['id']]=combined
        print(row['name'],len(children),'districts',len(combined['attractions']),'attractions',flush=True)
        (BASE/'lib/guides.json').write_text(json.dumps(guides,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    except Exception as exc:print(row['name'],'unavailable',type(exc).__name__,flush=True)
print('DONE',len(guides),'included guides',flush=True)

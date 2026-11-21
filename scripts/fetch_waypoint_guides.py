import concurrent.futures, datetime, html, json, math, pathlib, re, time, urllib.parse, urllib.request
BASE=pathlib.Path(__file__).resolve().parents[1]
catalogue=json.loads((BASE/'lib'/'catalogue.json').read_text(encoding='utf8'))
aliases={'Bengaluru':'Bangalore','Mysuru':'Mysore','Kochi':'Kochi','Alleppey':'Alappuzha','Puducherry':'Pondicherry','Ooty':'Ooty','New York City':'New York City','La Spezia':'Cinque Terre','Ho Chi Minh City':'Ho Chi Minh City'}

def clean(s):
    s=re.sub(r'\[\[(?:[^\]|]+\|)?([^\]]+)\]\]',r'\1',s)
    s=re.sub(r'\[(https?://\S+)\s+([^\]]+)\]',r'\2',s)
    for _ in range(4): s=re.sub(r'\{\{[^{}]*\}\}','',s)
    s=re.sub(r'<ref\b.*?</ref>','',s,flags=re.S)
    s=re.sub(r'<[^>]+>','',s)
    s=s.replace("'''",'').replace("''",'')
    return re.sub(r'\s+',' ',html.unescape(s)).strip()

def templates(s):
    stack=[]; found=[]; i=0
    while i<len(s)-1:
        if s[i:i+2]=='{{': stack.append(i); i+=2
        elif s[i:i+2]=='}}':
            if stack:
                start=stack.pop()
                item=s[start+2:i]
                if re.match(r'\s*(see|do|eat|listing|vcard)\s*\|',item,re.I): found.append(item)
            i+=2
        else:i+=1
    return found

def parts(s):
    return re.split(r'\|\s*(?=[a-zA-Z_]+\s*=)',s)

def km(a,b,c,d):
    rad=math.pi/180; x=math.sin((c-a)*rad/2)**2+math.cos(a*rad)*math.cos(c*rad)*math.sin((d-b)*rad/2)**2
    return 6371*2*math.atan2(math.sqrt(min(1,x)),math.sqrt(max(0,1-x)))

def extract(s,r,title,timestamp):
    out=[]; food=[]; used=set()
    for item in templates(s):
        kind=item.split('|',1)[0].strip().lower()
        v={}
        for part in parts(item)[1:]:
            if '=' in part:
                k,value=part.split('=',1); v[k.strip().lower()]=value.strip()
        if kind in ('listing','vcard'):
            if v.get('type','') not in ('see','do','museum','castle','monument','park','temple','palace','eat'): continue
            kind=v.get('type','see')
        name=clean(v.get('name',''))
        content=clean(v.get('content',''))
        if not name or name.lower() in used or len(name)>130: continue
        try: lat=float(v.get('lat','')); lng=float(v.get('long',v.get('lon','')))
        except ValueError: lat=None; lng=None
        if lat is not None and (not -90<=lat<=90 or not -180<=lng<=180 or km(r['lat'],r['lng'],lat,lng)>65):continue
        if not content and lat is None:continue
        url=v.get('url','')
        if not re.match(r'^https?://[^\s]+$',url):url=''
        used.add(name.lower())
        record={'name':name,'description':content[:1000],'lat':lat,'lng':lng,'address':clean(v.get('address',''))[:180],'source':'https://en.wikivoyage.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),'venueUrl':url,'lastEdit':clean(v.get('lastedit','')),'kind':kind}
        if kind=='eat':food.append(record)
        else:out.append(record)
    return {'attractions':out[:55],'restaurants':food[:12],'title':title,'source':'https://en.wikivoyage.org/wiki/'+urllib.parse.quote(title.replace(' ','_')),'sourceRevision':timestamp,'retrieved':datetime.date.today().isoformat()}

def batch(rows):
    titles=[aliases.get(r['name'],r['name']) for r in rows]
    query=urllib.parse.urlencode({'action':'query','prop':'revisions','rvprop':'content|timestamp','rvslots':'main','format':'json','redirects':1,'titles':'|'.join(titles)})
    request=urllib.request.Request('https://en.wikivoyage.org/w/api.php?'+query,headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (single educational catalogue snapshot)'})
    try:
        with urllib.request.urlopen(request,timeout=45) as response: data=json.load(response)
    except Exception as exc:
        print('batch error',type(exc).__name__,flush=True);return {}
    q=data.get('query',{}); normalized={x['from']:x['to'] for x in q.get('normalized',[])}; redirects={x['from']:x['to'] for x in q.get('redirects',[])}
    pages={x.get('title'):x for x in q.get('pages',{}).values()};result={}
    for r,title in zip(rows,titles):
        title=normalized.get(title,title); title=redirects.get(title,title)
        page=pages.get(title)
        if not page or 'revisions' not in page:continue
        rev=page['revisions'][0]; s=rev['slots']['main']['*']
        geo=re.search(r'\{\{geo\s*\|\s*([\d.-]+)\s*\|\s*([\d.-]+)',s,re.I)
        if geo and km(r['lat'],r['lng'],float(geo[1]),float(geo[2]))>90:continue
        guide=extract(s,r,title,rev.get('timestamp',''))
        if guide['attractions']: result[r['id']]=guide
    print('batch',len(rows),'guides',len(result),flush=True)
    return result

if __name__=='__main__':
    chunks=[catalogue[i:i+20] for i in range(0,len(catalogue),20)]
    guides={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(batch,chunks):guides.update(result)
    (BASE/'lib'/'guides.json').write_text(json.dumps(guides,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    print('DONE',len(guides),'guides',sum(len(g['attractions']) for g in guides.values()),'attractions',flush=True)

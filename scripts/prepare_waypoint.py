import concurrent.futures, csv, io, json, pathlib, urllib.request, zipfile, re

BASE = pathlib.Path(__file__).resolve().parents[1]
ASSETS = BASE / 'public' / 'assets'
ASSETS.mkdir(parents=True, exist_ok=True)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent':'Waypoint-Local-Prototype/1.0 (educational travel planner; single catalogue download)'})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()

photos = {
    'switzerland':'photo-1476514525535-07fb3b4ae5f1',
    'italy':'photo-1516483638261-f4dbaf036963',
    'japan':'photo-1493976040374-85c8e12f0c0e',
    'bali':'photo-1537996194471-e657df975ab4',
    'paris':'photo-1502602898657-3e91760cbb34',
    'lisbon':'photo-1555881400-74d7acaacd8b',
    'jaipur':'photo-1477587458883-47145ed94245',
    'agra':'photo-1524492412937-b28074a5d7da',
    'goa':'photo-1512343879784-a960bf40e7f2',
    'kerala':'photo-1602216056096-3b40cc0c9944'
}
def download_photo(item):
    key, photo = item
    file = ASSETS / (key+'.jpg')
    if not file.exists():
        file.write_bytes(get('https://images.unsplash.com/'+photo+'?auto=format&fit=crop&w=1800&q=85'))
    return key, file.stat().st_size

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    for result in executor.map(download_photo, photos.items()):
        print('photo', *result, flush=True)

archive = zipfile.ZipFile(io.BytesIO(get('https://download.geonames.org/export/dump/cities5000.zip')))
records = []
for line in archive.read('cities5000.txt').decode('utf-8').splitlines():
    v = line.split('\t')
    records.append({'gid':int(v[0]),'name':v[2] or v[1],'aliases':v[3].split(',')[:30], 'lat':float(v[4]),'lng':float(v[5]),'countryCode':v[8],'admin':v[10],'population':int(v[14])})
admin = {}
for line in get('https://download.geonames.org/export/dump/admin1CodesASCII.txt').decode('utf-8').splitlines():
    v=line.split('\t')
    if len(v)>2: admin[v[0]]=v[2]
countries={}
for line in get('https://download.geonames.org/export/dump/countryInfo.txt').decode('utf-8').splitlines():
    if not line or line.startswith('#'): continue
    v=line.split('\t'); countries[v[0]]=v[4]

preferred = 'Jaipur|Agra|Panaji|Kochi|Udaipur|Varanasi|Rishikesh|Manali|Shimla|Leh|Srinagar|Darjeeling|Gangtok|Munnar|Alappuzha|Mysore|Amritsar|Jodhpur|Jaisalmer|Pushkar|Bikaner|Ajmer|New Delhi|Mumbai|Bengaluru|Chennai|Hyderabad|Kolkata|Pune|Pondicherry|Madurai|Thanjavur|Tiruchirappalli|Coimbatore|Udagamandalam|Kodaikanal|Kanyakumari|Rameswaram|Mahabalipuram|Tirupati|Visakhapatnam|Vijayawada|Hampi|Hospet|Mangalore|Udupi|Chikmagalur|Hassan|Badami|Gokarna|Dandeli|Ahmedabad|Vadodara|Surat|Rajkot|Junagadh|Dwarka|Somnath|Bhuj|Mount Abu|Bhopal|Indore|Gwalior|Khajuraho|Ujjain|Orchha|Jabalpur|Pachmarhi|Sanchi|Lucknow|Prayagraj|Ayodhya|Mathura|Vrindavan|Haridwar|Dehra Dun|Mussoorie|Nainital|Almora|Ranikhet|Dharamshala|Dalhousie|Kullu|Chandigarh|Patiala|Jammu|Kargil|Guwahati|Shillong|Cherrapunji|Kohima|Imphal|Aizawl|Agartala|Itanagar|Tezpur|Jorhat|Dibrugarh|Tawang|Bhubaneswar|Puri|Konark|Cuttack|Sambalpur|Ranchi|Jamshedpur|Patna|Gaya|Bodh Gaya|Rajgir|Nalanda|Siliguri|Kalimpong|Digha|Shantiniketan|Port Blair|Thiruvananthapuram|Kozhikode|Thrissur|Kannur|Palakkad|Varkala|Kollam|Kottayam|Nagpur|Nashik|Aurangabad|Kolhapur|Ratnagiri|Satara|Lonavala|Mahabaleshwar|Shirdi|Panjim|Margao|Vasco da Gama|Mapusa'.lower().split('|')
def names(r): return {r['name'].lower(), *(x.lower() for x in r['aliases'])}
india=sorted((r for r in records if r['countryCode']=='IN'),key=lambda r:(not bool(names(r)&set(preferred)), -r['population']))[:520]

worldNames='Paris|London|Rome|Florence|Venice|Naples|Milan|Lisbon|Porto|Barcelona|Madrid|Seville|Granada|Amsterdam|Brussels|Prague|Vienna|Budapest|Berlin|Munich|Athens|Istanbul|Zurich|Geneva|Interlaken|Luzern|Salzburg|Innsbruck|Copenhagen|Stockholm|Oslo|Bergen|Helsinki|Reykjavik|Dubrovnik|Split|Nice|Lyon|Kyoto|Tokyo|Osaka|Nara|Hiroshima|Seoul|Busan|Bangkok|Chiang Mai|Phuket|Singapore|Kuala Lumpur|George Town|Hanoi|Ho Chi Minh City|Da Nang|Hoi An|Siem Reap|Ubud|Denpasar|Yogyakarta|Kathmandu|Pokhara|Colombo|Kandy|Galle|Thimphu|Paro|Dubai|Abu Dhabi|Muscat|Amman|Cairo|Marrakesh|Cape Town|Sydney|Melbourne|Queenstown|Auckland|New York City|San Francisco|Vancouver|Toronto|Montreal|Mexico City|Lima|Cusco|Buenos Aires|Rio de Janeiro|La Spezia'.split('|')
world=[]; used=set()
for name in worldNames:
    options=[r for r in records if r['countryCode']!='IN' and name.lower() in names(r) and r['gid'] not in used]
    if options:
        chosen=max(options,key=lambda r:r['population']); world.append(chosen); used.add(chosen['gid'])
    if len(world)==80: break
if len(world)<80:
    for r in sorted(records,key=lambda r:-r['population']):
        if r['countryCode']!='IN' and r['gid'] not in used: world.append(r); used.add(r['gid'])
        if len(world)==80: break

display={'Panaji':'Goa','Kochi':'Kochi','Bengaluru':'Bengaluru','Mysore':'Mysuru','Pondicherry':'Puducherry','Udagamandalam':'Ooty','Alappuzha':'Alleppey','La Spezia':'Cinque Terre'}
for r in india+world:
    r['region']=admin.get(r['countryCode']+'.'+r['admin'],'')
    r['country']=countries.get(r['countryCode'],r['countryCode'])
    r['name']=display.get(r['name'],r['name'])
    r['id']=str(r['gid'])
    r['source']='https://www.geonames.org/'+str(r['gid'])
    r['guideUrl']='https://en.wikivoyage.org/wiki/'+urllib.parse.quote(r['name'].replace(' ','_'))
    del r['population']; del r['admin']; del r['gid']
catalogue=india+world
assert len(catalogue)==600
assert sum(r['countryCode']=='IN' for r in catalogue)==520
(BASE/'lib').mkdir(exist_ok=True)
(BASE/'lib'/'catalogue.json').write_text(json.dumps(catalogue,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(BASE/'public'/'assets'/'photo-credits.json').write_text(json.dumps({k:'https://unsplash.com/photos/'+v.removeprefix('photo-') for k,v in photos.items()},indent=2),encoding='utf-8')
print('catalogue',len(catalogue),'India',520,'international',80,flush=True)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {catalogue,guides} from './data.mjs';
import {distance,PlannerError,preparePlaces} from './planner.mjs';
import {includedGuide} from './guide-resolver.mjs';
const normal=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const aliases={'Patratu Dam':'Patratu','Patratu Valley':'Patratu','Rajrappa Chhinnamastika Temple':'Chhinnamasta Temple','Dhwajadhari Hill':'Dhwajadhari','Jubilee Park, Jamshedpur':'Jubilee Park, Jamshedpur','Jagannath Temple, Ranchi':'Jagannath Temple, Ranchi'};
let routeQueue=Promise.resolve(),lastRoute=0;
async function serialRoute(task){const run=routeQueue.then(async()=>{const wait=1100-(Date.now()-lastRoute);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastRoute=Date.now();return task();});routeQueue=run.catch(()=>{});return run;}
export async function mapData(payload,dataDir,config){
  const city=catalogue.find(c=>c.id===String(payload.destinationId));if(!city)throw new PlannerError('Choose a known destination.');
  if(!Array.isArray(payload.stops)||payload.stops.length>28)throw new PlannerError('Map a valid itinerary.');
  let guide=includedGuide(city);if(!guide){try{guide=JSON.parse(fs.readFileSync(path.join(dataDir,'places',city.id+'.json'),'utf8'));}catch{}}
  const allowed=preparePlaces(guide?.attractions||[],city);
  const selected=payload.stops.map((s,index)=>{const source=allowed.find(p=>normal(p.name)===normal(s.name));if(!source)throw new PlannerError('This place is not in the sourced destination guide.');return {...source,displayId:s.id,day:Number(s.day)||1,number:Number(s.number)||index+1};});
  const cacheDir=path.join(dataDir,'maps');fs.mkdirSync(cacheDir,{recursive:true});
  const cacheFile=path.join(cacheDir,city.id+'.json');let cache={};try{cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'));}catch{}
  for(const stop of selected){const saved=cache[normal(stop.name)];if(!Number.isFinite(stop.lat)&&saved){stop.lat=saved.lat;stop.lng=saved.lng;stop.coordinateSource=saved.source;}}
  const missing=selected.filter(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng));
  if(missing.length){try{
    const args=new URLSearchParams({action:'query',format:'json',redirects:'1',prop:'coordinates',coprimary:'primary',titles:missing.map(p=>aliases[p.name]||p.name).join('|')});
    const res=await fetch('https://en.wikipedia.org/w/api.php?'+args,{headers:{'User-Agent':'Waypoint-Local-Prototype/1.0 (source-based itinerary map)'},signal:AbortSignal.timeout(9000)});
    if(res.ok){const data=await res.json(),q=data.query||{},redirects=Object.fromEntries([...(q.normalized||[]),...(q.redirects||[])].map(p=>[p.from,p.to]));const pages=Object.fromEntries(Object.values(q.pages||{}).map(p=>[p.title,p]));
      for(const stop of missing){const title=aliases[stop.name]||stop.name,p=pages[redirects[title]||title],c=p?.coordinates?.[0];if(c && distance(city,{lat:c.lat,lng:c.lon})<=85){stop.lat=c.lat;stop.lng=c.lon;stop.coordinateSource='https://en.wikipedia.org/wiki/'+encodeURIComponent(p.title);cache[normal(stop.name)]={lat:stop.lat,lng:stop.lng,source:stop.coordinateSource};}}
    }
  }catch{}}
  const stillMissing=selected.filter(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng));
  if(stillMissing.length){try{
    const pattern=stillMissing.map(p=>p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|').replaceAll('"','\\"');
    const query=`[out:json][timeout:15];nwr(around:70000,${city.lat},${city.lng})["name"~"^(${pattern})$",i];out center 30;`;
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(20000)});
    if(res.ok){const data=await res.json();for(const stop of stillMissing){const p=(data.elements||[]).find(p=>normal(p.tags?.['name:en']||p.tags?.name)===normal(stop.name));const lat=p?.lat??p?.center?.lat,lng=p?.lon??p?.center?.lon;if(Number.isFinite(lat)&&Number.isFinite(lng)&&distance(city,{lat,lng})<=85){stop.lat=lat;stop.lng=lng;stop.coordinateSource=`https://www.openstreetmap.org/${p.type}/${p.id}`;cache[normal(stop.name)]={lat,lng,source:stop.coordinateSource};}}}
  }catch{}}
  fs.writeFileSync(cacheFile,JSON.stringify(cache));
  const points=selected.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  let route=null;
  if(payload.route&&points.length>=2&&points.length<=6){
    const coords=points.map(p=>`${p.lng},${p.lat}`).join(';'),key=crypto.createHash('sha256').update(coords).digest('hex'),file=path.join(cacheDir,'route-'+key+'.json');
    try{if(fs.existsSync(file))route=JSON.parse(fs.readFileSync(file,'utf8'));else route=await serialRoute(async()=>{
      const res=await fetch(config.osrmUrl+'/route/v1/driving/'+coords+'?overview=full&geometries=geojson&radiuses='+points.map(()=>1000).join(';'),{headers:{'User-Agent':'Waypoint-Local-Prototype/1.0'},signal:AbortSignal.timeout(10000)});
      if(!res.ok)return null;const data=await res.json(),r=data.routes?.[0];if(data.code!=='Ok'||!r)return null;const result={geometry:r.geometry,distance:r.distance,duration:r.duration,mode:'Driving',source:'OSRM / OpenStreetMap'};fs.writeFileSync(file,JSON.stringify(result));return result;
    });}catch{route=null;}
  }
  return {city:{name:city.name,lat:city.lat,lng:city.lng},points:points.map(p=>({id:p.displayId,name:p.name,lat:p.lat,lng:p.lng,day:p.day,number:p.number,source:p.coordinateSource||p.source,mapUrl:p.mapUrl})),unresolved:selected.filter(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng)).map(p=>({id:p.displayId,name:p.name,mapUrl:p.mapUrl})),route};
}

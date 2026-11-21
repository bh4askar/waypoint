import fs from 'node:fs';
import path from 'node:path';
import { PlannerError } from './planner.mjs';
let running = null;
let lastRequest = 0;

export async function discoverPlaces(city, dataDir) {
  fs.mkdirSync(path.join(dataDir,'places'),{recursive:true});
  const cache=path.join(dataDir,'places',city.id+'.json');
  if(fs.existsSync(cache)){
    const saved=JSON.parse(fs.readFileSync(cache,'utf8'));
    if(Date.now()-new Date(saved.retrieved).getTime()<7*86400000 && saved.attractions?.length)return saved;
  }
  if(running || Date.now()-lastRequest<3000)throw new PlannerError('Nearby-place discovery is busy. Please wait a few seconds and try again.',429);
  lastRequest=Date.now();
  running=(async()=>{
    const query=`[out:json][timeout:20];(nwr(around:7000,${city.lat},${city.lng})[tourism~"^(attraction|museum|viewpoint|gallery)$"][name];nwr(around:7000,${city.lat},${city.lng})[historic~"^(castle|fort|monument|ruins)$"][name];nwr(around:7000,${city.lat},${city.lng})[leisure=park][name];);out center 70;`;
    const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(28000)});
    if(!response.ok)throw new Error('The public place-data service is unavailable.');
    const data=await response.json();
    const attractions=(data.elements||[]).filter(p=>p.tags?.name).map(p=>{
      const tag=p.tags.tourism||p.tags.historic||p.tags.leisure||'attraction';
      return {name:p.tags['name:en']||p.tags.name,lat:p.lat??p.center?.lat??null,lng:p.lon??p.center?.lon??null,kind:tag,
        address:[p.tags['addr:street'],p.tags['addr:suburb']].filter(Boolean).join(', '),
        description:p.tags.description||`${p.tags['name:en']||p.tags.name} is mapped as a ${tag.replaceAll('_',' ')} near ${city.name}. Explore the site at your own pace and use the linked map record to check location and access.`,
        source:`https://www.openstreetmap.org/${p.type}/${p.id}`,venueUrl:p.tags.website||p.tags['contact:website']||'',lastEdit:''};
    });
    if(attractions.length<2)throw new PlannerError(`There are not enough mapped attractions near ${city.name} for a useful detailed itinerary yet. Try a nearby destination.`,422);
    const guide={attractions,restaurants:[],source:'https://www.openstreetmap.org/copyright',sourceType:'OpenStreetMap',retrieved:new Date().toISOString()};
    fs.writeFileSync(cache,JSON.stringify(guide));return guide;
  })();
  try{return await running;}catch(error){if(error instanceof PlannerError)throw error;throw new PlannerError('Nearby-place discovery could not connect. Choose a destination with an included guide, or try again when online.',503);}finally{running=null;}
}

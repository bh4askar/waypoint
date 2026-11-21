import fs from 'node:fs';
import path from 'node:path';
import {attachIncludedPhotos,enrichPhotos,validLandmarkPhoto} from './photos.mjs';
let photoCache=null;const jobs=new Set();
export function immediatePhotos(plan,data,index,cover){
 attachIncludedPhotos(plan,index);
 if(!photoCache){try{photoCache=JSON.parse(fs.readFileSync(path.join(data,'media','photos.json'),'utf8'));}catch{photoCache={};}}
 for(const stop of plan.days.flatMap(d=>d.stops)){const key=(stop.guideCityId||plan.destination.id)+'|'+stop.name,cached=photoCache[key];if(!stop.photo&&validLandmarkPhoto(key,stop.name,cached))stop.photo=cached;}
 const pending=structuredClone(plan);
 plan.coverPhoto=cover||plan.days.flatMap(d=>d.stops).find(s=>s.photo)?.photo||null;
 if(jobs.size<2&&!jobs.has(plan.destination.id)&&pending.days.some(d=>d.stops.some(s=>!s.photo))){
  jobs.add(plan.destination.id);
  enrichPhotos(pending,data,index,cover).then(enriched=>{for(const stop of enriched.days.flatMap(d=>d.stops))if(stop.photo?.scope==='place')photoCache[plan.destination.id+'|'+stop.name]=stop.photo;}).catch(()=>{}).finally(()=>jobs.delete(plan.destination.id));
 }
 return plan;
}

import fs from 'node:fs';
import {catalogue,guides,publicDestination} from '../lib/data.mjs';
import {combinePhotoIndexes} from '../lib/external-photos.mjs';
const root=new URL('../',import.meta.url);
const places=combinePhotoIndexes(JSON.parse(fs.readFileSync(new URL('lib/place-photos.json',root),'utf8')));
const invalid=[];
function gallery(record){return (record?.photos|| (record?[record]:[])).filter(photo=>{
  if(!photo.identitySource||!photo.source||!photo.license||!/^\/assets\/(?:destinations|places|exact)\/[a-zA-Z0-9_.-]+\.jpg$/.test(photo.image))return false;
  const path=new URL('public'+photo.image,root);
  try{const file=fs.readFileSync(path);if(file.length<500||file[0]!==255||file[1]!==216){invalid.push(photo.image);return false;}}catch{invalid.push(photo.image);return false;}
  return true;
});}
const destinations=catalogue.map(city=>({key:city.id,kind:'destination',name:city.name,region:city.region,country:city.country,photos:gallery(publicDestination(city))}));
const landmarks=catalogue.flatMap(city=>(guides[city.id]?.attractions||[]).map(stop=>({key:city.id+'|'+stop.name,kind:'landmark',name:stop.name,city:city.name,photos:gallery(places[city.id+'|'+stop.name])})));
const counts=rows=>({total:rows.length,withPhotos:rows.filter(r=>r.photos.length).length,withMultiplePhotos:rows.filter(r=>r.photos.length>1).length});
const report={checkedAt:new Date().toISOString(),destinations:counts(destinations),landmarks:counts(landmarks),invalidFiles:[...new Set(invalid)],verification:'All counted photographs are included local JPEG files with subject, source and attribution. Source identity uses entity IDs, article coordinates, named captions or reviewed venue addresses; this is not an independent human verification of every scene.',policy:'Landmark cards use their own photographs. No city-cover substitution. Unmatched guide entries remain explicitly without an exact photograph.',subjects:[...destinations,...landmarks].map(({photos,...row})=>({...row,count:photos.length,status:photos.length?'included original source photographs':'no exact source photograph matched',sources:photos.map(p=>p.source)}))};
fs.writeFileSync(new URL('public/assets/photo-coverage.json',root),JSON.stringify(report,null,2));
fs.writeFileSync(new URL('public/assets/destination-photo-credits.json',root),JSON.stringify(Object.fromEntries(destinations.map(r=>[r.key,{...r.photos[0],photos:r.photos}])),null,2));
fs.writeFileSync(new URL('public/assets/place-photo-credits.json',root),JSON.stringify(Object.fromEntries(landmarks.filter(r=>r.photos.length).map(r=>[r.key,{...r.photos[0],photos:r.photos}])),null,2));
console.log(JSON.stringify({destinations:report.destinations,landmarks:report.landmarks,invalidFiles:report.invalidFiles}));
if(report.invalidFiles.length||report.destinations.withPhotos!==1100)process.exitCode=1;

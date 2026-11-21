import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { distance } from './planner.mjs';
import {catalogue} from './data.mjs';
const clean=value=>String(value||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim().slice(0,200);
const normal=value=>String(value).toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const rejectedPhotos=JSON.parse(fs.readFileSync(new URL('./photo-rejections.json',import.meta.url),'utf8'));
const rejectedPhoto=(key,photo)=>rejectedPhotos.some(item=>item.key===key&&item.source===photo?.source);
export const validLandmarkPhoto=(key,name,photo)=>Boolean(photo?.identitySource&&photo.scope==='place'&&normal(photo.subject)===normal(name)&&!rejectedPhoto(key,photo));
export function attachIncludedPhotos(plan,index) {
  for(const day of plan.days)for(const stop of [...day.stops,...(day.alternative?[day.alternative]:[])]){
    const sourceCity=stop.guideCityId?catalogue.find(c=>c.id===stop.guideCityId):stop.guideCity?catalogue.find(c=>c.name===stop.guideCity&&c.countryCode===plan.destination.countryCode&&distance(c,plan.destination)<=60):plan.destination;
    const key=`${sourceCity?.id||plan.destination.id}|${stop.name}`;
    const direct=index[key];
    if(direct?.identitySource&&!rejectedPhoto(key,direct))stop.photo={...direct,scope:'place'};
    else if(!stop.photo?.identitySource||stop.photo.scope!=='place'||normal(stop.photo.subject)!==normal(stop.name)||rejectedPhoto(key,stop.photo))delete stop.photo;
  }
  return plan;
}
async function wikipedia(params,host='en.wikipedia.org') {
  const url=`https://${host}/w/api.php?`+new URLSearchParams({action:'query',format:'json',...params});
  const res=await fetch(url,{headers:{'User-Agent':'Waypoint-Local-Prototype/1.0 (educational travel planner; source credits retained)'},signal:AbortSignal.timeout(9000)});
  if(!res.ok)throw new Error('Photos unavailable.');return res.json();
}
export async function enrichPhotos(plan,dataDir,index,cityPhoto=null) {
  attachIncludedPhotos(plan,index);
  const stops=plan.days.flatMap(d=>d.stops),missing=stops.filter(p=>!p.photo).slice(0,21);
  const dir=path.join(dataDir,'media');fs.mkdirSync(dir,{recursive:true});
  const metadataFile=path.join(dir,'photos.json');let cache={};try{cache=JSON.parse(fs.readFileSync(metadataFile,'utf8'));}catch{}
  for(const stop of missing){const key=(stop.guideCityId||plan.destination.id)+'|'+stop.name;const photo=cache[key];if(photo?.identitySource&&photo.scope==='place'&&normal(photo.subject)===normal(stop.name)&&!rejectedPhoto(key,photo))stop.photo=photo;}
  const remaining=missing.filter(p=>!p.photo);
  if(remaining.length){try{
    const names=[...new Set(remaining.flatMap(s=>[s.name,s.name+', '+plan.destination.name]))];
    const data=await wikipedia({titles:names.slice(0,50).join('|'),prop:'pageimages|coordinates|pageprops',piprop:'thumbnail|name',pithumbsize:'900',pilicense:'free',redirects:'1'});
    const q=data.query||{},normalised=Object.fromEntries([...(q.normalized||[]),...(q.redirects||[])].map(x=>[x.from,x.to]));
    const pages=Object.fromEntries(Object.values(q.pages||{}).map(p=>[p.title,p]));
    const files=[...new Set(Object.values(pages).filter(p=>p.pageimage&&p.thumbnail&&!/\.svg$|logo|locator|location map|district map/i.test(p.pageimage)).map(p=>'File:'+p.pageimage))];
    let credits={};
    if(files.length){const info=await wikipedia({titles:files.join('|'),prop:'imageinfo',iiprop:'extmetadata'},'commons.wikimedia.org');credits=Object.fromEntries(Object.values(info.query?.pages||{}).map(p=>[p.title.replace(/^File:/,'').replaceAll('_',' '),p.imageinfo?.[0]?.extmetadata||{}]));}
    for(let i=0;i<remaining.length;i+=3){await Promise.allSettled(remaining.slice(i,i+3).map(async stop=>{
      const candidates=[stop.name+', '+plan.destination.name,stop.name].map(name=>pages[normalised[name]||name]);
      const p=candidates.find(page=>{if(!page?.thumbnail||page.pageprops?.disambiguation!==undefined)return false;const coord=page.coordinates?.[0];if(!coord)return false;const anchor=Number.isFinite(stop.lat)&&Number.isFinite(stop.lng)?stop:plan.destination;return distance(anchor,{lat:coord.lat,lng:coord.lon})<(anchor===stop?3:65);});
      if(!p||/\.svg$|logo|locator|location map|district map/i.test(p.pageimage||''))return;
      const title=p.title;
      const key=(stop.guideCityId||plan.destination.id)+'|'+stop.name;
      const identityText=normal(title+' '+p.pageimage);
      if(!identityText.includes(normal(stop.name)))return;
      const src=new URL(p.thumbnail.source);if(!['upload.wikimedia.org','thumb.wikimedia.org'].includes(src.hostname)||src.protocol!=='https:')return;
      const ext=credits[p.pageimage.replaceAll('_',' ')]||{},license=clean(ext.LicenseShortName?.value);if(!license||/logo|flag|map of/i.test(clean(ext.ImageDescription?.value)))return;
      const res=await fetch(src,{signal:AbortSignal.timeout(8000)});if(!res.ok||Number(res.headers.get('content-length'))>3000000)return;
      const bytes=Buffer.from(await res.arrayBuffer());if(bytes.length>3000000||bytes.length<1000||bytes[0]!==255||bytes[1]!==216)return;
      const id=crypto.createHash('sha256').update(src.href).digest('hex');fs.writeFileSync(path.join(dir,id+'.jpg'),bytes);
      const photo={image:'/media/'+id+'.jpg',scope:'place',subject:stop.name,resolvedSubject:title,identitySource:'https://en.wikipedia.org/wiki/'+encodeURIComponent(title),source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(p.pageimage),artist:clean(ext.Artist?.value),license,licenseUrl:clean(ext.LicenseUrl?.value)};
      if(rejectedPhoto(key,photo))return;
      stop.photo=photo;cache[key]=photo;
    }));}
    fs.writeFileSync(metadataFile,JSON.stringify(cache));
  }catch{/* Missing photos never prevent a sourced itinerary. */}}
  return plan;
}

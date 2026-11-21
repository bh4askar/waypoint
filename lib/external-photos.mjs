import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
sharp.concurrency(1);sharp.cache(false);
const records=JSON.parse(fs.readFileSync(new URL('./external-photo-sources.json',import.meta.url),'utf8'));
const includedSourceFiles=JSON.parse(fs.readFileSync(new URL('./source-photo-files.json',import.meta.url),'utf8'));
const sources=new Map(),pending=new Map();let active=0;const waiting=[];
function publicUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!/^(?:localhost|\[|(?:\d{1,3}\.){3}\d{1,3}$)/.test(url.hostname)&&!url.hostname.endsWith('.local');}catch{return false;}}
export const externalPhotoIndex=Object.fromEntries(Object.entries(records).map(([key,record])=>{
  const photos=(record.photos||[]).filter(photo=>publicUrl(photo.url)&&publicUrl(photo.source)).map(({url,...photo})=>{
    const id=crypto.createHash('sha256').update(url).digest('hex');
    sources.set(id,url);
    const included=includedSourceFiles[url]?.image;
    if(included&&/^\/assets\/exact\/[a-f0-9]{64}\.jpg$/.test(included)&&fs.existsSync(new URL('../public'+included,import.meta.url)))return {...photo,image:included};
    return null;
  }).filter(Boolean);return [key,photos.length?{...photos[0],photos}:null];
}).filter(([,value])=>value));
export function combinePhotoIndexes(included){
  const merged={...included};for(const [key,external] of Object.entries(externalPhotoIndex)){
    const original=included[key],seen=new Set();
    const photos=[...(original?.photos|| (original?[original]:[])),...external.photos].filter(photo=>{if(seen.has(photo.image))return false;seen.add(photo.image);return true;}).slice(0,5);
    merged[key]={...photos[0],photos};
  }return merged;
}
export function imageMime(bytes){
  if(bytes[0]===255&&bytes[1]===216)return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  if(bytes.toString('ascii',0,3)==='GIF')return 'image/gif';return null;
}
export async function cacheSourceImage(id,dataDir){
  const url=sources.get(id);if(!url)return null;
  const dir=path.join(dataDir,'media'),file=path.join(dir,id+'.jpg');fs.mkdirSync(dir,{recursive:true});
  if(fs.existsSync(file))return file;if(pending.has(id))return pending.get(id);
  const job=(async()=>{
    if(active>=2)await new Promise(resolve=>waiting.push(resolve));active++;
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok||!publicUrl(response.url)||Number(response.headers.get('content-length'))>8000000)throw new Error('Source photo unavailable.');
      const parts=[];let length=0;for await(const part of response.body){length+=part.length;if(length>8000000)throw new Error('Source photo is too large.');parts.push(part);}
      const bytes=Buffer.concat(parts);if(!imageMime(bytes))throw new Error('Source did not return an image.');
      const jpeg=await sharp(bytes,{limitInputPixels:32000000}).rotate().resize({width:900,height:700,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:80,mozjpeg:true}).toBuffer();
      fs.writeFileSync(file+'.download',jpeg);fs.renameSync(file+'.download',file);
      // Bound only this on-demand source cache; account files and other caches remain separate.
      const cached=[...sources.keys()].map(key=>path.join(dir,key+'.jpg')).filter(name=>fs.existsSync(name)).map(name=>({name,stat:fs.statSync(name)})).sort((a,b)=>a.stat.mtimeMs-b.stat.mtimeMs);
      let total=cached.reduce((sum,item)=>sum+item.stat.size,0);for(const item of cached){if(total<=96*1024*1024)break;if(item.name!==file){fs.unlinkSync(item.name);total-=item.stat.size;}}
      return file;
    }finally{active--;waiting.shift()?.();}
  })().finally(()=>pending.delete(id));pending.set(id,job);return job;
}
export async function prepareSourcePdfImages(plan,dataDir){
  const photos=[plan.coverPhoto,...plan.days.flatMap(day=>day.stops.map(stop=>stop.photo))].filter(Boolean);
  await Promise.allSettled(photos.map(async photo=>{
    const id=photo.image?.match(/^\/media\/([a-f0-9]{64})\.jpg$/)?.[1];if(!id)return;
    const file=await cacheSourceImage(id,dataDir);if(!file||imageMime(fs.readFileSync(file).subarray(0,12))==='image/jpeg')return;
    for(const alternative of photo.photos||[]){const other=alternative.image?.match(/^\/media\/([a-f0-9]{64})\.jpg$/)?.[1];if(!other)continue;try{const candidate=await cacheSourceImage(other,dataDir);if(candidate&&imageMime(fs.readFileSync(candidate).subarray(0,12))==='image/jpeg'){Object.assign(photo,alternative);return;}}catch{}}
  }));
}

import {catalogue,guides} from './data.mjs';
import {preparePlaces,distance} from './planner.mjs';
const resolved=new Map();
const prepared=new Map(catalogue.map(city=>[city.id,preparePlaces(guides[city.id]?.attractions||[],city)]));
export function includedGuide(city){
 if(resolved.has(city.id))return resolved.get(city.id);
 const own=prepared.get(city.id)||[];
 if(own.length>=2){resolved.set(city.id,guides[city.id]);return guides[city.id];}
 const neighbours=catalogue.filter(c=>c.id!==city.id&&c.countryCode===city.countryCode&&guides[c.id]&&distance(c,city)<=60).sort((a,b)=>distance(a,city)-distance(b,city));
 const attractions=[...own],names=new Set(own.map(p=>p.name.toLowerCase())),sources=[];
 for(const neighbour of neighbours){
  let added=false;
  for(const stop of prepared.get(neighbour.id)||[]){
   if(!Number.isFinite(stop.lat)||!Number.isFinite(stop.lng)||distance(stop,city)>60||names.has(stop.name.toLowerCase()))continue;
   names.add(stop.name.toLowerCase());attractions.push({...stop,guideCity:neighbour.name,guideCityId:neighbour.id});added=true;
  }
  if(added)sources.push(neighbour.name);
 }
 const result=attractions.length>=2?{attractions,restaurants:[],source:guides[city.id]?.source||neighbours[0]?.guideUrl,sourceType:'Nearby sourced guides',retrieved:guides[neighbours[0]?.id]?.retrieved,nearbyCities:sources}:null;
 resolved.set(city.id,result);return result;
}
export function readyAlternatives(city,limit=4){return catalogue.filter(c=>c.id!==city.id&&c.countryCode===city.countryCode&&includedGuide(c)).sort((a,b)=>distance(a,city)-distance(b,city)).slice(0,limit);}

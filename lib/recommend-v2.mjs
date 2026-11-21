import {catalogue,publicDestination} from './data.mjs';
import {inferInterests} from './preference-model.mjs';
import {preparePlaces,distance} from './planner.mjs';
import {includedGuide} from './guide-resolver.mjs';
const patterns={adventure:/advent|advet|adevet|trek|hiking|raft|thrill|adrenaline|climbing|exciting|active|sport/,beach:/beach|seaside|coast|ocean|island|sea\b|honeymoon/,nature:/nature|mountain|peaceful|quiet|relax|scenic|forest|chill|lake|waterfall|snow|cold|winter|disconnect|burnt out/,culture:/culture|history|historic|temple|museum|heritage|palace|architecture|fort\b/,food:/food|cuisine|cafe|coffee|street food|foodie|eat|dishes/,shopping:/shop|market|craft/};
const labels={adventure:'adventure',beach:'beaches',nature:'nature and scenery',culture:'history and culture',food:'local food',shopping:'markets and crafts'};
const specialist={Manali:['adventure','nature'],Rishikesh:['adventure','nature'],Leh:['adventure','nature'],Gangtok:['adventure','nature'],Munnar:['nature'],Ooty:['nature'],Darjeeling:['nature'],Shimla:['nature'],Panjim:['beach','food'],Gokarna:['beach'],Varkala:['beach'],Mormugao:['beach'],Jaipur:['culture','shopping'],Agra:['culture'],Varanasi:['culture'],Amritsar:['culture','food'],Mumbai:['food'],Kochi:['food','nature'],Kyoto:['culture'],Paris:['culture'],Ubud:['nature']};
const index=catalogue.map(city=>{
 const guide=includedGuide(city),places=preparePlaces(guide?.attractions||[],city),counts={};
 for(const place of places)for(const tag of place.tags)counts[tag]=(counts[tag]||0)+1;
 return {city,places,counts,destination:{...publicDestination(city),guideCount:places.length,guideScope:guide?.nearbyCities?'nearby':'destination'},search:[city.name,...city.aliases.filter(a=>a.length>3)].map(s=>s.toLowerCase())};
});
const regions=[...new Set(catalogue.filter(c=>c.countryCode==='IN').map(c=>c.region))].filter(Boolean);
const countries=[...new Set(catalogue.map(c=>c.country))];
const escapes=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function mention(text,name){return new RegExp('(?:^|\\W)'+escapes(name.toLowerCase())+'(?:$|\\W)','i').test(text);}
export function parsePreferences(message,previous={}){
 const text=String(message||'').trim().slice(0,800),lower=text.toLowerCase();
 const explicit=Object.entries(patterns).filter(([,re])=>re.test(lower)).map(([key])=>key);
 let interests=explicit.length?explicit:inferInterests(lower).map(x=>x.interest);
 if(!interests.length)interests=previous.interests?.length?previous.interests:['nature','culture'];
 const negated=Object.entries(patterns).filter(([tag])=>new RegExp('(?:no|not|avoid|without|don.t want)\\s+(?:\\w+\\s+){0,2}'+(tag==='nature'?'mountains?':tag==='culture'?'(?:history|temples?|museums?)':tag+'\\w*')).test(lower)).map(([tag])=>tag);
 interests=interests.filter(t=>!negated.includes(t));
 let country=countries.find(c=>mention(lower,c))||null;
 if(/indian|within india|only india/.test(lower))country='India';
 let region=regions.find(r=>mention(lower,r))||null;
 const outside=/abroad|international|outside india|overseas/.test(lower),anyLocation=/anywhere|any place|any country|no location preference/.test(lower);
 if(!country&&!region&&!outside&&!anyLocation){country=previous.country||null;region=previous.region||null;}
 if(country&&country!==previous.country&&!region)region=null;
 const named=index.filter(entry=>entry.search.some(name=>mention(lower,name))).sort((a,b)=>b.places.length-a.places.length);
 const days=lower.match(/(\d+)\s*(?:day|days)/)?.[1],travellers=lower.match(/(\d+)\s*(?:people|persons?|travellers?|travelers?|friends)/)?.[1];
 const amount=lower.match(/(?:₹|rs\.?|inr|budget(?:\s+(?:of|is))?)\s*([\d,]+(?:\.\d+)?)\s*(k|thousand)?/),budget=amount?Math.round(Number(amount[1].replaceAll(',',''))*(amount[2]?1000:1)):null;
 return {interests:interests.length?interests:['nature'],primary:interests[0]||'nature',country:anyLocation?null:outside?null:country,region:anyLocation?null:region,abroad:outside||(country?false:previous.abroad||false),namedIds:named.map(e=>e.city.id),days:days?Math.min(7,Math.max(1,Number(days))):previous.days||null,travellers:travellers?Math.min(12,Math.max(1,Number(travellers))):previous.travellers||null,budget:budget||previous.budget||null,notes:text};
}
export function recommend(message,previous={}){
 const preferences=parsePreferences(message,previous),{interests,primary}=preferences,anchor=index.find(e=>preferences.namedIds.includes(e.city.id));
 const ranked=index.filter(e=>e.places.length>=2&&(!preferences.region||e.city.region===preferences.region)&&(!preferences.country||e.city.country===preferences.country)&&(!preferences.abroad||e.city.countryCode!=='IN')).map(entry=>{
  const special=(entry.city.name==='Manali'&&entry.city.region!=='Himachal Pradesh')|| (entry.destination.guideScope==='nearby'&&!entry.places.some(p=>/beach/i.test(p.name)))?[]:specialist[entry.city.name]||[],strength=tag=>Math.min(1,(entry.counts[tag]||0)/Math.max(3,entry.places.length*.35))+(special.includes(tag)?1.5:0);
  const primaryStrength=strength(primary),matched=interests.filter(t=>strength(t)>.12).sort((a,b)=>strength(b)-strength(a)),named=preferences.namedIds.includes(entry.city.id);
  const score=primaryStrength*32+interests.slice(1).reduce((s,t)=>s+strength(t)*6,0)+(named?100:0)+(entry.destination.image?2:0)+Math.min(entry.places.length,15)*.12+(entry.city.countryCode==='IN'&&!preferences.country&&!preferences.abroad?3:0)-(anchor&&!named?Math.min(distance(anchor.city,entry.city)/60,12):0);
  const evidence=entry.places.filter(p=>p.tags.includes(primary)).slice(0,2).map(p=>p.name);
  const reason=evidence.length?`${evidence.join(' and ')} match your interest in ${labels[primary]}.`:special.includes(primary)?`${entry.city.name} fits ${labels[primary]}, with ${entry.places.length} sourced stops for planning.`:`${entry.city.name} has ${entry.places.length} sourced places to explore.`;
  return {...entry.destination,tags:[...new Set([...special,...Object.keys(entry.counts)])],matched:[primary,...matched.filter(t=>t!==primary)],score,reason,evidence,primaryStrength};
 }).filter(e=>e.primaryStrength>.12||preferences.namedIds.includes(e.id)).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
 const seen=new Set(),unique=ranked.filter(e=>{const key=e.name+'|'+e.countryCode;if(seen.has(key))return false;seen.add(key);return true;});
 const excluded=new Set(previous.excludeIds||[]),more=/show (?:me )?more|other places|different places|alternatives|what else/.test(String(message).toLowerCase())&&!preferences.namedIds.length,items=(more?unique.filter(e=>!excluded.has(e.id)):unique).slice(0,4);
 const context=[preferences.region||preferences.country||(preferences.abroad?'outside India':'India and abroad'),preferences.days?`${preferences.days} days`:null,preferences.travellers?`${preferences.travellers} travellers`:null,preferences.budget?`₹${preferences.budget.toLocaleString('en-IN')} group budget`:null].filter(Boolean).join(' · ');
 let response=items.length?`For ${labels[primary]}${preferences.region?' in '+preferences.region:preferences.country?' in '+preferences.country:''}, I’d start with ${items.slice(0,2).map(d=>d.name).join(' or ')}. ${items[0].reason} Open a place below to shape the itinerary around your dates, budget and group.`:`I couldn’t find a ready guide matching ${labels[primary]}${preferences.region?' in '+preferences.region:''}. Would you consider a nearby region or another kind of trip?`;
 if(/^\s*(hi|hello|hey)[!.\s]*$/i.test(message))response='Hi! What kind of trip do you want—an active adventure, a quiet beach, mountains, history, or food? Tell me a region too, if you have one in mind.';
 return {...preferences,support:/pdf|download|sign.?in|how.*save|how.*plan|what.*budget.*include/i.test(message),message:response,items,context,engine:'Local preference model + sourced destination matching',excludeIds:items.map(d=>d.id)};
}

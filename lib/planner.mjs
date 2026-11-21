import { catalogue, guides, categories, currencyRates, costTier } from './data.mjs';
import { inferInterests } from './preference-model.mjs';
import crypto from 'node:crypto';

export class PlannerError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateInput(raw) {
  const city = catalogue.find(d => d.id === String(raw.destinationId));
  if (!city) throw new PlannerError('Choose a destination from the list.');
  const days = Number(raw.days), travellers = Number(raw.travellers), budget = Number(raw.budget);
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new PlannerError('Choose a trip between 1 and 7 days.');
  if (!Number.isInteger(travellers) || travellers < 1 || travellers > 12) throw new PlannerError('Choose between 1 and 12 travellers.');
  if (!['INR','USD','EUR','GBP'].includes(raw.currency)) throw new PlannerError('Choose a supported currency.');
  if (!Number.isFinite(budget) || budget <= 0 || budget > 10000000) throw new PlannerError('Enter a positive total budget.');
  const date = String(raw.startDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date) throw new PlannerError('Choose a valid start date.');
  if (!['relaxed','balanced','active'].includes(raw.pace)) throw new PlannerError('Choose a travel pace.');
  const interests = Array.isArray(raw.interests) ? [...new Set(raw.interests.filter(x => categories.includes(x)))] : [];
  const notes = String(raw.notes || '').trim().slice(0, 600);
  const learned = inferInterests(notes);
  for (const x of learned) if (!interests.includes(x.interest)) interests.push(x.interest);
  if (!interests.length) interests.push('culture','nature');
  return { destinationId: city.id, days, travellers, budget, currency: raw.currency, startDate: date, pace: raw.pace,
    interests, notes, weather: raw.weather === 'rain' ? 'rain' : 'normal', startLate: Boolean(raw.startLate), useAi: Boolean(raw.useAi), learned };
}

export function distance(a, b) {
  if (![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite)) return null;
  const rad = Math.PI / 180, dl = (b.lat-a.lat)*rad, dn = (b.lng-a.lng)*rad;
  const x = Math.sin(dl/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1,x)), Math.sqrt(Math.max(0,1-x)));
}

export function placeTags(place) {
  const text = `${place.name} ${place.description} ${place.kind}`.toLowerCase();
  const tags = [];
  const patterns = { culture: /museum|temple|fort|palace|heritage|historic|church|mosque|art |architecture|shrine|monument|cathedral|castle/,
    nature: /garden|park|lake|river|forest|mountain|waterfall|botanical|wildlife|scenic|terrace/,
    beach: /beach|coast|sea |ocean|seaside|shore/, adventure: /hike|hiking|trek|climb|cycling|trail|rafting|kayak|surf/,
    food: /food|cuisine|cafe|coffee|cooking|restaurant|market/, shopping: /market|bazaar|craft|shop|boutique|souvenir/ };
  for (const [tag, regex] of Object.entries(patterns)) if (regex.test(text)) tags.push(tag);
  return tags.length ? tags : ['culture'];
}

export function preparePlaces(rawPlaces, city) {
  const seen = new Set();
  return rawPlaces.filter(p => {
    const key = p.name.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
    if (!p.name || seen.has(key) || /durga\s*puja|diwali|holi festival|ganesh chaturthi|rath yatra|annual festival|music festival|marathon/i.test(p.name)) return false; seen.add(key);
    const d = distance(p, city); return d === null || d <= 65;
  }).map((p, index) => {
    const tags = placeTags(p), text = `${p.name} ${p.description}`;
    const duration = p.duration || (/fort|palace|museum|castle|temple complex|hike|trail|zoo|aquarium/i.test(text) ? 120 : /garden|park|lake|market|beach/i.test(text) ? 90 : 60);
    return { ...p, id: `${city.id}-${index}`, tags, duration,
      indoor: /museum|gallery|palace|aquarium|church|cathedral|shopping mall|science centre/i.test(text),
      source: /^https?:\/\//.test(p.source || '') ? p.source : city.guideUrl,
      venueUrl: /^https?:\/\//.test(p.venueUrl || '') ? p.venueUrl : null,
      mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ', ' + city.name + ', ' + city.country)}`,
    };
  });
}

function transfer(from, to) {
  if(from.cluster && to.cluster && from.cluster===to.cluster && !(Number.isFinite(from.lat)&&Number.isFinite(to.lat)))return {text:'Allow 20-40 min for a local transfer within this area; confirm the exact route.',minutes:30,km:null,mode:'Local transport'};
  if(from.cluster && to.cluster && from.cluster!==to.cluster && from.outboundMinutes && to.outboundMinutes && !(Number.isFinite(from.lat)&&Number.isFinite(to.lat))){const min=from.outboundMinutes+to.outboundMinutes;return {text:`These stops are in different areas. Allow roughly ${Math.max(30,min-20)}-${min+25} min by road and verify the route.`,minutes:min,km:null,mode:'Longer transfer'};}
  if(to.outboundMinutes && !(Number.isFinite(from.lat)&&Number.isFinite(to.lat)))return {text:`Allow roughly ${Math.max(15,to.outboundMinutes-15)}-${to.outboundMinutes+20} min by local transport; confirm the route.`,minutes:to.outboundMinutes,km:null,mode:'Local transport'};
  const km = distance(from, to);
  if (km === null) return { text: 'Check the route before setting out; exact location is not in this guide.', minutes: 35, km: null, mode: 'Route to check' };
  const roadKm = km * 1.4;
  if (roadKm < 1.5) {
    const min = Math.max(5, Math.ceil(roadKm / 4 * 60));
    return { text: `Allow roughly ${Math.max(5,min-5)}-${min+10} min on foot (estimated).`, minutes: min, km: Number(roadKm.toFixed(1)), mode: 'Walk' };
  }
  const min = Math.max(10, Math.ceil(roadKm / 22 * 60) + 10);
  return { text: `Allow roughly ${Math.max(10,min-10)}-${min+15} min by local transport (estimated).`, minutes: min, km: Number(roadKm.toFixed(1)), mode: 'Local transport' };
}

function dayDate(date, offset) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); }
function tidy(text, limit = 580) {
  const clean = String(text || '').replace(/\s+/g,' ').trim();
  if (clean.length <= limit) return clean;
  const part = clean.slice(0,limit), cut = part.lastIndexOf('. ');
  return cut > limit * 0.55 ? part.slice(0,cut+1) : part.slice(0,part.lastIndexOf(' ')) + '…';
}
const cuisine = { Rajasthan: 'a Rajasthani thali or local kachori', 'Uttar Pradesh': 'a regional thali or freshly prepared chaat', Kerala: 'a Kerala-style meal, appam or a vegetarian sadya', Karnataka: 'a South Indian meal or dosa', 'Tamil Nadu': 'idli, dosa or a traditional meals platter', Maharashtra: 'a Maharashtrian thali or local street-food favourites', Punjab: 'a Punjabi thali or stuffed kulcha', Goa: 'Goan curry with rice, with vegetarian options available', 'West Bengal': 'a Bengali meal and a local sweet', 'Himachal Pradesh': 'a Himachali meal or a warming local cafe lunch' };

export function buildPlan(raw, additionalGuide = null) {
  const input = validateInput(raw), city = catalogue.find(d => d.id === input.destinationId);
  const guide = additionalGuide || guides[city.id];
  if (!guide?.attractions?.length) throw new PlannerError(`We do not have enough sourced attractions for ${city.name} yet. Try nearby-place discovery, or choose another destination.`, 422);
  const all = preparePlaces(guide.attractions,city);
  if (all.length < 2) throw new PlannerError(`There are not enough sourced places for a detailed ${city.name} itinerary yet. Choose a nearby destination.`,422);
  const used = new Set(), tier = costTier(city), budgetInr = input.budget * currencyRates[input.currency];
  const groupUnit = input.travellers * input.days;
  const allowance = budgetInr/groupUnit;
  const frugal = allowance < 2500*tier;
  const perPerson = { accommodation: Math.round((frugal?850:1600)*tier), food:Math.round((frugal?550:1000)*tier), transport:Math.round((frugal?250:550)*tier), activities:Math.round((frugal?250:600)*tier) };
  const budget = Object.fromEntries(Object.entries(perPerson).map(([k,v]) => [k,Math.round(v*(k==='accommodation'?Math.max(0,input.days-1)*input.travellers:groupUnit)/currencyRates[input.currency])]));
  budget.total = Object.values(budget).reduce((a,b)=>a+b,0);
  budget.remaining = input.budget-budget.total; budget.requested=input.budget; budget.currency=input.currency;
  const dayPlans = [], warnings = [];
  if (budget.remaining < 0) warnings.push(`Your estimated trip cost is above the budget you entered. Consider a shorter trip, shared accommodation or lower-cost transport. The plan does not silently reduce estimates to make the budget fit.`);
  if (input.weather === 'rain') warnings.push('Rain is a planning scenario, not a weather forecast. Indoor options are prioritised; check access and local conditions.');
  const requestedPerDay = input.pace === 'relaxed' || input.startLate ? 2 : input.pace === 'active' ? 4 : 3;
  const scores = all.map(p => ({...p, match:p.tags.filter(t => input.interests.includes(t)).length*3 + (p.description?.length > 100 ? 2:0) + (p.lastEdit && p.lastEdit >= '2023' ? 1:0) + (input.weather === 'rain' ? (p.indoor?7:-4):0)}));
  let last = city;
  for (let d=0; d<input.days; d++) {
    const available = scores.filter(p=>!used.has(p.id));
    const remainingDays=input.days-d;
    const count = Math.min(requestedPerDay, Math.ceil(available.length / remainingDays));
    const chosen=[];
    let cursor=city,elapsed=60;
    const dailyMinutes=input.startLate?420:input.pace==='relaxed'?450:input.pace==='active'?690:570;
    for (let n=0;n<count;n++) {
      const candidates=available.filter(p=>!used.has(p.id)).sort((a,b)=>{
        const sa=a.match - Math.min(distance(cursor,a)??(a.outboundMinutes||30)/3,55)*0.35 + (cursor.cluster && a.cluster===cursor.cluster?8:0);
        const sb=b.match - Math.min(distance(cursor,b)??(b.outboundMinutes||30)/3,55)*0.35 + (cursor.cluster && b.cluster===cursor.cluster?8:0);
        return sb-sa || a.name.localeCompare(b.name);
      });
      const pick=candidates.find(p=>!chosen.length || elapsed+transfer(cursor,p).minutes+p.duration+(p.outboundMinutes||transfer(p,city).minutes)<=dailyMinutes); if(!pick)break;
      elapsed+=transfer(cursor,pick).minutes+pick.duration;
      used.add(pick.id);chosen.push(pick);cursor=pick;
    }
    if (chosen.length) last=chosen[chosen.length-1];
    const periods=chosen.length===2?['Late morning','Afternoon']:chosen.length===4?['Morning','Late morning','Afternoon','Evening']:['Morning','Afternoon','Evening'];
    let previous=null;
    const stops=chosen.map((p,i)=>{
      const journey=previous?transfer(previous,p):p.outboundMinutes?transfer(city,p):{text:'Start from your accommodation; check the route to your first stop.',minutes:0,km:null,mode:'First stop'};
      const reason=p.tags.filter(t=>input.interests.includes(t));previous=p;
      return {...p,period:periods[i]||'Flexible stop',description:tidy(p.description)||`Explore ${p.name}, a guide-listed stop in ${city.name}. Use the linked guide for context and confirm access before visiting.`,
        reason:reason.length?`Matches your interest in ${reason.join(' and ')}.`:'Adds variety to your day, with a manageable transfer.',
        transfer:journey,visitLength:`${Math.max(30,p.duration-30)}-${p.duration+30} min`,
        practical:p.indoor?'Check opening hours and any timed-entry requirements before heading out.':'Carry water, choose comfortable footwear and check current access before setting out.',
      };
    });
    const rest=all.filter(p=>!used.has(p.id) && !stops.some(s=>s.id===p.id)).sort((a,b)=>(distance(chosen[0]||city,a)??50)-(distance(chosen[0]||city,b)??50));
    const alternative=rest.find(p=>input.weather==='rain'?p.indoor:true)||null;
    const restaurants=(guide.restaurants||[]).filter(p=>{const dist=distance(chosen[0]||city,p);return dist===null||dist<10;}).slice(d%3,(d%3)+2);
    const district=stops.find(p=>p.address)?.address||city.name;
    const meal = { title: `A proper lunch break`, description:city.countryCode==='IN'?`Allow 45-60 minutes for ${cuisine[city.region]||'a regional meal or a vegetarian thali'} near your afternoon stop. Choose a busy, well-reviewed place and confirm dietary needs.`:`Allow 45-60 minutes for a local lunch near your afternoon stop. Look for a neighbourhood cafe or market, and confirm dietary needs.`,
      estimate:Math.round(perPerson.food*0.4*input.travellers/currencyRates[input.currency]),restaurants:restaurants.map(p=>({name:p.name,description:tidy(p.description,200),source:p.source,mapUrl:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+', '+city.name)}`})) };
    dayPlans.push({day:d+1,date:dayDate(input.startDate,d),title:chosen.length?`${chosen[0].name}${chosen.length>1?' & nearby discoveries':''}`:'A flexible day to explore at your own pace',
      intro:chosen.length?`${input.pace==='relaxed'?'An unhurried':input.pace==='active'?'An active':'A balanced'} day with ${chosen.length} sourced stops, a lunch break and room to wander.`:'There are no unused sourced attractions left in this guide. Use today for a local recommendation, a rest day or a favourite neighbourhood; no extra attractions have been invented.',
      stops,meal,alternative:alternative?{...alternative,description:tidy(alternative.description,280)}:null,
      tips:['Confirm current opening hours and admission rules using the source links.',input.pace==='relaxed'?'Leave a generous break between stops; skip a stop if the day feels too full.':'Treat the visit lengths as flexible blocks, with a buffer for queues and traffic.'],
      estimatedCost:Math.round(budget.total/input.days),
    });
  }
  const thin=dayPlans.filter(d=>d.stops.length<2).length;
  // Alternatives must remain unused across the complete itinerary, not merely
  // unused at the time an earlier day was generated.
  const unused=all.filter(p=>!used.has(p.id));
  for(const day of dayPlans){const anchor=day.stops[0]||city;const candidate=[...unused].sort((a,b)=>(distance(anchor,a)??50)-(distance(anchor,b)??50)).find(p=>input.weather==='rain'?p.indoor:true)||null;day.alternative=candidate?{...candidate,description:tidy(candidate.description,280)}:null;}
  if(thin)warnings.push('This guide has limited sourced attractions for the length of your trip. Some days are deliberately left flexible. Try a shorter trip for a denser plan.');
  return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),input,destination:city,
    title:`Your ${input.days}-day ${city.name} escape`,summary:`${city.name}, shaped around ${input.interests.join(', ')} and a ${input.pace} pace.`,
    days:dayPlans,budget,warnings,packing:['Comfortable footwear','Reusable water bottle','Weather-appropriate layers','Power bank','Offline copy of your itinerary'],
    source:guide.source||city.guideUrl,sourceRevision:guide.sourceRevision||null,sourceType:guide.sourceType||'Wikivoyage',retrieved:guide.retrieved||null,
    planningNotes:'Costs are illustrative planning allowances for the whole group, including accommodation, food, local transport and activities. Flights, visas and intercity travel are excluded. Transfers use approximate distance-based estimates, not live routing. Currency conversions are illustrative, not live exchange rates.',
    engine:'Local preference model + geographic scheduling',aiEnhanced:false,
  };
}

import test from 'node:test';import assert from 'node:assert/strict';
import {recommend} from '../lib/recommend.mjs';
import {catalogue,featured} from '../lib/data.mjs';
import {includedGuide} from '../lib/guide-resolver.mjs';
import {buildPlan,distance} from '../lib/planner.mjs';
const input={days:3,travellers:2,budget:25000,currency:'INR',startDate:'2026-12-01',pace:'balanced',interests:['nature','culture']};
test('new concrete preferences replace the earlier interest and change the shortlist',()=>{
 const adventure=recommend('I want an adventurous trip in India');const beach=recommend('Instead, a relaxing beach getaway',adventure);const mountains=recommend('mountains and scenic nature',beach);
 assert.equal(adventure.primary,'adventure');assert.equal(beach.primary,'beach');assert.equal(mountains.primary,'nature');assert.notDeepEqual(beach.items.map(d=>d.id),mountains.items.map(d=>d.id));assert.ok(beach.items.every(d=>d.matched[0]==='beach'));
});
test('follow-ups retain region and carry budget, group size and trip length into planning',()=>{
 const first=recommend('mountains in Himachal Pradesh');const next=recommend('3 days, 4 people and budget 20000',first);
 assert.equal(next.region,'Himachal Pradesh');assert.equal(next.days,3);assert.equal(next.travellers,4);assert.equal(next.budget,20000);assert.ok(next.items.every(d=>d.region==='Himachal Pradesh'));
});
test('more places changes the suggestions and recommendations avoid duplicate city names',()=>{
 const first=recommend('adventure in India'),more=recommend('show me more places',first);
 assert.ok(more.items.every(d=>!first.items.some(p=>p.id===d.id)));assert.equal(new Set(first.items.map(d=>d.name)).size,first.items.length);
});
test('Goa hero card is linked to the ready Panjim guide',()=>{
 const goa=featured.find(d=>d.region==='Goa');assert.equal(goa.name,'Panjim');assert.ok(buildPlan({...input,destinationId:goa.id},includedGuide(goa)).days.flatMap(d=>d.stops).length>=5);
});
test('every advertised locally ready destination actually generates a sourced plan',()=>{
 let count=0;for(const city of catalogue){const guide=includedGuide(city);if(!guide)continue;const plan=buildPlan({...input,destinationId:city.id},guide);assert.ok(plan.days.flatMap(d=>d.stops).length>=2,city.name);if(guide.nearbyCities)for(const stop of guide.attractions)if(Number.isFinite(stop.lat)&&Number.isFinite(stop.lng))assert.ok(distance(stop,city)<=65,stop.name);count++;}assert.ok(count>=700);
});

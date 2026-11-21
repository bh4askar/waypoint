import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogue,guides,publicDestination } from '../lib/data.mjs';
import { buildPlan,validateInput } from '../lib/planner.mjs';
import { exportPdf } from '../lib/pdf.mjs';
import { inferInterests } from '../lib/preference-model.mjs';
import {recommend} from '../lib/recommend.mjs';
const base={destinationId:catalogue.find(d=>d.name==='Ranchi').id,days:3,travellers:2,budget:18000,currency:'INR',startDate:'2026-12-01',pace:'balanced',interests:['culture','nature'],notes:''};

test('more than 1,000 unique destinations, mostly in India, and all six requested Jharkhand cities',()=>{
  assert.equal(catalogue.length,1100);assert.equal(new Set(catalogue.map(d=>d.id)).size,1100);assert.equal(catalogue.filter(d=>d.countryCode==='IN').length,950);
  for(const name of ['Hazaribagh','Ranchi','Koderma','Ramgarh','Dhanbad','Jamshedpur']){const city=catalogue.find(d=>d.name===name&&d.region==='Jharkhand');assert.ok(city,name);assert.ok(guides[city.id].attractions.length>=6,name+' has detailed attractions');}
});
test('all six Jharkhand cities generate detailed, sourced three-day itineraries',()=>{
  for(const name of ['Hazaribagh','Ranchi','Koderma','Ramgarh','Dhanbad','Jamshedpur']){
    const plan=buildPlan({...base,destinationId:catalogue.find(d=>d.name===name).id});
    assert.equal(plan.days.length,3);assert.deepEqual(plan.days.map(d=>d.date),['2026-12-01','2026-12-02','2026-12-03']);
    const stops=plan.days.flatMap(d=>d.stops);assert.ok(stops.length>=5,name);assert.ok(plan.days.every(d=>d.stops.length>=1),name+' has a sourced activity each day');assert.equal(new Set(stops.map(s=>s.id)).size,stops.length);
    for(const stop of stops){assert.ok(stop.description.length>40);assert.ok(stop.source.startsWith('https://'));assert.ok(stop.transfer.text);assert.ok(stop.visitLength);}
  }
});
test('budget remains honest when a requested budget is too small',()=>{
  const plan=buildPlan({...base,budget:500});assert.ok(plan.budget.total>500);assert.ok(plan.budget.remaining<0);assert.ok(plan.warnings.length);
  assert.equal(plan.budget.total,plan.budget.accommodation+plan.budget.food+plan.budget.transport+plan.budget.activities);
});
test('one-day trips do not include an accommodation allowance',()=>assert.equal(buildPlan({...base,days:1}).budget.accommodation,0));
test('invalid city, invalid calendar date, invalid days and negative budget are rejected',()=>{
  for(const change of [{destinationId:'not-a-place'},{startDate:'2026-02-30'},{days:8},{days:1.5},{travellers:0},{budget:-10},{currency:'XYZ'}])assert.throws(()=>validateInput({...base,...change}));
});
test('limited guides leave explicit free days rather than invented attractions',()=>{
  const city=catalogue.find(d=>d.name==='Hazaribagh'),plan=buildPlan({...base,destinationId:city.id,days:7});
  assert.ok(plan.days.some(d=>d.stops.length<2));assert.ok(plan.warnings.some(w=>w.includes('limited sourced')));
  assert.ok(plan.days.flatMap(d=>d.stops).every(s=>guides[city.id].attractions.some(p=>p.name===s.name)));
});
test('rain scenario and relaxed pace actually affect planning',()=>{
  const normal=buildPlan(base),rain=buildPlan({...base,weather:'rain'}),relaxed=buildPlan({...base,pace:'relaxed'});
  assert.ok(rain.warnings.some(w=>w.includes('not a weather forecast')));assert.notDeepEqual(normal.days.flatMap(d=>d.stops.map(s=>s.name)),rain.days.flatMap(d=>d.stops.map(s=>s.name)));
  assert.ok(relaxed.days.every(d=>d.stops.length<=2));
});
test('alternatives do not duplicate a scheduled stop',()=>{
  const plan=buildPlan(base),used=plan.days.flatMap(d=>d.stops.map(s=>s.id));for(const day of plan.days)if(day.alternative)assert.ok(!used.includes(day.alternative.id));
});
test('local preference model learns travel interests without a remote model',()=>{
  assert.equal(inferInterests('I love museums temples and historic architecture')[0].interest,'culture');
  assert.equal(inferInterests('beach ocean sea and sandy shores')[0].interest,'beach');assert.deepEqual(inferInterests(''),[]);
});
test('PDF has valid structure and contains real source and activity text',()=>{
  const plan=buildPlan(base),pdf=exportPdf(plan),text=pdf.toString('ascii');assert.ok(text.startsWith('%PDF-1.4'));assert.ok(text.includes('xref'));assert.ok(text.includes('%%EOF'));assert.ok(text.includes('Ranchi'));assert.ok(text.includes('Accommodation allowance'));assert.ok(text.includes('https://'));
});
test('PDF includes photographs from the wider destination catalogue',()=>{
  const city=catalogue.map(publicDestination).find(d=>d.image?.startsWith('/assets/destinations/')&&guides[d.id]?.attractions.length>=3);
  assert.ok(city,'A sourced destination with a catalogue photograph exists');
  const plan=buildPlan({...base,destinationId:city.id});
  plan.coverPhoto={image:city.image,subject:city.name,...city.photoCredit,scope:'destination'};
  assert.ok(exportPdf(plan).toString('latin1').includes('/Subtype /Image'));
});
test('the shared planner supports popular Indian and international destinations beyond Jharkhand',()=>{
  for(const name of ['Jaipur','Agra','Delhi','Mumbai','Bengaluru','Kochi','Udaipur','Paris','Kyoto','Ubud']){
    const city=catalogue.find(d=>d.name===name);assert.ok(city,name);
    const plan=buildPlan({...base,destinationId:city.id,budget:60000});
    assert.equal(plan.days.length,3);assert.ok(plan.days.flatMap(d=>d.stops).length>=5,name+' has enough detailed stops');
    assert.ok(plan.days.flatMap(d=>d.stops).every(p=>p.source&&p.description));
  }
  const manali=catalogue.find(d=>d.name==='Manali'&&d.region==='Himachal Pradesh');assert.ok(buildPlan({...base,destinationId:manali.id}).days.flatMap(d=>d.stops).length>=5);
});
test('adventure chat suggests real, source-backed places before asking for trip parameters',()=>{
  const result=recommend('I want an adventurous mountain trip in India for 3 days');assert.ok(result.interests.includes('adventure'));assert.equal(result.days,3);assert.ok(result.items.length>=3);assert.ok(result.items.every(c=>c.countryCode==='IN'&&c.guideCount>=3));assert.ok(result.items.some(c=>['Manali','Rishikesh','Leh','Gangtok'].includes(c.name)));
});

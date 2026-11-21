import test from 'node:test';
import assert from 'node:assert/strict';
import {attachIncludedPhotos} from '../lib/photos.mjs';
import {exactPhotos} from '../public/photo-gallery.js';
const photo=(name,image='/assets/places/actual.jpg')=>({image,scope:'place',subject:name,identitySource:'https://en.wikipedia.org/wiki/'+name,source:'https://commons.wikimedia.org/wiki/File:Actual.jpg',license:'CC BY-SA 4.0'});
test('a destination cover cannot remain on a landmark after photo refresh',()=>{
  const plan={destination:{id:'a',name:'Town'},days:[{stops:[{name:'Temple',photo:{image:'/assets/city.jpg',scope:'destination'}}]}]};
  attachIncludedPhotos(plan,{});assert.equal(plan.days[0].stops[0].photo,undefined);
});

test('an older sourced city cover is removed from a saved landmark',()=>{
  const plan={destination:{id:'a',name:'Town'},days:[{stops:[{name:'Temple',photo:{...photo('Town'),scope:'destination'}}]}]};
  attachIncludedPhotos(plan,{});assert.equal(plan.days[0].stops[0].photo,undefined);
});

test('the rejected Patratu valley road photo cannot be restored as Patratu Dam',()=>{
  const plan={destination:{id:'1258686',name:'Ramgarh'},days:[{stops:[{name:'Patratu Dam',photo:{...photo('Patratu Dam'),source:'https://commons.wikimedia.org/wiki/File:Patratu_Valley_at_night.jpg'}}]}]};
  attachIncludedPhotos(plan,{});assert.equal(plan.days[0].stops[0].photo,undefined);
});
test('landmark photos use destination IDs so duplicate city names cannot collide',()=>{
  const plan={destination:{id:'b',name:'Town'},days:[{stops:[{name:'Temple'}]}]};
  attachIncludedPhotos(plan,{'a|Temple':photo('Temple A'),'b|Temple':photo('Temple B')});
  assert.equal(plan.days[0].stops[0].photo.subject,'Temple B');
});
test('an alternative receives its own photo instead of the replaced stop photo',()=>{
  const plan={destination:{id:'a',name:'Town'},days:[{stops:[{name:'Temple'}],alternative:{name:'Museum'}}]};
  attachIncludedPhotos(plan,{'a|Temple':photo('Temple'),'a|Museum':photo('Museum')});
  assert.equal(plan.days[0].alternative.photo.subject,'Museum');
});
test('gallery rejects city covers, unverified records, duplicates and external image paths',()=>{
  const first=photo('Temple'),second=photo('Temple','/assets/places/second.jpg');
  const stop={photo:{...first,photos:[first,first,second,{...second,image:'https://example.com/a.jpg'},{...first,scope:'destination'},{...first,identitySource:null}]}};
  assert.deepEqual(exactPhotos(stop).map(p=>p.image),[first.image,second.image]);
});

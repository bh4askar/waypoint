import fs from 'node:fs';
import {catalogue,guides} from '../lib/data.mjs';
const destinations=catalogue.map(city=>({...city,kind:'destination',key:city.id}));
const landmarks=catalogue.flatMap(city=>(guides[city.id]?.attractions||[]).map(stop=>({
  kind:'landmark',key:city.id+'|'+stop.name,cityId:city.id,city:city.name,region:city.region,country:city.country,
  countryCode:city.countryCode,name:stop.name,lat:stop.lat,lng:stop.lng,cityLat:city.lat,cityLng:city.lng,source:stop.source,venueUrl:stop.venueUrl,description:stop.description
})));
fs.mkdirSync(new URL('../data/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../data/photo-targets.json',import.meta.url),JSON.stringify({destinations,landmarks}));
console.log(`${destinations.length} destinations and ${landmarks.length} source landmark records exported.`);

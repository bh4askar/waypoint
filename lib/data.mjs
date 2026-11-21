import fs from 'node:fs';
import { jharkhandGuides } from './jharkhand.mjs';
import { kyotoGuide } from './global-guides.mjs';
import {combinePhotoIndexes} from './external-photos.mjs';

export const catalogue = JSON.parse(fs.readFileSync(new URL('./catalogue.json', import.meta.url), 'utf8'));
export const guides = JSON.parse(fs.readFileSync(new URL('./guides.json', import.meta.url), 'utf8'));
for (const [name,guide] of Object.entries(jharkhandGuides)) {
  const city=catalogue.find(d=>d.name===name && d.region==='Jharkhand');
  if(city)guides[city.id]=guide;
}
const kyoto=catalogue.find(d=>d.name==='Kyoto'&&d.countryCode==='JP');if(kyoto)guides[kyoto.id]=kyotoGuide;
export const categories = ['culture', 'nature', 'food', 'adventure', 'beach', 'shopping'];
let cityCredits={};try{cityCredits=JSON.parse(fs.readFileSync(new URL('../public/assets/jharkhand-photo-credits.json',import.meta.url),'utf8'));}catch{}
let destinationPhotos={};try{destinationPhotos=JSON.parse(fs.readFileSync(new URL('./destination-photos.json',import.meta.url),'utf8'));}catch{}
destinationPhotos=combinePhotoIndexes(destinationPhotos);
export const currencyRates = { INR: 1, USD: 85, EUR: 93, GBP: 110 };

const highlights = [
  ['Jaipur', 'jaipur', 'The pink city, in all its colour.', ['culture', 'food', 'shopping'], 'Pink palaces & royal stories', 'October - March'],
  ['Goa', 'goa', 'Slow mornings. Salty air. No rush.', ['beach', 'food', 'nature'], 'Coastal days & golden sunsets', 'November - February'],
  ['Kochi', 'kerala', 'Find your rhythm by the water.', ['nature', 'food', 'culture'], 'Backwaters & a gentler pace', 'October - March'],
  ['Agra', 'agra', 'Some places stay with you forever.', ['culture', 'food'], 'Marble wonders & Mughal history', 'October - March'],
  ['Kyoto', 'japan', 'Old-world wonder, around every corner.', ['culture', 'nature', 'food'], 'Temple trails & quiet gardens', 'March - May / October - November'],
  ['Cinque Terre', 'italy', 'Five villages. A thousand little discoveries.', ['beach', 'adventure', 'food'], 'Colourful coastlines & village walks', 'April - June / September - October'],
  ['Ubud', 'bali', 'A little greener. A little slower.', ['nature', 'culture', 'food'], 'Rice terraces & island culture', 'May - September'],
  ['Paris', 'paris', 'A city best explored one cafe at a time.', ['culture', 'food', 'shopping'], 'Art, neighbourhoods & cafe stops', 'April - June / September - October'],
  ['Porto', 'lisbon', 'Riverside wandering, with a view.', ['culture', 'food'], 'River walks & tiled streets', 'May - September'],
];

const extraTags = {
  Manali: ['nature', 'adventure'], Shimla: ['nature', 'culture'], Rishikesh: ['adventure', 'nature', 'culture'],
  Udaipur: ['culture', 'nature'], Varanasi: ['culture', 'food'], Leh: ['nature', 'adventure'],
  Srinagar: ['nature', 'culture'], Darjeeling: ['nature', 'food'], Ooty: ['nature'], Munnar: ['nature'],
  Mysuru: ['culture', 'food'], Amritsar: ['culture', 'food'], Jaisalmer: ['culture', 'adventure'],
};
const heroPhotoSources={jaipur:'photo-1477587458883-47145ed94245',goa:'photo-1512343879784-a960bf40e7f2',kerala:'photo-1602216056096-3b40cc0c9944',agra:'photo-1524492412937-b28074a5d7da',japan:'photo-1493976040374-85c8e12f0c0e',italy:'photo-1516483638261-f4dbaf036963',bali:'photo-1537996194471-e657df975ab4',paris:'photo-1502602898657-3e91760cbb34',lisbon:'photo-1555881400-74d7acaacd8b'};

function findCity(name) {
  if(name==='Goa')return catalogue.find(d=>d.name==='Panjim'&&d.region==='Goa');
  const matches=catalogue.filter(d=>d.name===name||d.aliases.some(a=>a.toLowerCase()===name.toLowerCase()));
  return matches.sort((a,b)=>(guides[b.id]?.attractions.length||0)-(guides[a.id]?.attractions.length||0))[0];
}

export const featured = highlights.map(([name, image, tagline, tags, caption, season]) => {
  const city = findCity(name);
  return city ? { ...city, image: `/assets/${image}.jpg`, tagline, tags, caption, season, guideCount: guides[city.id]?.attractions.length || 0 } : null;
}).filter(Boolean);

export function publicDestination(city) {
  const feature = featured.find(f => f.id === city.id);
  const guide = guides[city.id];
  const localPhoto = new URL(`../public/assets/${city.name.toLowerCase()}-jh.jpg`,import.meta.url);
  const cityImage = city.region==='Jharkhand' && fs.existsSync(localPhoto) ? `/assets/${city.name.toLowerCase()}-jh.jpg` : null;
  const trimPhoto=photo=>photo?Object.fromEntries(['image','subject','source','artist','license','licenseUrl','scope','identitySource'].filter(key=>photo[key]!==undefined).map(key=>[key,photo[key]])):null;
  return { ...city, ...feature, tags: feature?.tags || extraTags[city.name] || (city.region==='Jharkhand'?['nature','culture']:['culture', 'food']),
    guideCount: guide?.attractions.length || 0,
    guideStatus: guide?.attractions.length >= 3 ? 'Ready to plan' : 'Discover nearby places',
    caption: feature?.caption || `${city.region || city.country} · Explore at your own pace`,
    image: destinationPhotos[city.id]?.image || cityImage || null,
    photos: (destinationPhotos[city.id]?.photos || []).map(trimPhoto),
    photoCredit: trimPhoto(destinationPhotos[city.id] || (cityImage?cityCredits[city.name]||null:null)) };
}

export function costTier(city) {
  if (city.countryCode === 'IN') return 1;
  if (['NP', 'LK', 'VN', 'ID', 'TH', 'MY', 'KH'].includes(city.countryCode)) return 1.3;
  if (['CH', 'NO', 'IS', 'GB', 'US', 'AU'].includes(city.countryCode)) return 4;
  return 2.7;
}

export const faq = [
  { title: 'How do I plan a trip?', keywords: 'plan generate start create itinerary destination trip', answer: 'Start in the main AI chat: describe the kind of trip you want, such as an adventurous mountain escape. Open a suggested destination, enter your budget, travellers, dates and pace, then create your visual itinerary with photos, sourced stops and interactive maps.' },
  { title: 'Can I download a PDF?', keywords: 'pdf download export offline print file', answer: 'Yes. Open your itinerary and choose Download PDF. It includes your day-by-day plan, meal suggestions, estimated costs, travel guidance and source links. You can keep it on your phone for offline use.' },
  { title: 'How do I save my trip?', keywords: 'save saved account login google favourite favorite sync', answer: 'Save on this device keeps the itinerary in this browser. When Google sign-in is connected, signed-in users can save trips to their account on this Waypoint server. Open My trips to revisit a saved plan.' },
  { title: 'Can I change my itinerary?', keywords: 'change edit adjust update rainy rain late slow pace budget', answer: 'Absolutely. Use Edit trip to change your dates, interests, budget or pace. The Rainy day and Start later options rearrange your plan. You can also swap individual stops for available alternatives.' },
  { title: 'What does the budget include?', keywords: 'budget cost money price flight flights hotel accommodation currency rupees', answer: 'The budget covers estimated accommodation, food, local transport and activity allowances for your whole group. Flights, visas and intercity travel are excluded. All prices are planning estimates, not live quotes. Changing currency uses illustrative conversion rates.' },
  { title: 'Are times and opening hours live?', keywords: 'accurate live hours opening closed timing time verified', answer: 'Visit lengths and transfer times are planning estimates. Attraction information comes from community travel guides or OpenStreetMap, and may be out of date. Check each venue link for current opening hours, tickets and access before travelling.' },
  { title: 'How many destinations are there?', keywords: 'india indian cities places destinations coverage thousand 1000 1100', answer: 'Waypoint includes 1,100 searchable destinations: 950 in India and 150 abroad. There are 312 included guides. Other destinations can discover nearby places from OpenStreetMap when online. Source coverage varies, and we never invent attractions to fill a day.' },
  { title: 'Does dark mode work?', keywords: 'dark light theme appearance', answer: 'Use the sun or moon button in the navigation bar. Waypoint remembers your choice, including in the planner and Ask Waypoint chat. Your system preference is used on your first visit.' },
  { title: 'Is Waypoint free?', keywords: 'free subscription payment pay api paid', answer: 'The local version needs no paid API or subscription. The included planner and preference model work locally. Optional Ollama enrichment runs on your own computer. Google sign-in needs the site owner to connect their Google project; public hosting and third-party data services have their own limits.' },
];

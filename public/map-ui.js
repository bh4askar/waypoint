const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
const safe=s=>/^https?:\/\//.test(String(s||''))?esc(s):'#';
let instances=[],currentPlan=null,options=null,mainMap=null,mapDay=1;
export function destroyMaps(){for(const map of instances)try{map._wpRemoved=true;map.remove();}catch{}instances=[];mainMap=null;}
function popup(point,stop){return `<div class="map-popup-card">${stop?.photo?`<img src="${esc(stop.photo.image)}" alt="${esc(point.name)}">`:''}<strong>${esc(point.name)}</strong><span>Day ${point.day} · Stop ${point.number}${stop?.visitLength?' · '+esc(stop.visitLength):''}</span><a href="${safe(stop?.mapUrl||point.mapUrl)}" target="_blank" rel="noopener">Open directions ${icon('arrow')}</a><small><a href="${safe(point.source)}" target="_blank" rel="noopener">Location source</a></small></div>`;}
function fixSvg(container){container.querySelectorAll('.leaflet-overlay-pane svg').forEach(svg=>{svg.style.width=svg.getAttribute('width')+'px';svg.style.height=svg.getAttribute('height')+'px';});}
async function createMap(container,stops,route=false){
  if(!window.L){container.innerHTML='<p class="map-empty">The map library could not load. Refresh to try again.</p>';return null;}
  const city=currentPlan.destination,view=L.map(container,{zoomControl:false,scrollWheelZoom:false}).setView([city.lat,city.lng],12);container._wpMap=view;instances.push(view);L.control.zoom({position:'topright'}).addTo(view);
  const tiles=L.tileLayer(options.tileUrl,{maxZoom:19,keepBuffer:1,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(view);
  let tileError=false;tiles.on('tileerror',()=>{if(!tileError){tileError=true;$('#map-status').textContent='Street tiles need an internet connection. Your sourced points remain available.';}});
  const status=container.parentElement.querySelector('.mini-map-status')||$('#map-status');status.textContent='Placing your sourced stops…';
  try{const data=await options.post('/api/map-data',{destinationId:city.id,stops:stops.map(s=>({id:s.id,name:s.name,day:s.day,number:s.number})),route});
    if(!container.isConnected||view._wpRemoved)return view;
    const layers=[];
    for(const point of data.points){const stop=stops.find(s=>s.id===point.id),label=route?point.number:`${point.day}.${point.number}`;const marker=L.marker([point.lat,point.lng],{icon:L.divIcon({className:'waypoint-map-marker',html:`<span class="map-pin">${stop?.photo?`<img src="${esc(stop.photo.image)}" alt="">`:''}<b>${label}</b></span>`,iconSize:[42,48],iconAnchor:[21,45],popupAnchor:[0,-40]})}).addTo(view);marker.bindPopup(popup(point,stop),{maxWidth:245,minWidth:190});layers.push(marker);}
    let polyline=null;
    if(data.route?.geometry){polyline=L.geoJSON(data.route.geometry,{style:{color:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),weight:5,opacity:.85}}).addTo(view);layers.push(polyline);status.textContent=`${data.points.length} stops · Driving route ${(data.route.distance/1000).toFixed(1)} km · About ${Math.round(data.route.duration/60)} min driving, without live traffic.`;}
    else if(route&&data.points.length>1){polyline=L.polyline(data.points.map(p=>[p.lat,p.lng]),{color:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),weight:3,dashArray:'6 8'}).addTo(view);layers.push(polyline);status.textContent='Visit order shown with dashed lines. Road routing is unavailable; check directions before travelling.';}
    else status.textContent=`${data.points.length} of ${stops.length} places mapped with sourced coordinates.`;
    if(data.unresolved.length)status.textContent+=` ${data.unresolved.map(p=>p.name).join(', ')}: exact coordinates are not available yet. Use the directions link to check.`;
    if(layers.length)view.fitBounds(L.featureGroup(layers).getBounds(),{padding:[35,35],maxZoom:15});else L.circleMarker([city.lat,city.lng],{radius:7,color:'#77858e'}).addTo(view).bindPopup(`${esc(city.name)} city context. Attraction coordinates are unresolved.`);
    view.on('moveend zoomend resize',()=>fixSvg(container));requestAnimationFrame(()=>{view.invalidateSize();fixSvg(container);});view._wpLayers=layers;
  }catch(error){status.textContent=error.message;L.circleMarker([city.lat,city.lng],{radius:7,color:'#77858e'}).addTo(view).bindPopup(`${esc(city.name)} city context`);}
  return view;
}
function selectedStops(day,onlyId=null){return currentPlan.days.filter(d=>!day||d.day===day).flatMap(d=>d.stops.map((s,i)=>({...s,day:d.day,number:i+1}))).filter(s=>!onlyId||s.id===onlyId);}
async function showMainMap(day=1,onlyId=null){mapDay=day;const dialog=$('#map-dialog');if(!dialog.open)dialog.showModal();const old=mainMap||$('#trip-map')._wpMap;if(old){old._wpRemoved=true;old.remove();instances=instances.filter(m=>m!==old);mainMap=null;$('#trip-map')._wpMap=null;}
  $('#map-title').textContent=onlyId?'A little closer to this place.':`Your ${currentPlan.destination.name} journey.`;$('#map-day-tabs').innerHTML=`<button data-map-day="0" class="${day===0?'active':''}">Overview</button>${currentPlan.days.map(d=>`<button data-map-day="${d.day}" class="${day===d.day?'active':''}">Day ${d.day}</button>`).join('')}`;
  const stops=selectedStops(day,onlyId);$('#map-stop-list').innerHTML=stops.map(s=>`<button class="map-list-stop" data-map-focus="${s.id}"><b>${s.number}</b>${s.photo?`<img src="${esc(s.photo.image)}" alt="">`:''}<span><strong>${esc(s.name)}</strong><small>${esc(s.period)} · ${esc(s.visitLength)}</small></span></button>`).join('');
  $('#trip-map').innerHTML='';
  $('#map-day-tabs').querySelectorAll('[data-map-day]').forEach(b=>b.addEventListener('click',()=>showMainMap(Number(b.dataset.mapDay))));
  const built=await createMap($('#trip-map'),stops,Boolean(day&&!onlyId));if(built?._wpRemoved)return;mainMap=built;
  $('#map-fit').onclick=()=>{if(mainMap?._wpLayers?.length)mainMap.fitBounds(L.featureGroup(mainMap._wpLayers).getBounds(),{padding:[35,35],maxZoom:15});};
  $('#map-stop-list').querySelectorAll('[data-map-focus]').forEach(b=>b.addEventListener('click',()=>{const layer=mainMap?._wpLayers?.find(l=>l.getPopup?.()?.getContent()?.includes(esc(stops.find(s=>s.id===b.dataset.mapFocus)?.name||'')));if(layer?.getLatLng){mainMap.setView(layer.getLatLng(),15);layer.openPopup();}}));
}
export function bindMapControls(plan,settings){currentPlan=plan;options=settings;
  const aside=$('.trip-sidebar');const card=document.createElement('div');card.className='sidebar-card map-preview-card';card.innerHTML=`<span class="eyebrow">A LITTLE PERSPECTIVE</span><h2>Your trip, on the map.</h2><p>Real streets, numbered stops and a clearer sense of the journey.</p><button class="button primary" id="open-trip-map">${icon('map')}Explore the trip map</button>`;aside.prepend(card);$('#open-trip-map').addEventListener('click',()=>showMainMap(1));
  for(const day of plan.days){const container=$('#day-'+day.day);if(!container)continue;container.querySelectorAll('.visual-stop').forEach((article,index)=>{const stop=day.stops[index];article.id='stop-'+stop.id;const details=document.createElement('details');details.className='stop-map-details';details.innerHTML=`<summary>${icon('map')}Explore this place on the map${icon('chevron')}</summary><div class="mini-map-wrap"><div class="mini-map"></div><p class="mini-map-status">Open the map to see this place.</p><button class="text-link map-fullscreen" type="button">Open a larger map ${icon('arrow')}</button></div>`;article.querySelector('.visual-stop-body').append(details);let mini=null;details.addEventListener('toggle',async()=>{if(details.open&&!mini)mini=await createMap(details.querySelector('.mini-map'),[{...stop,day:day.day,number:index+1}],false);if(details.open&&mini)mini.invalidateSize();});details.querySelector('.map-fullscreen').addEventListener('click',()=>showMainMap(day.day,stop.id));});}
}

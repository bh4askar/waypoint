export function exactPhotos(stop){
  const photo=stop.photo;if(!photo?.identitySource||photo.scope!=='place')return [];
  const seen=new Set();return (photo.photos?.length?photo.photos:[photo]).filter(item=>{
    if(item.scope!=='place'||!item.identitySource||!/^\/(?:assets\/(?:places|destinations|exact)\/|media\/)[a-zA-Z0-9_.-]+\.jpg$/.test(item.image)||seen.has(item.image))return false;
    seen.add(item.image);return true;
  });
}
export function bindPhotoGalleries(plan){
  for(const stop of plan.days.flatMap(day=>day.stops)){
    const article=document.getElementById('stop-'+stop.id);if(!article)continue;
    const photos=exactPhotos(stop),container=article.querySelector('.stop-photo');
    if(!photos.length){const label=container.querySelector('.stop-photo-illustration span');if(label)label.textContent='An exact photo is not available yet.';continue;}
    if(photos.length<2)continue;
    const strip=document.createElement('div');strip.className='landmark-gallery';strip.setAttribute('aria-label','Photos of '+stop.name);
    const main=container.querySelector('img'),credit=container.querySelector('.photo-credit');
    for(const [index,photo] of photos.entries()){
      const button=document.createElement('button');button.type='button';button.className='gallery-thumbnail';button.setAttribute('aria-label',`View photo ${index+1} of ${stop.name}`);button.setAttribute('aria-pressed',String(index===0));
      const image=document.createElement('img');image.src=photo.image;image.alt='';image.loading='lazy';button.append(image);
      button.addEventListener('click',()=>{main.src=photo.image;main.alt=stop.name+' - photo '+(index+1);if(credit){credit.href=/^https:\/\//.test(photo.source)?photo.source:'#';credit.textContent=(photo.artist||'Wikimedia Commons')+' · '+photo.license;}strip.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));});
      strip.append(button);
    }
    const count=document.createElement('span');count.className='gallery-count';count.textContent=photos.length+' photos';strip.append(count);container.after(strip);
  }
}
export function bindDestinationGallery(city){
  const photos=city?.photos?.filter(photo=>photo.scope==='destination'&&photo.identitySource&&/^\/(?:assets\/(?:destinations|exact)\/|media\/)[a-zA-Z0-9_.-]+\.jpg$/.test(photo.image))||[];
  const summary=document.querySelector('.trip-summary'),main=summary?.querySelector('img');if(photos.length<2||!main)return;
  const strip=document.createElement('div');strip.className='landmark-gallery destination-gallery';strip.setAttribute('aria-label','Photos of '+city.name);
  const credit=document.createElement('a');credit.className='gallery-count';credit.target='_blank';credit.rel='noopener';
  const setCredit=photo=>{credit.href=/^https:\/\//.test(photo.source)?photo.source:'#';credit.textContent=(photo.artist||'Wikimedia Commons')+' · '+photo.license;};setCredit(photos[0]);
  for(const [index,photo] of photos.entries()){
    const button=document.createElement('button');button.type='button';button.className='gallery-thumbnail';button.setAttribute('aria-label',`View destination photo ${index+1} of ${city.name}`);button.setAttribute('aria-pressed',String(index===0));
    const image=document.createElement('img');image.src=photo.image;image.alt='';image.loading='lazy';button.append(image);
    button.addEventListener('click',()=>{main.src=photo.image;main.alt=city.name+' - photo '+(index+1);setCredit(photo);strip.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));});strip.append(button);
  }
  strip.append(credit);summary.after(strip);
}
export async function refreshPlanPhotos(plan,post,onChange){
  const stops=plan.days.flatMap(day=>[...day.stops,...(day.alternative?[day.alternative]:[])]);
  try{
    const result=await post('/api/photos',{destinationId:plan.destination.id,names:[...new Set(stops.map(stop=>stop.name))]});
    let changed=false;
    for(const stop of stops){const next=result.photos[stop.name]||null;if(JSON.stringify(stop.photo||null)!==JSON.stringify(next)){changed=true;if(next)stop.photo=next;else delete stop.photo;}}
    if(changed)onChange();
  }catch{/* Saved trips remain usable if photo refresh is unavailable. */}
}

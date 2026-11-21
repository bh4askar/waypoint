import {setupConversation} from './conversation-ui.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
const $=s=>document.querySelector(s);
let bridge=null,conversation=[],selection={interests:['nature','culture'],notes:'',days:null},sceneHue=26,sceneBase=[171,103,70];
function hslRgb(h,s,l){h=((h%360)+360)%360/360;const f=n=>{const k=(n+h*12)%12;return l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1));};return [f(0),f(8),f(4)].map(v=>Math.round(v*255));}
function luminance(rgb){const v=rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];}
function colourToHue(r,g,b){r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d){h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;}return {h:(h*60+360)%360,s:max?d/max:0,l:(max+min)/2};}
export function applyScenePalette(image=null){
  if(image?.complete&&image.naturalWidth){try{const canvas=document.createElement('canvas');canvas.width=48;canvas.height=32;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,48,32);const pixels=ctx.getImageData(0,0,48,32).data,buckets=Array.from({length:24},()=>({weight:0,r:0,g:0,b:0}));
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2],c=colourToHue(r,g,b);if(c.s<.16||c.l<.16||c.l>.85)continue;const bucket=buckets[Math.floor(c.h/15)%24],w=c.s*(1-Math.abs(c.l-.48));bucket.weight+=w;bucket.r+=r*w;bucket.g+=g*w;bucket.b+=b*w;}
    const best=buckets.sort((a,b)=>b.weight-a.weight)[0];if(best.weight){sceneBase=[best.r/best.weight,best.g/best.weight,best.b/best.weight].map(Math.round);sceneHue=colourToHue(...sceneBase).h;}
  }catch{}}
  const dark=document.documentElement.dataset.theme==='dark';let l=dark?.70:.36;let rgb=hslRgb(sceneHue,.55,l);if(!dark)while(l>.20&&luminance(rgb)>.16){l-=.015;rgb=hslRgb(sceneHue,.55,l);}
  const root=document.documentElement.style;root.setProperty('--scene-hue',sceneHue.toFixed(1));root.setProperty('--scene-rgb',sceneBase.join(','));root.setProperty('--accent',`rgb(${rgb.join(',')})`);root.setProperty('--accent-hover',`rgb(${hslRgb(sceneHue,.57,dark?.77:l-.04).join(',')})`);root.setProperty('--accent-soft',`rgba(${sceneBase.join(',')},${dark?.18:.10})`);root.setProperty('--scene-ink',dark?'#151a1a':'#fff');document.dispatchEvent(new CustomEvent('waypoint-palette'));
}
export function setupExperience(options){setupConversation(options);applyScenePalette(document.querySelector('.hero-slide.active'));}

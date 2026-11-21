import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { catalogue,guides,featured,publicDestination,faq } from './lib/data.mjs';
import { buildPlan,validateInput,PlannerError,preparePlaces } from './lib/planner.mjs';
import { exportPdf } from './lib/pdf.mjs';
import { discoverPlaces } from './lib/discovery.mjs';
import { enhancePlan } from './lib/ai.mjs';
import { enrichPhotos } from './lib/photos.mjs';
import {recommend} from './lib/recommend.mjs';
import {mapData} from './lib/maps.mjs';
import {includedGuide,readyAlternatives} from './lib/guide-resolver.mjs';
import {immediatePhotos} from './lib/fast-photos.mjs';
import {createLocalChat} from './lib/local-chat.mjs';
import {sourceRevision} from './lib/version.mjs';
import {attachIncludedPhotos} from './lib/photos.mjs';
import {combinePhotoIndexes,cacheSourceImage,imageMime,prepareSourcePdfImages} from './lib/external-photos.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const revision=sourceRevision(ROOT);
try{for(const line of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);if(m && !process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'').trim();}}catch{}
const PORT=Number(process.env.PORT||3000),HOST=process.env.HOST||'127.0.0.1';
const APP_URL=(process.env.APP_URL||`http://localhost:${PORT}`).replace(/\/$/,'');
const DATA=path.resolve(process.env.WAYPOINT_DATA_DIR||path.join(ROOT,'data'));fs.mkdirSync(DATA,{recursive:true});
const localChat=createLocalChat(ROOT);
const publicCatalogue=catalogue.map(city=>{const guide=includedGuide(city),count=preparePlaces(guide?.attractions||[],city).length;return {...publicDestination(city),guideCount:count,guideStatus:count>=2?'Ready to plan':'Online discovery needed',guideScope:guide?.nearbyCities?'nearby':'destination'};});
const STORE=path.join(DATA,'accounts.json');
const googleReady=Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const aiConfig={enabled:process.env.ENABLE_LOCAL_AI==='true',url:(process.env.OLLAMA_URL||'http://127.0.0.1:11434').replace(/\/$/,''),model:process.env.OLLAMA_MODEL||'qwen2.5:1.5b'};
const mapConfig={tileUrl:process.env.MAP_TILE_URL||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',osrmUrl:(process.env.OSRM_URL||'https://router.project-osrm.org').replace(/\/$/,'')};
const tileOrigin=new URL(mapConfig.tileUrl.replaceAll('{z}','0').replaceAll('{x}','0').replaceAll('{y}','0')).origin;
const plans=new Map(),sessions=new Map(),oauthStates=new Map(),rates=new Map();
let includedPhotos={};try{includedPhotos=JSON.parse(fs.readFileSync(path.join(ROOT,'lib','place-photos.json'),'utf8'));}catch{}
includedPhotos=combinePhotoIndexes(includedPhotos);
const random=()=>crypto.randomBytes(32).toString('base64url');
const secure=APP_URL.startsWith('https://');
const cookie=(name,value,maxAge=86400)=>`${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));}
function readStore(){try{return JSON.parse(fs.readFileSync(STORE,'utf8'));}catch{return {users:{},trips:{}};}}
function writeStore(store){const tmp=STORE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(store));fs.renameSync(tmp,STORE);}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function redirect(res,url){res.writeHead(302,{'Location':url,'Cache-Control':'no-store'});res.end();}
function currentUser(req){const key=cookies(req).wp_session;const s=sessions.get(key);if(!s || s.expires<Date.now()){if(s)sessions.delete(key);return null;}return readStore().users[s.userId]||null;}
function device(req,res){let id=cookies(req).wp_device;if(!/^[a-zA-Z0-9_-]{43}$/.test(id||'')){id=random();res.setHeader('Set-Cookie',cookie('wp_device',id,30*86400));}return id;}
async function body(req){if(Number(req.headers['content-length'])>1500000)throw new PlannerError('Request is too large.',413);let bytes=0,parts=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>1500000)throw new PlannerError('Request is too large.',413);parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString()||'{}');}catch{throw new PlannerError('Send a valid JSON request.');}}
function limit(req,kind='general',max=100){if(HOST==='127.0.0.1'&&['127.0.0.1','::1'].includes(req.socket.remoteAddress))return;const key=req.socket.remoteAddress+':'+kind;let r=rates.get(key);if(!r || r.until<Date.now())r={n:0,until:Date.now()+600000};r.n++;rates.set(key,r);if(r.n>max)throw new PlannerError('A few too many requests. Please try again shortly.',429);}

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',`default-src 'self'; img-src 'self' data: ${tileOrigin}; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`);
  try{
    const allowedHosts=new Set([`localhost:${PORT}`,`127.0.0.1:${PORT}`,new URL(APP_URL).host]);
    if(!allowedHosts.has(req.headers.host))throw new PlannerError('Unknown host.',403);
    const url=new URL(req.url,APP_URL),route=url.pathname;
    if(['POST','PUT','DELETE','PATCH'].includes(req.method) && req.headers.origin && req.headers.origin!==APP_URL && req.headers.origin!==`http://127.0.0.1:${PORT}`)throw new PlannerError('Request origin is not allowed.',403);
    if(route.startsWith('/api/') || route.startsWith('/auth/'))limit(req);
    if(route==='/api/health' && req.method==='GET')return json(res,200,{app:'waypoint',ready:true,instance:crypto.createHash('sha256').update(ROOT).digest('hex'),revision});
    if(route==='/api/config' && req.method==='GET'){
      device(req,res);const user=currentUser(req);
      return json(res,200,{googleReady,user:user?{id:user.id,name:user.name,email:user.email}:null,localAi:aiConfig.enabled,localAiModel:aiConfig.enabled?aiConfig.model:null,chatModel:localChat.state.available?localChat.state.model:null,chatReady:localChat.state.ready,destinations:catalogue.length,india:catalogue.filter(d=>d.countryCode==='IN').length,guides:Object.keys(guides).length,readyDestinations:publicCatalogue.filter(d=>d.guideCount>=2).length,featured:featured.map(d=>publicCatalogue.find(c=>c.id===d.id)),faq,tileUrl:mapConfig.tileUrl});
    }
    if(route==='/api/destinations' && req.method==='GET'){
      const q=(url.searchParams.get('q')||'').toLowerCase().slice(0,100),country=url.searchParams.get('country'),region=url.searchParams.get('region'),tag=url.searchParams.get('tag');
      const all=catalogue.map(publicDestination).filter(d=>(!country||d.countryCode===country) && (!region||d.region.toLowerCase()===region.toLowerCase()) && (!tag||d.tags.includes(tag)) && (!q||[d.name,d.region,d.country,...d.aliases].some(s=>s.toLowerCase().includes(q))));
      all.sort((a,b)=>Number(b.region==='Jharkhand')-Number(a.region==='Jharkhand')||b.guideCount-a.guideCount||a.name.localeCompare(b.name));
      const offset=Math.max(0,Number(url.searchParams.get('offset'))||0),count=Math.min(60,Math.max(1,Number(url.searchParams.get('limit'))||24));
      return json(res,200,{total:all.length,items:all.slice(offset,offset+count)});
    }
    if(route==='/api/catalogue' && req.method==='GET')return json(res,200,{items:publicCatalogue,total:catalogue.length});
    if(route==='/api/recommend' && req.method==='POST'){const payload=await body(req);return json(res,200,recommend(payload.message,payload.preferences||{}));}
    if(route==='/api/conversation' && req.method==='POST'){
      const payload=await body(req),message=String(payload.message||'').trim().slice(0,800);if(!message)throw new PlannerError('Tell me what kind of trip you want.');
      const result=recommend(message,payload.preferences||{}),history=Array.isArray(payload.history)?payload.history:[];
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});
      const send=(event,data)=>{if(!res.destroyed)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);};
      send('suggestions',result);let answer=null;
      const abort=new AbortController();res.on('close',()=>abort.abort());
      try{answer=await localChat.reply(message,history,result,token=>send('token',{text:token}),abort.signal);}catch{}
      if(!answer)send('fallback',{message:result.message});
      send('done',{...result,message:answer||result.message,engine:answer?'Qwen3 0.6B · local language model':result.engine});return res.end();
    }
    if(route==='/api/map-data' && req.method==='POST'){limit(req,'maps',30);return json(res,200,await mapData(await body(req),DATA,mapConfig));}
    if(route==='/api/photos' && req.method==='POST'){
      const payload=await body(req),city=catalogue.find(c=>c.id===String(payload.destinationId));
      if(!city||!Array.isArray(payload.names)||payload.names.length>60)throw new PlannerError('Choose valid itinerary places.');
      let guide=includedGuide(city);if(!guide){try{guide=JSON.parse(fs.readFileSync(path.join(DATA,'places',city.id+'.json'),'utf8'));}catch{}}
      const allowed=preparePlaces(guide?.attractions||[],city),stops=payload.names.map(name=>allowed.find(p=>p.name===name)).filter(Boolean);
      const plan={destination:city,days:[{stops}]};attachIncludedPhotos(plan,includedPhotos);
      return json(res,200,{photos:Object.fromEntries(stops.map(stop=>[stop.name,stop.photo||null]))});
    }
    if(route==='/api/plan' && req.method==='POST'){
      limit(req,'planning',40);const raw=await body(req),input=validateInput(raw),city=catalogue.find(d=>d.id===input.destinationId);
      let guide=includedGuide(city);
      if(!guide){try{guide=await discoverPlaces(city,DATA);}catch(error){error.alternatives=readyAlternatives(city).map(d=>publicCatalogue.find(c=>c.id===d.id));throw error;}}
      let plan=buildPlan(input,guide);if(input.useAi)plan=await enhancePlan(plan,aiConfig);
      if(guide.nearbyCities?.length)plan.warnings.push(`This plan includes sourced attractions around ${city.name}, including ${guide.nearbyCities.slice(0,3).join(', ')}. Check the transfer distances before travelling.`);
      const publicCity=publicDestination(city),coverPhoto=publicCity.image?{image:publicCity.image,...publicCity.photoCredit,subject:publicCity.photoCredit?.subject||city.name,scope:'destination'}:null;
      plan=immediatePhotos(plan,DATA,includedPhotos,coverPhoto);
      const owner=device(req,res);plans.set(plan.id,{plan,owner,created:Date.now()});
      return json(res,200,plan);
    }
    if(route==='/api/pdf' && req.method==='POST'){
      limit(req,'pdf',40);const payload=await body(req),plan=payload.plan;
      validateInput(plan?.input||{});
      if(!plan?.days?.every(d=>Array.isArray(d.stops)&&d.stops.length<=6))throw new PlannerError('Invalid itinerary.');
      await prepareSourcePdfImages(plan,DATA);
      const pdf=exportPdf(plan),filename=`Waypoint-${String(plan.destination.name).replace(/[^a-zA-Z0-9-]/g,'-')}-${plan.input.days}-days.pdf`;
      res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filename}"`,'Content-Length':pdf.length,'Cache-Control':'no-store'});return res.end(pdf);
    }
    if(route==='/api/chat' && req.method==='POST'){
      const {message}=await body(req);const tokens=String(message||'').toLowerCase().slice(0,500).match(/[a-z0-9]{3,}/g)||[];
      const ranked=faq.map(item=>({...item,score:tokens.reduce((sum,t)=>sum+(item.keywords.split(' ').includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score);
      return json(res,200,{answer:ranked[0]?.score?ranked[0].answer:'I can help with planning, budgets, editing, Google sign-in and PDF downloads. Try one of the quick questions below, or ask about a specific Waypoint feature.',suggestions:ranked.slice(0,3).map(x=>x.title)});
    }
    if(route==='/api/trips' && req.method==='GET'){
      const user=currentUser(req);if(!user)throw new PlannerError('Sign in to see account trips.',401);
      return json(res,200,{trips:readStore().trips[user.id]||[]});
    }
    if(route==='/api/trips' && req.method==='POST'){
      const user=currentUser(req);if(!user)throw new PlannerError('Sign in to save to your account.',401);
      const payload=await body(req),{planId}=payload,entry=plans.get(planId);
      if(!entry || entry.owner!==cookies(req).wp_device)throw new PlannerError('Generate this itinerary again before saving it to your account.',404);
      if(payload.plan && payload.plan.id===planId && payload.plan.destination?.id===entry.plan.destination.id && payload.plan.days?.length===entry.plan.days.length && payload.plan.days.every(d=>Array.isArray(d.stops)&&d.stops.length<=6)) {validateInput(payload.plan.input);entry.plan=payload.plan;}
      const store=readStore(),list=store.trips[user.id]||[];const index=list.findIndex(x=>x.id===planId);if(index>=0)list[index]=entry.plan;else list.unshift(entry.plan);
      store.trips[user.id]=list.slice(0,50);writeStore(store);return json(res,200,{saved:true});
    }
    if(route.startsWith('/api/trips/') && req.method==='DELETE'){
      const user=currentUser(req);if(!user)throw new PlannerError('Sign in first.',401);
      const id=route.split('/').pop(),store=readStore();store.trips[user.id]=(store.trips[user.id]||[]).filter(t=>t.id!==id);writeStore(store);return json(res,200,{deleted:true});
    }
    if(route==='/auth/google' && req.method==='GET'){
      if(!googleReady)return redirect(res,'/?auth=not-connected');
      const state=random(),verifier=random();oauthStates.set(state,{verifier,expires:Date.now()+600000});res.setHeader('Set-Cookie',cookie('wp_oauth',state,600));
      const args=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:APP_URL+'/auth/google/callback',response_type:'code',scope:'openid email profile',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
      return redirect(res,'https://accounts.google.com/o/oauth2/v2/auth?'+args);
    }
    if(route==='/auth/google/callback' && req.method==='GET'){
      try{
      const state=url.searchParams.get('state'),entry=oauthStates.get(state);oauthStates.delete(state);res.setHeader('Set-Cookie',cookie('wp_oauth','',0));
      if(!entry || entry.expires<Date.now() || cookies(req).wp_oauth!==state || !url.searchParams.get('code'))return redirect(res,'/?auth=failed');
      const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:APP_URL+'/auth/google/callback',grant_type:'authorization_code',code_verifier:entry.verifier}),signal:AbortSignal.timeout(15000)});
      if(!token.ok)return redirect(res,'/?auth=failed');const tokens=await token.json();
      const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token},signal:AbortSignal.timeout(15000)});
      if(!profileResponse.ok)return redirect(res,'/?auth=failed');const profile=await profileResponse.json();
      if(!profile.sub || !profile.email_verified)return redirect(res,'/?auth=failed');
      const store=readStore(),user={id:profile.sub,name:profile.name||profile.given_name||'Traveller',email:profile.email};store.users[user.id]=user;writeStore(store);
      const session=random();sessions.set(session,{userId:user.id,expires:Date.now()+86400000});res.setHeader('Set-Cookie',[cookie('wp_oauth','',0),cookie('wp_session',session)]);return redirect(res,'/?auth=success');
      }catch(error){console.error('Google sign-in could not connect:',error.cause?.code||error.message);return redirect(res,'/?auth=connection-failed');}
    }
    if(route==='/auth/logout' && req.method==='POST'){sessions.delete(cookies(req).wp_session);res.setHeader('Set-Cookie',cookie('wp_session','',0));return json(res,200,{signedOut:true});}
    if(route.startsWith('/api/') || route.startsWith('/auth/'))return json(res,404,{error:'That endpoint does not exist.'});
    if(/^\/media\/[a-f0-9]{64}\.jpg$/.test(route) && req.method==='GET'){
      const file=path.join(DATA,'media',path.basename(route));if(!fs.existsSync(file)){try{await cacheSourceImage(path.basename(route,'.jpg'),DATA);}catch{}}
      if(!fs.existsSync(file))return json(res,404,{error:'Image unavailable.'});
      const fd=fs.openSync(file,'r'),prefix=Buffer.alloc(12);fs.readSync(fd,prefix,0,12,0);fs.closeSync(fd);
      res.writeHead(200,{'Content-Type':imageMime(prefix)||'image/jpeg','Cache-Control':'public, max-age=604800'});return fs.createReadStream(file).pipe(res);
    }
    if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
    let decoded;try{decoded=decodeURIComponent(route);}catch{throw new PlannerError('Invalid path.');}
    const file=path.resolve(ROOT,'public',decoded==='/'?'index.html':'.'+decoded),publicRoot=path.join(ROOT,'public');
    if(!file.startsWith(publicRoot+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())return json(res,404,{error:'Page not found.'});
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.jpg'?'public, max-age=86400':'no-cache'});
    if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
  }catch(error){if(res.headersSent){res.end();return;}json(res,error.status||500,{error:error instanceof PlannerError?error.message:'Something went wrong. Please try again.',alternatives:error.alternatives||undefined});if(!(error instanceof PlannerError))console.error(error.message);}
});
server.listen(PORT,HOST,()=>{console.log(`Waypoint is ready at ${APP_URL}\n${catalogue.length} destinations | ${publicCatalogue.filter(d=>d.guideCount>=2).length} ready to plan | Chat model: ${localChat.state.available?localChat.state.model:'not installed'}`);if(['localhost','127.0.0.1'].includes(new URL(APP_URL).hostname)){fs.writeFileSync(path.join(ROOT,'public','runtime.json'),JSON.stringify({url:APP_URL,revision}));}localChat.start();});
process.on('SIGINT',()=>{localChat.stop();server.close(()=>process.exit(0));});process.on('SIGTERM',()=>{localChat.stop();server.close(()=>process.exit(0));});
setInterval(()=>{const now=Date.now();for(const [k,v] of sessions)if(v.expires<now)sessions.delete(k);for(const [k,v] of oauthStates)if(v.expires<now)oauthStates.delete(k);for(const [k,v] of rates)if(v.until<now)rates.delete(k);for(const [k,v] of plans)if(v.created<now-86400000)plans.delete(k);},60000).unref();

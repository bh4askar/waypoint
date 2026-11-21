// Dependency-free A4 PDF export. All text is escaped and normalised for the
// built-in Helvetica fonts; layout automatically wraps and paginates.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ascii = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/₹/g,'INR ').replace(/€/g,'EUR ').replace(/£/g,'GBP ').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/…/g,'...').replace(/[^\x20-\x7e\n]/g,' ');
const escape = value => ascii(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const palette={ink:'0.12 0.13 0.19',muted:'0.40 0.42 0.49',purple:'0.39 0.32 0.87',pale:'0.96 0.95 0.99',line:'0.88 0.88 0.93'};

export function exportPdf(plan) {
  if (!plan || !Array.isArray(plan.days) || plan.days.length > 7 || !plan.destination?.name || !plan.input) throw new Error('Invalid itinerary.');
  const pages=[],images=new Map(); let commands=[],y=754;
  const text=(value,x,at,size=11,bold=false,color='ink')=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf ${palette[color]} rg 1 0 0 1 ${x} ${at} Tm (${escape(value)}) Tj ET`);
  const line=(at)=>commands.push(`${palette.line} RG 0.6 w 48 ${at} m 547 ${at} l S`);
  const rect=(x,at,w,h,color)=>commands.push(`${palette[color]} rg ${x} ${at} ${w} ${h} re f`);
  function finish() {
    line(45); text('WAYPOINT / YOUR NEXT GREAT ESCAPE',48,30,8,true,'muted');text(`${pages.length+1}`,530,30,9,false,'muted');
    pages.push(commands.join('\n')); commands=[]; y=754;
  }
  function header(subtitle='YOUR PERSONAL TRAVEL GUIDE') {
    text('waypoint.',48,790,22,true,'purple');text(subtitle,315,792,8,true,'muted');line(772);y=744;
  }
  function ensure(height) { if(y-height<65){finish();header('ITINERARY / CONTINUED');} }
  function wrap(value,size=10.5,width=493) {
    const words=ascii(value).split(/\s+/),lines=[];let s='';
    const max=Math.floor(width/(size*0.53));
    for(const word of words) {
      if(word.length>max){if(s){lines.push(s);s='';}for(let i=0;i<word.length;i+=max)lines.push(word.slice(i,i+max));continue;}
      if((s+' '+word).trim().length>max){lines.push(s);s=word;}else{s=(s+' '+word).trim();}
    }
    if(s)lines.push(s);return lines;
  }
  function paragraph(value,{size=10.5,color='ink',bold=false,gap=10,x=48,width=493}={}) {
    for(const s of wrap(value,size,width)){ensure(size+6);text(s,x,y,size,bold,color);y-=size+5;}
    y-=gap;
  }
  function heading(value,size=17){ensure(45);paragraph(value,{size,bold:true,gap:9});}
  function money(n){return `${plan.input.currency} ${Math.round(Number(n)||0).toLocaleString('en-US')}`;}
  function photo(value,height=155){
    if(!value?.image)return false;let file;
    if(/^\/assets\/(?:(?:places|destinations|exact)\/)?[a-zA-Z0-9_.-]+\.jpg$/.test(value.image))file=path.join(projectRoot,'public',value.image);
    else if(/^\/media\/[a-f0-9]{64}\.jpg$/.test(value.image))file=path.join(process.env.WAYPOINT_DATA_DIR||path.join(projectRoot,'data'),value.image);
    else return false;
    let image=images.get(file);
    if(!image){try{const data=fs.readFileSync(file);if(data[0]!==255||data[1]!==216)return false;let i=2,width=0,h=0,channels=3;while(i<data.length-9){if(data[i]!==255){i++;continue;}const marker=data[i+1];if([192,193,194].includes(marker)){h=data.readUInt16BE(i+5);width=data.readUInt16BE(i+7);channels=data[i+9];break;}if(marker===216||marker===217){i+=2;continue;}i+=2+data.readUInt16BE(i+2);}if(!width||!h||![1,3].includes(channels))return false;image={name:'Im'+(images.size+1),data,width,height:h,channels};images.set(file,image);}catch{return false;}}
    ensure(height+35);const factor=Math.max(499/image.width,height/image.height),w=image.width*factor,h=image.height*factor,x=48-(w-499)/2,at=y-height-(h-height)/2;
    commands.push(`q 48 ${y-height} 499 ${height} re W n ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${at.toFixed(2)} cm /${image.name} Do Q`);y-=height+13;
    paragraph(`${value.subject||'Destination view'}${value.scope==='destination'?' (destination view)':''}${value.artist?' / Photo: '+value.artist:''}${value.license?' / '+value.license:''}`,{size:7,color:'muted',gap:6});
    if(value.source)paragraph(value.source,{size:6.5,color:'purple',gap:8});
    return true;
  }
  header();photo(plan.coverPhoto||plan.days[0]?.stops[0]?.photo,155);
  const boxBottom=y-113;rect(48,boxBottom,499,113,'pale');text(plan.destination.country.toUpperCase(),66,y-28,9,true,'purple');
  const title=wrap(plan.title,25,450);title.slice(0,2).forEach((s,i)=>text(s,66,y-65-i*28,25,true));y=boxBottom-26;
  paragraph(`${plan.input.startDate}  |  ${plan.input.days} days  |  ${plan.input.travellers} traveller${plan.input.travellers===1?'':'s'}  |  ${plan.input.pace} pace`,{size:11,color:'muted'});
  paragraph(plan.summary,{size:12});
  heading('A budget you can actually see');
  for(const [label,key] of [['Accommodation allowance','accommodation'],['Food & cafe stops','food'],['Local transport','transport'],['Activities allowance','activities']]){ensure(26);text(label,48,y,11);text(money(plan.budget[key]),420,y,11,true);y-=26;}
  line(y+9);y-=14;text('Estimated group total',48,y,12,true);text(money(plan.budget.total),420,y,12,true,'purple');y-=30;
  paragraph(`Your budget: ${money(plan.budget.requested)}. ${plan.budget.remaining>=0?'Estimated room remaining: '+money(plan.budget.remaining):'Above your budget by '+money(-plan.budget.remaining)+'. Consider revising your plan.'}`,{color:'muted'});
  paragraph('Illustrative group costs, not live quotes. Flights, visas and intercity travel are excluded. Check current venue hours, admission and access before travelling.',{size:8.5,color:'muted',gap:4});
  for(const day of plan.days){
    finish();header(`DAY ${day.day} / ${day.date}`);
    paragraph(`DAY ${String(day.day).padStart(2,'0')}`,{size:10,bold:true,color:'purple',gap:8});heading(day.title,20);paragraph(day.intro,{color:'muted'});
    photo(day.stops?.find(s=>s.photo)?.photo,145);
    for(const stop of day.stops||[]){
      const description=String(stop.description||'');
      const shortened=description.length>350?description.slice(0,350).replace(/\s+\S*$/,'')+'...':description;
      const blocks=[[`${stop.period.toUpperCase()}  /  ${stop.visitLength}`,8.5,5],[stop.name,14,9],[shortened,9.5,6],[stop.reason,9,4],[`Getting there: ${stop.transfer?.text||'Check your route.'}`,9,4],[stop.practical,9,5],[`Source: ${stop.venueUrl||stop.source}`,7.5,12]];
      const required=17+blocks.reduce((height,[value,size,gap])=>height+wrap(value,size).length*(size+5)+gap,0);
      ensure(required+10);line(y+5);y-=17;
      paragraph(`${stop.period.toUpperCase()}  /  ${stop.visitLength}`,{size:8.5,bold:true,color:'purple',gap:5});
      heading(stop.name,14);paragraph(shortened,{size:9.5,gap:6});
      paragraph(stop.reason,{size:9,color:'muted',gap:4});
      paragraph(`Getting there: ${stop.transfer?.text||'Check your route.'}`,{size:9,color:'muted',gap:4});
      paragraph(stop.practical,{size:9,color:'muted',gap:5});
      paragraph(`Source: ${stop.venueUrl||stop.source}`,{size:7.5,color:'purple',gap:12});
    }
    ensure(70);heading('A proper lunch break',14);paragraph(day.meal.description,{size:10});paragraph(`Meal allowance for your group: ${money(day.meal.estimate)}.`,{size:9,color:'muted'});
    if(day.meal.restaurants?.length)paragraph('Guide-listed options to check: '+day.meal.restaurants.map(r=>r.name).join('; ')+'. Confirm they are currently open.',{size:9,color:'muted'});
    if(day.alternative){heading('An alternative, if plans change',13);paragraph(`${day.alternative.name}: ${String(day.alternative.description||'See the linked guide for more information.').slice(0,170)}`,{size:9.5});}
    for(const tip of day.tips||[])paragraph(tip,{size:9,color:'muted',gap:5});
  }
  const warningsHeight=(plan.warnings||[]).reduce((height,value)=>height+wrap(value,10).length*15+10,0);
  ensure(Math.min(650,270+warningsHeight));
  if(plan.warnings?.length){heading('Before you go',14);for(const warning of plan.warnings)paragraph(warning,{size:10,color:'muted'});}
  heading('Pack a little peace of mind',14);paragraph((plan.packing||[]).join(' / '),{size:10});
  heading('Sources and planning assumptions',14);
  paragraph(`Information source: ${plan.sourceType || 'Travel guide'}. Snapshot retrieved: ${plan.retrieved || 'see source links'}.`,{size:8.5,color:'muted'});
  paragraph(plan.source||'',{size:7.5,color:'purple'});
  paragraph(plan.planningNotes,{size:8.5,color:'muted'});
  paragraph('Travel-guide text adapted from Wikivoyage contributors (CC BY-SA 4.0). OpenStreetMap discoveries, where used, are credited to OpenStreetMap contributors (ODbL). Check all access, prices and opening hours before travelling.',{size:8,color:'muted'});
  finish();
  const objects=[];
  const add=s=>{objects.push(s);return objects.length;};
  const catalogId=add(''),pagesId=add('');
  const regularId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const xobjects=[];for(const image of images.values()){const head=Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.channels===1?'DeviceGray':'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`,'ascii');const id=add(Buffer.concat([head,image.data,Buffer.from('\nendstream','ascii')]));xobjects.push(`/${image.name} ${id} 0 R`);}
  const pageIds=[];
  for(const content of pages){const streamId=add(`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}\nendstream`);pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularId} 0 R /F2 ${boldId} 0 R >> /XObject << ${xobjects.join(' ')} >> >> /Contents ${streamId} 0 R >>`));}
  objects[catalogId-1]=`<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId-1]=`<< /Type /Pages /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] /Count ${pageIds.length} >>`;
  const buffers=[Buffer.from('%PDF-1.4\n','ascii')],offsets=[0];let offset=buffers[0].length;
  objects.forEach((obj,i)=>{offsets.push(offset);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`,'ascii'),Buffer.isBuffer(obj)?obj:Buffer.from(obj,'ascii'),Buffer.from('\nendobj\n','ascii')]);buffers.push(b);offset+=b.length;});
  const xref=offset;
  buffers.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`,'ascii'));
  return Buffer.concat(buffers);
}

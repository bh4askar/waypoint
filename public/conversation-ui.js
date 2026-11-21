const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>`<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
let bridge,preferences={},history=[],busy=false;
function placeCards(items,context){
 const grid=document.createElement('div');grid.className='discovery-inline-suggestions';
 grid.innerHTML=items.map(city=>`<button type="button" class="discovery-place" data-chat-city="${city.id}" aria-label="Plan ${esc(city.name)}, ${esc(city.region||city.country)}"><div class="discovery-place-photo">${city.image?`<img src="${esc(city.image)}" alt="${esc(city.name)}" loading="lazy" decoding="async">`:icon('compass')}<span>${esc(city.matched?.[0]||'Discover')}</span></div><div class="discovery-place-copy"><strong>${esc(city.name)}</strong><small>${esc(city.region||city.country)}</small><p>${esc(city.reason||city.caption)}</p><span class="discovery-place-action">Plan this trip ${icon('arrow')}</span></div></button>`).join('');
 grid.querySelectorAll('[data-chat-city]').forEach(button=>button.addEventListener('click',()=>{const city=bridge.catalogue().find(c=>c.id===button.dataset.chatCity);bridge.openPlanner(city,{interests:context.interests,notes:context.notes,days:context.days,budget:context.budget,travellers:context.travellers});}));return grid;
}
function messageNode(container,text,role,floating){
 const node=document.createElement('div');node.className=floating?`chat-message ${role==='assistant'?'bot':'user'}`:`discovery-message ${role}`;
 const bubble=document.createElement(floating?'div':'p');bubble.textContent=text;
 if(role==='assistant'){const orb=document.createElement('span');orb.className=floating?'message-avatar':'mini-orb';if(floating)orb.innerHTML=icon('spark');node.append(orb);}
 node.append(bubble);container.append(node);return {node,bubble};
}
function scrollToMessage(container,node){container.scrollTop+=node.getBoundingClientRect().top-container.getBoundingClientRect().top-8;}
async function ask(message,{floating=false}={}){
 if(busy||!message.trim())return;busy=true;
 const container=$(floating?'#chat-messages':'#discovery-messages'),input=$(floating?'#chat-message':'#discovery-input');
 messageNode(container,message,'user',floating);input.value='';
 const {node,bubble}=messageNode(container,'Thinking…','assistant',floating);scrollToMessage(container,node);
 $('#discovery-submit').disabled=true;document.querySelectorAll('[data-trip-prompt]').forEach(b=>b.disabled=true);
 $('#conversation-status').textContent='Thinking about your trip…';$('#discovery-state').textContent='Matching your latest preferences';
 let answer='',result=null,grid=null,frame=null;
 function display(text){answer+=text;if(!frame)frame=requestAnimationFrame(()=>{bubble.textContent=answer.replace(/\*\*/g,'');bubble.classList.add('chat-cursor');frame=null;});}
 try{
  const response=await fetch('/api/conversation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,preferences,history}),credentials:'same-origin'});
  if(!response.ok){const data=await response.json();throw new Error(data.error||'The chat could not connect.');}
  let buffer='',decoder=new TextDecoder();
  function handle(block){
   const event=block.match(/^event: (.+)$/m)?.[1],payload=block.match(/^data: (.+)$/m)?.[1];if(!payload)return;const data=JSON.parse(payload);
   if(event==='suggestions'){
    result=data;const {items,message:reply,context,engine,...state}=data;preferences=state;
    const side=$('#discovery-suggestions');side.replaceChildren(placeCards(items,state));
    $('#discovery-state').textContent=context||'Chosen around your interests';
    if(items.length&&!data.support){grid=placeCards(items,state);container.append(grid);scrollToMessage(container,node);}
   }else if(event==='token'){display(data.text);}
   else if(event==='fallback'){answer='';display(data.message);}
   else if(event==='done'){result=data;answer=data.message;if(frame){cancelAnimationFrame(frame);frame=null;}bubble.textContent=answer;scrollToMessage(container,node);$('#conversation-status').textContent=data.engine.includes('Qwen')?'Ready to chat · Local AI':'Ready · Preference suggestions';}
  }
  for await(const part of response.body){buffer+=decoder.decode(part,{stream:true});let split;while((split=buffer.indexOf('\n\n'))>=0){handle(buffer.slice(0,split));buffer=buffer.slice(split+2);}}
  if(buffer.trim())handle(buffer);
  history.push({role:'user',content:message},{role:'assistant',content:result?.message||answer});history=history.slice(-8);
 }catch(error){bubble.textContent=error.message+' Please retry.';$('#conversation-status').textContent='Connection interrupted';}
 finally{if(frame){cancelAnimationFrame(frame);bubble.textContent=answer||bubble.textContent;}bubble.classList.remove('chat-cursor');busy=false;$('#discovery-submit').disabled=false;document.querySelectorAll('[data-trip-prompt]').forEach(b=>b.disabled=false);}
}
export function setupConversation(options){
 bridge=options;const status=document.createElement('p');status.id='conversation-status';status.className='conversation-status';status.textContent='Tell me what you have in mind.';$('.discovery-chat-side').append(status);
 $('#discovery-form').addEventListener('submit',e=>{e.preventDefault();ask($('#discovery-input').value);});
 document.querySelectorAll('[data-trip-prompt]').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.tripPrompt)));
 $('#quick-search-toggle').addEventListener('click',()=>{const form=$('#hero-form');form.hidden=!form.hidden;if(!form.hidden){$('#destination-input').focus();form.scrollIntoView({behavior:'auto',block:'center'});}});
 $('#nav-discovery').addEventListener('click',()=>{bridge.home();$('#discovery-input').focus();});
 $('#discovery-suggestions').replaceChildren(placeCards(options.featured,preferences));
 window.waypointConversation=message=>ask(message,{floating:true});
}

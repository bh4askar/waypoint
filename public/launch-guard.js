// Old server copies share static files. Route browsers to the current server.
window.waypointBootReady=Promise.resolve();
if(location.protocol!=='file:'&&['localhost','127.0.0.1'].includes(location.hostname)){
 window.waypointBootReady=fetch('./runtime.json',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(runtime=>{
  if(runtime?.url&&new URL(runtime.url).origin!==location.origin&&['localhost','127.0.0.1'].includes(new URL(runtime.url).hostname)){
   location.replace(runtime.url+location.pathname+location.search+location.hash);
   return new Promise(()=>{});
  }
 }).catch(()=>{});
}
// File URLs cannot run the API or JavaScript modules. Give a useful entry point.
if (location.protocol === 'file:') {
  const style = document.createElement('style');
  style.textContent = 'body{visibility:hidden}';
  document.head.append(style);
  addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `<main class="file-launch-card"><span>WAYPOINT</span><h1>Your next trip starts here.</h1><p>Open <strong>START.cmd</strong> in the Waypoint folder. It starts the app and opens your browser when everything is ready.</p><p>The folder is one level above this <strong>public</strong> folder. Keep the Waypoint window open while planning.</p><a href="http://localhost:3000">Open the running app →</a><small>If the launcher shows a different address, use that address.</small></main>`;
    style.textContent = 'html{min-height:100%;background:linear-gradient(135deg,#173f3a,#597565);color:#fff;font-family:system-ui,sans-serif}body{margin:0;padding:60px 24px;visibility:visible;display:grid;place-items:center;min-height:80vh;box-sizing:border-box}.file-launch-card{max-width:560px;padding:38px;border:1px solid #ffffff55;border-radius:30px;background:#ffffff18;box-shadow:0 25px 70px #0003;backdrop-filter:blur(20px)}.file-launch-card span{font-size:12px;letter-spacing:3px}.file-launch-card h1{font-size:36px;line-height:1.2;margin:20px 0}.file-launch-card p{line-height:1.8;color:#ffffffdf}.file-launch-card a{display:inline-block;margin:20px 0;padding:14px 20px;background:#fff;color:#21483e;border-radius:30px;font-weight:600;text-decoration:none}.file-launch-card small{display:block;color:#ffffffba;line-height:1.6}';
  }, {once:true});
}

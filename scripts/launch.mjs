import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceRevision} from '../lib/version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {...process.env};
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/);
    if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
} catch {}
const instance = crypto.createHash('sha256').update(root).digest('hex');
const revision = sourceRevision(root);
const initialPort = Number(env.PORT || 3000);
if (Number(process.versions.node.split('.')[0]) < 22 || !Number.isInteger(initialPort) || initialPort < 1 || initialPort > 65535) {
  console.error('Waypoint needs Node.js 22 or newer and a valid PORT (1–65535).');
  process.exit(1);
}
async function healthy(url) {
  try {
    const response = await fetch(url + '/api/health', {signal:AbortSignal.timeout(800)});
    const data = await response.json();
    return data.app === 'waypoint' && data.ready && data.instance === instance && data.revision === revision;
  } catch { return false; }
}
function available(port) {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, env.HOST || '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}
function openBrowser(url) {
  if (env.WAYPOINT_NO_BROWSER === '1') return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, {detached:true, stdio:'ignore', windowsHide:true});
  browser.on('error', () => console.log('Open this address in your browser: ' + url));
  browser.unref();
}
let chosen = null;
for (let port = initialPort; port <= Math.min(65535, initialPort + (env.PORT || env.APP_URL ? 0 : 10)); port++) {
  const url = env.APP_URL || `http://localhost:${port}`;
  if (await healthy(`http://localhost:${port}`)) {
    console.log('Waypoint is already running at ' + url);
    openBrowser(url);
    process.exit(0);
  }
  if (await available(port)) { chosen = {port, url}; break; }
}
if (!chosen) {
  console.error('The Waypoint port is in use. Close the other app or choose a different PORT in .env.');
  process.exit(1);
}
const child = spawn(process.execPath, [path.join(root, 'server.mjs')], {
  cwd:root, env:{...env, PORT:String(chosen.port), APP_URL:chosen.url}, stdio:'inherit', windowsHide:true
});
let stopping = false, started = false;
const stop = () => { if (!stopping) { stopping = true; child.kill(); } };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('error', error => { console.error('Could not start Waypoint: ' + error.message); process.exitCode = 1; });
child.on('exit', code => { stopping = true; process.exitCode = code ?? (started ? 0 : 1); });
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  if (await healthy(`http://localhost:${chosen.port}`)) {
    started = true;
    console.log('Keep this window open. Press Ctrl+C to stop Waypoint.');
    openBrowser(chosen.url);
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!started && !stopping) { console.error('Waypoint did not become ready. Check the startup error above.'); stop(); process.exitCode = 1; }

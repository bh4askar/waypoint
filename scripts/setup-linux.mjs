import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import crypto from 'node:crypto';
import {extractLinuxRuntime} from '../lib/untar.mjs';

const run = promisify(execFile);
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeOnly = process.argv.includes('--runtime-only');
if (!['linux','win32'].includes(process.platform) || process.arch !== 'x64') throw new Error('Linux setup supports x64 Ubuntu or cross-packaging from x64 Windows.');
const base = path.resolve(process.env.WAYPOINT_DATA_DIR || path.join(project, 'data'), 'ai');
fs.mkdirSync(base, {recursive: true});
async function download(url, file, sha256) {
  if (fs.existsSync(file) && fs.statSync(file).size > 100) {
    if (!sha256 || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === sha256) return;
    throw new Error('Checksum mismatch: ' + path.basename(file));
  }
  console.log('Downloading ' + path.basename(file));
  const response = await fetch(url, {signal: AbortSignal.timeout(600000)});
  if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + path.basename(file));
  const temp = file + '.download';
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temp));
  if (sha256 && crypto.createHash('sha256').update(fs.readFileSync(temp)).digest('hex') !== sha256) {
    fs.unlinkSync(temp);
    throw new Error('Checksum mismatch: ' + path.basename(file));
  }
  fs.renameSync(temp, file);
}
const native = path.join(project, 'native');
const archive = path.join(base, 'llama-linux.tar.gz');
await download('https://github.com/ggml-org/llama.cpp/releases/download/b12359/llama-b12359-bin-ubuntu-x64.tar.gz', archive);
fs.mkdirSync(native, {recursive: true});
if(process.platform==='win32')extractLinuxRuntime(archive,native);
else await run('tar', ['-xzf', archive, '-C', native]);
// Azure's image needs the GNU OpenMP library. Copy the verified Ubuntu library unchanged.
const deb = path.join(base, 'libgomp1.deb');
await download('https://security.ubuntu.com/ubuntu/pool/main/g/gcc-12/libgomp1_12.3.0-1ubuntu1~22.04.3_amd64.deb', deb,
  '870c27299185a5dd4accad3b15bf82a7409fd7073cccaa8025875307da4d0ce2');
const unpacked = path.join(base, 'libgomp-unpacked');
fs.mkdirSync(unpacked, {recursive: true});
if (process.platform === 'win32') {
  await run('tar', ['-xf', deb, '-C', unpacked]);
  const payload = fs.readdirSync(unpacked).find(name => name.startsWith('data.tar'));
  if (!payload) throw new Error('Ubuntu library payload is missing.');
  const payloadPath=path.join(unpacked,payload);
  const {stdout}=await run('tar',['-tf',payloadPath]);
  const libraryEntry=stdout.split(/\r?\n/).find(name=>/\/libgomp\.so\.1\.\d/.test(name));
  if(!libraryEntry)throw new Error('Ubuntu library is missing.');
  await run('tar', ['-xf', payloadPath, '-C', unpacked, libraryEntry]);
} else {
  await run('dpkg-deb', ['-x', deb, unpacked]);
}
function find(dir, match) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) { const found = find(item, match); if (found) return found; }
    else if (match(entry.name)) return item;
  }
}
const server = find(native, name => name === 'llama-server');
const library = find(unpacked, name => /^libgomp\.so\.1\.\d/.test(name));
if (!server || !library) throw new Error('Linux runtime extraction is incomplete.');
fs.copyFileSync(library, path.join(path.dirname(server), 'libgomp.so.1'));
fs.chmodSync(server, 0o755);
if (!runtimeOnly) await download('https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf', path.join(base, 'Qwen3-0.6B-Q4_K_M.gguf'));
console.log('Linux runtime ready in native/. Keep it out of Git; include it in Azure deployment ZIPs.');

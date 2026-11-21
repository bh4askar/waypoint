import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';

// Materialise release symlinks as file copies when packaging Linux binaries on Windows.
export function extractLinuxRuntime(archive, destination) {
  const data = gunzipSync(fs.readFileSync(archive));
  const root = path.resolve(destination), links = [];
  const string = (start, length) => data.subarray(start, start + length).toString('utf8').split('\0')[0];
  const inside = name => {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) throw new Error('Unsafe runtime archive path.');
    return file;
  };
  for (let offset = 0; offset + 512 <= data.length;) {
    const name = string(offset, 100);
    if (!name) break;
    const prefix = string(offset + 345, 155);
    const file = inside(prefix ? prefix + '/' + name : name);
    const size = parseInt(string(offset + 124, 12).trim() || '0', 8);
    const type = string(offset + 156, 1);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > data.length) throw new Error('Invalid runtime archive.');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    if (type === '5') fs.mkdirSync(file, {recursive: true});
    else if (type === '2' || type === '1') {
      const target = type === '2' ? path.relative(root, path.resolve(path.dirname(file), string(offset + 157, 100))) : string(offset + 157, 100);
      links.push({file, target: inside(target)});
    } else if (type === '0' || type === '') fs.writeFileSync(file, data.subarray(offset + 512, offset + 512 + size));
    else throw new Error('Unsupported release archive entry: ' + type);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  let pending = links;
  while (pending.length) {
    const next = [];
    for (const link of pending) {
      if (fs.existsSync(link.target)) fs.copyFileSync(link.target, link.file);
      else next.push(link);
    }
    if (next.length === pending.length) throw new Error('Unresolved runtime archive link.');
    pending = next;
  }
}

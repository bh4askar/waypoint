import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export function sourceRevision(root){
 const hash=crypto.createHash('sha256');
 const add=file=>{hash.update(path.relative(root,file));hash.update(fs.readFileSync(file));};
 add(path.join(root,'server.mjs'));add(path.join(root,'package.json'));
 for(const folder of ['lib','public','scripts'])for(const file of fs.readdirSync(path.join(root,folder)).sort())if(/\.(mjs|js|css|html|json)$/.test(file)&&file!=='runtime.json')add(path.join(root,folder,file));
 return hash.digest('hex');
}

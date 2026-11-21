import fs from 'node:fs';import path from 'node:path';import {inflateRawSync} from 'node:zlib';
const table=Array.from({length:256},(_,i)=>{let c=i;for(let n=0;n<8;n++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function crc32(data){let crc=0xffffffff;for(const byte of data)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function extractZip(file,destination){
 const bytes=fs.readFileSync(file),root=path.resolve(destination);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('ZIP directory missing.');
 const entries=bytes.readUInt16LE(end+10);let cursor=bytes.readUInt32LE(end+16);
 for(let n=0;n<entries;n++){
  if(bytes.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid ZIP entry.');
  const flags=bytes.readUInt16LE(cursor+8),method=bytes.readUInt16LE(cursor+10),crc=bytes.readUInt32LE(cursor+16),size=bytes.readUInt32LE(cursor+20),expanded=bytes.readUInt32LE(cursor+24),nameSize=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32),offset=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+nameSize).toString('utf8').replaceAll('\\','/');cursor+=46+nameSize+extra+comment;
  const output=path.resolve(root,name);if(output!==root&&!output.startsWith(root+path.sep))throw new Error('Unsafe ZIP path.');
  if(name.endsWith('/')){fs.mkdirSync(output,{recursive:true});continue;}
  if(flags&1||expanded>100000000||![0,8].includes(method))throw new Error('Unsupported ZIP entry.');
  if(bytes.readUInt32LE(offset)!==0x04034b50)throw new Error('Invalid ZIP data.');
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),compressed=bytes.subarray(start,start+size),data=method===8?inflateRawSync(compressed,{maxOutputLength:100000000}):compressed;
  if(data.length!==expanded||crc32(data)!==crc)throw new Error('ZIP integrity check failed.');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data);
 }
}

import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {get,put,BlobNotFoundError} from '@vercel/blob';
import {dataDirectory,validateData} from '../lib/server/json-store.mjs';

if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Set BLOB_READ_WRITE_TOKEN locally from the private Blob store before migrating.');
if(!process.argv.includes('--confirm'))throw new Error('This uploads local JSON and files to Vercel Blob. Review the source, then rerun with --confirm.');
const root=dataDirectory(),source=path.join(root,'portal.json');
const data=validateData(JSON.parse(await readFile(source,'utf8')));
const keys=[...new Set([...data.documents.map(row=>row.object_key),...data.branding.flatMap(row=>row.logo_key?[row.logo_key]:[])])];
const files=await Promise.all(keys.map(async key=>{
 const filename=path.join(root,'uploads',createHash('sha256').update(key).digest('hex'));
 const bytes=await readFile(filename);
 const doc=data.documents.find(row=>row.object_key===key);
 if(doc&&doc.size!==bytes.length)throw new Error(`Local file size mismatch for ${key}`);
 return {key,path:`portal/uploads/${createHash('sha256').update(key).digest('hex')}`,bytes};
}));
const existing=await get('portal/state.json',{access:'private',useCache:false});
if(existing)throw new Error('Vercel Blob already has portal/state.json. Refusing to overwrite existing data.');
console.log(`Ready to copy ${data.documents.length} document records and ${files.length} private files from ${root}.`);
for(const file of files){
 let current=null;try{current=await get(file.path,{access:'private',useCache:false});}catch(error){if(!(error instanceof BlobNotFoundError))throw error;}
 if(current){const bytes=new Uint8Array(await new Response(current.stream).arrayBuffer());if(!Buffer.from(bytes).equals(file.bytes))throw new Error(`A different Blob already exists at ${file.path}`);continue;}
 try{await put(file.path,Buffer.from(file.bytes),{access:'private',contentType:'application/octet-stream',addRandomSuffix:false});}
 catch(error){
  let retry=null;try{retry=await get(file.path,{access:'private',useCache:false});}catch{}
  if(!retry||!Buffer.from(await new Response(retry.stream).arrayBuffer()).equals(file.bytes))throw error;
 }
}
await put('portal/state.json',JSON.stringify(data,null,2)+'\n',{access:'private',contentType:'application/json',addRandomSuffix:false});
console.log('Migration complete. JSON and all referenced files are stored in the connected private Blob store.');

import 'server-only';
import {mkdir,readFile,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dataDirectory} from './json-store.mjs';

function objectPath(key:string){
  // Keep legacy R2 keys in JSON; hashing avoids path traversal and platform filename restrictions.
  return path.join(dataDirectory(),'uploads',createHash('sha256').update(key).digest('hex'));
}
export const bucket={
  async put(key:string,bytes:Uint8Array){
    const filename=objectPath(key);await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
    const file=await open(filename,'wx',0o600);
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    return {httpEtag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
  },
  async get(key:string){
    try{const bytes=await readFile(objectPath(key));return {body:new Uint8Array(bytes),size:bytes.length,httpEtag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  },
  async head(key:string){const object=await this.get(key);return object?{size:object.size,httpEtag:object.httpEtag}:null;},
  async delete(key:string){try{await unlink(objectPath(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}},
};

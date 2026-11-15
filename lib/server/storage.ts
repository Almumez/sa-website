import 'server-only';
import {mkdir,readFile,unlink,open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {del as blobDel,get as blobGet,head as blobHead,put as blobPut,BlobNotFoundError} from '@vercel/blob';
import {dataDirectory} from './json-store.mjs';
import {vercelBlobPath} from './vercel-json-store.mjs';

function useVercelBlob(){return process.env.VERCEL==='1'||process.env.PORTAL_STORAGE_BACKEND==='vercel-blob';}
function assertBlobConfigured(){if(!(process.env.BLOB_READ_WRITE_TOKEN||(process.env.VERCEL==='1'&&process.env.BLOB_STORE_ID&&process.env.VERCEL_OIDC_TOKEN)))throw new Error('Persistent storage is not connected. Create a private Vercel Blob store and connect it to this project.');}
function objectPath(key:string){
  // Keep legacy R2 keys in JSON; hashing avoids path traversal and platform filename restrictions.
  if(useVercelBlob()){assertBlobConfigured();return vercelBlobPath(key);}
  return path.join(dataDirectory(),'uploads',createHash('sha256').update(key).digest('hex'));
}
export const bucket={
  async put(key:string,bytes:Uint8Array){
    const filename=objectPath(key);
    if(useVercelBlob()){const object=await blobPut(filename,Buffer.from(bytes),{access:'private',contentType:'application/octet-stream',addRandomSuffix:false});return {httpEtag:object.etag};}
    await mkdir(path.dirname(filename),{recursive:true,mode:0o700});
    const file=await open(filename,'wx',0o600);
    try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
    return {httpEtag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
  },
  async get(key:string){
    const filename=objectPath(key);
    if(useVercelBlob()){
      const object=await blobGet(filename,{access:'private',useCache:false});
      if(!object||object.statusCode!==200)return null;
      return {body:object.stream,size:object.blob.size,httpEtag:object.blob.etag};
    }
    try{const bytes=await readFile(filename);return {body:new Uint8Array(bytes),size:bytes.length,httpEtag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  },
  async head(key:string){
    const filename=objectPath(key);
    if(useVercelBlob()){try{const object=await blobHead(filename);return {size:object.size,httpEtag:object.etag};}catch(error){if(error instanceof BlobNotFoundError)return null;throw error;}}
    const object=await this.get(key);return object?{size:object.size,httpEtag:object.httpEtag}:null;
  },
  async delete(key:string){
    const filename=objectPath(key);
    if(useVercelBlob()){await blobDel(filename);return;}
    try{await unlink(filename);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  },
};

import {get, put, BlobPreconditionFailedError} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {emptyData, validateData} from './json-store.mjs';

const dataPath='portal/state.json';
const backupPath='portal/state.previous.json';
const options={access:'private',useCache:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function createVercelJsonStore(client={get,put}){
  async function load(pathname){
    const blob=await client.get(pathname,options);
    if(!blob)return null;
    if(blob.statusCode!==200||!blob.stream)throw new Error(`Unable to read private Blob: ${pathname}`);
    return {raw:await new Response(blob.stream).text(),etag:blob.blob.etag};
  }
  async function read(){
    const current=await load(dataPath);
    if(!current){if(await load(backupPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');return emptyData();}
    try{return validateData(JSON.parse(current.raw));}
    catch(error){throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});}
  }
  async function saveBackup(raw){
    for(let attempt=0;attempt<16;attempt++){
      const current=await load(backupPath);
      try{
        await client.put(backupPath,raw,{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,...(current?{allowOverwrite:true,ifMatch:current.etag}:{})});
        return;
      }catch(error){if(error instanceof BlobPreconditionFailedError){await pause(5+Math.random()*15);continue;}if(!current&&await load(backupPath)){await pause(5+Math.random()*15);continue;}throw error;}
    }
    throw new Error('Unable to update the JSON recovery snapshot; no data was changed.');
  }
  async function transaction(operation){
    for(let attempt=0;attempt<32;attempt++){
      const current=await load(dataPath);
      let previous;
      if(current){
        try{previous=validateData(JSON.parse(current.raw));}
        catch(error){throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});}
      }else{
        if(await load(backupPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');
        previous=emptyData();
      }
      const draft=structuredClone(previous),result=await operation(draft);
      const encoded=JSON.stringify(validateData(draft),null,2)+'\n';
      if(current&&encoded===current.raw)return result;
      if(current)await saveBackup(current.raw);
      try{
        await client.put(dataPath,encoded,{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,...(current?{allowOverwrite:true,ifMatch:current.etag}:{})});
        return result;
      }catch(error){
        if(error instanceof BlobPreconditionFailedError){await pause(5+Math.random()*20);continue;}
        // The first writer uses create-only semantics. If another cold Vercel
        // function initialized the same object first, rerun against its ETag.
        if(!current&&await load(dataPath)){await pause(5+Math.random()*20);continue;}
        throw error;
      }
    }
    throw new Error('JSON storage is busy. Retry the operation.');
  }
  return {read,transaction};
}

export const vercelStore=createVercelJsonStore();

export function vercelBlobPath(key){
  return `portal/uploads/${createHash('sha256').update(key).digest('hex')}`;
}

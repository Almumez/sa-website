import {get, put, BlobPreconditionFailedError} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {emptyData, validateData} from './json-store.mjs';

const dataPath='portal/state.json';
const backupPath='portal/state.previous.json';
const recoveryMarkerPath='portal/recovery/index.json';
const options={access:'private',useCache:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const retryDelay=attempt=>pause(Math.min(5*2**Math.min(attempt,4),80)+Math.floor(Math.random()*11));

export function createVercelJsonStore(client={get,put}){
  async function load(pathname){
    const blob=await client.get(pathname,options);
    if(!blob)return null;
    if(blob.statusCode!==200||!blob.stream)throw new Error(`Unable to read private Blob: ${pathname}`);
    return {raw:await new Response(blob.stream).text(),etag:blob.blob.etag};
  }
  async function read(){
    const current=await load(dataPath);
    if(!current){if(await load(backupPath)||await load(recoveryMarkerPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');return emptyData();}
    try{return validateData(JSON.parse(current.raw));}
    catch(error){throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});}
  }
  async function saveBackup(raw){
    // Sessions and throttle counters change on normal login/logout requests;
    // they are ephemeral and should not cause shared backup overwrites.
    const snapshot=validateData(JSON.parse(raw));
    snapshot.portal_sessions=[];
    snapshot.portal_login_limits=[];
    const snapshotRaw=JSON.stringify(snapshot,null,2)+'\n';
    const snapshotPath=`portal/recovery/${createHash('sha256').update(snapshotRaw).digest('hex')}.json`;
    if(!await load(snapshotPath)){
      try{await client.put(snapshotPath,snapshotRaw,{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60});}
      catch(error){
        if(!(error instanceof BlobPreconditionFailedError)||!(await load(snapshotPath)))throw error;
      }
    }
    // This immutable marker lets the store detect accidental deletion of the
    // main file without rewriting one shared recovery object on every request.
    if(!await load(recoveryMarkerPath)){
      try{await client.put(recoveryMarkerPath,JSON.stringify({format:1},null,2)+'\n',{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60});}
      catch(error){if(!(error instanceof BlobPreconditionFailedError)||!(await load(recoveryMarkerPath)))throw error;}
    }
  }
  async function transaction(operation){
    // The JSON document is shared by all serverless instances. Conditional
    // writes prevent lost updates, but a busy deployment needs enough time to
    // reload the newest ETag and retry instead of failing after a short burst.
    for(let attempt=0;attempt<64;attempt++){
      const current=await load(dataPath);
      let previous;
      if(current){
        try{previous=validateData(JSON.parse(current.raw));}
        catch(error){throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});}
      }else{
        if(await load(backupPath)||await load(recoveryMarkerPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');
        previous=emptyData();
      }
      const draft=structuredClone(previous),result=await operation(draft);
      const encoded=JSON.stringify(validateData(draft),null,2)+'\n';
      if(current&&encoded===current.raw)return result;
      if(current){
        try{await saveBackup(current.raw);}
        catch(error){
          // Recovery snapshots are best-effort. A backup API error must never
          // block login/session writes; the main state update below still uses
          // an ETag condition and cannot silently overwrite concurrent data.
          console.warn('Unable to save a JSON recovery snapshot; continuing with the guarded state update.',error);
        }
      }
      try{
        await client.put(dataPath,encoded,{access:'private',contentType:'application/json',addRandomSuffix:false,cacheControlMaxAge:60,...(current?{allowOverwrite:true,ifMatch:current.etag}:{})});
        return result;
      }catch(error){
        if(error instanceof BlobPreconditionFailedError){await retryDelay(attempt);continue;}
        // The first writer uses create-only semantics. If another cold Vercel
        // function initialized the same object first, rerun against its ETag.
        if(!current&&await load(dataPath)){await retryDelay(attempt);continue;}
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

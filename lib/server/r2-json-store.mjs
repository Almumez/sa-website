import {get as blobGet,put as blobPut,BlobPreconditionFailedError} from '@vercel/blob';
import {GetObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {emptyData,validateData} from './json-store.mjs';
import {withR2StateLock} from './r2-state-lock.mjs';

const accountId=process.env.R2_ACCOUNT_ID;
const bucket=process.env.R2_BUCKET_NAME;
const accessKeyId=process.env.R2_ACCESS_KEY_ID;
const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
const endpoint=process.env.R2_ENDPOINT||`https://${accountId}.r2.cloudflarestorage.com`;
export const r2JsonConfigured=Boolean(accountId&&bucket&&accessKeyId&&secretAccessKey);
const defaultClient=r2JsonConfigured?new S3Client({region:'auto',endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}}):null;
const dataPath='portal/state.json';
const backupPath='portal/state.previous.json';
const markerPath='portal/recovery/index.json';
const blobOptions={access:'private',useCache:false};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function missing(error){return error?.name==='NoSuchKey'||error?.name==='NotFound'||error?.$metadata?.httpStatusCode===404;}
function conflict(error){return error?.name==='PreconditionFailed'||error?.$metadata?.httpStatusCode===412;}
function decode(raw){try{return validateData(JSON.parse(raw));}catch(error){throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});}}

export function createR2JsonStore(client=defaultClient,blobClient={get:blobGet,put:blobPut}){
  if(!client)throw new Error('Cloudflare R2 JSON storage is not configured.');
  async function loadR2(path){
    try{
      const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:path}));
      if(!result.Body)return null;
      return {raw:await result.Body.transformToString(),etag:result.ETag};
    }catch(error){if(missing(error))return null;throw error;}
  }
  async function loadLegacy(path){
    const blob=await blobClient.get(path,blobOptions);
    if(!blob)return null;
    if(blob.statusCode!==200||!blob.stream)throw new Error(`Unable to read legacy private Blob: ${path}`);
    return {raw:await new Response(blob.stream).text(),etag:blob.blob.etag};
  }
  async function read(){
    const current=await loadR2(dataPath);
    if(current)return decode(current.raw);
    if(await loadR2(backupPath)||await loadR2(markerPath))throw new Error('R2 JSON state is missing but a backup exists. Restore a verified backup; data was not reset.');
    const legacy=await loadLegacy(dataPath);
    if(legacy)return decode(legacy.raw);
    if(await loadLegacy(backupPath)||await loadLegacy(markerPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');
    return emptyData();
  }
  async function saveImmutable(path,body){
    try{
      await client.send(new PutObjectCommand({Bucket:bucket,Key:path,Body:body,ContentType:'application/json',IfNoneMatch:'*'}));
    }catch(error){if(!conflict(error))throw error;}
  }
  async function saveRecovery(raw){
    if(raw){
      const snapshot=decode(raw);
      snapshot.portal_sessions=[];
      snapshot.portal_login_limits=[];
      const snapshotRaw=JSON.stringify(snapshot,null,2)+'\n';
      const snapshotPath=`portal/recovery/${createHash('sha256').update(snapshotRaw).digest('hex')}.json`;
      await saveImmutable(snapshotPath,snapshotRaw);
    }
    await saveImmutable(markerPath,JSON.stringify({format:1},null,2)+'\n');
  }
  async function transactionUnlocked(operation){
    for(let attempt=0;attempt<60;attempt++){
      const current=await loadR2(dataPath);
      const legacy=current?null:await loadLegacy(dataPath);
      let previous,previousRaw;
      if(current){previous=decode(current.raw);previousRaw=current.raw;}
      else if(legacy){previous=decode(legacy.raw);previousRaw=legacy.raw;}
      else{
        if(await loadR2(backupPath)||await loadR2(markerPath)||await loadLegacy(backupPath)||await loadLegacy(markerPath))throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');
        previous=emptyData();
      }
      const draft=structuredClone(previous),result=await operation(draft);
      const encoded=JSON.stringify(validateData(draft),null,2)+'\n';
      if(current&&encoded===current.raw)return result;
      try{await saveRecovery(previousRaw);}
      catch(error){console.warn('Unable to save an R2 JSON recovery snapshot; continuing with the conditional state write.',error);}
      try{
        await client.send(new PutObjectCommand({
          Bucket:bucket,Key:dataPath,Body:encoded,ContentType:'application/json',
          ...(current?.etag?{IfMatch:current.etag}:{IfNoneMatch:'*'}),
        }));
        return result;
      }catch(error){
        if(conflict(error)){await delay(Math.min(30+attempt*5,180)+Math.floor(Math.random()*40));continue;}
        if(!current&&await loadR2(dataPath)){await delay(30+Math.floor(Math.random()*40));continue;}
        throw error;
      }
    }
    throw new Error('JSON storage is busy after repeated R2 conditional-write conflicts.');
  }
  async function transaction(operation){return withR2StateLock(()=>transactionUnlocked(operation));}
  return {read,transaction};
}

export const r2JsonStore=r2JsonConfigured?createR2JsonStore():null;

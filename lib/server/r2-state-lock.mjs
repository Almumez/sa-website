import {GetObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';

const accountId=process.env.R2_ACCOUNT_ID;
const bucket=process.env.R2_BUCKET_NAME;
const accessKeyId=process.env.R2_ACCESS_KEY_ID;
const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
const endpoint=process.env.R2_ENDPOINT||`https://${accountId}.r2.cloudflarestorage.com`;
const configured=Boolean(accountId&&bucket&&accessKeyId&&secretAccessKey);
const client=configured?new S3Client({region:'auto',endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}}):null;
const lockKey='portal/locks/json-state.lock';
const leaseMs=30_000;
const refreshMs=8_000;

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function isMissing(error){return error?.name==='NoSuchKey'||error?.name==='NotFound'||error?.$metadata?.httpStatusCode===404;}
function isConflict(error){return error?.name==='PreconditionFailed'||error?.$metadata?.httpStatusCode===412;}

async function readLock(){
  try{
    const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:lockKey}));
    if(!result.Body)return null;
    return {state:JSON.parse(await result.Body.transformToString()),etag:result.ETag};
  }catch(error){if(isMissing(error))return null;throw error;}
}

async function writeLock(state,etag){
  const result=await client.send(new PutObjectCommand({
    Bucket:bucket,Key:lockKey,Body:JSON.stringify(state),ContentType:'application/json',
    ...(etag?{IfMatch:etag}:{IfNoneMatch:'*'}),
  }));
  if(result.ETag)return result.ETag;
  const current=await readLock();
  return current?.etag;
}

async function acquire(){
  const deadline=Date.now()+15_000;
  const owner=randomUUID();
  for(let attempt=0;Date.now()<deadline;attempt++){
    const current=await readLock();
    if(!current||current.state.expiresAt<=Date.now()){
      try{
        const etag=await writeLock({owner,expiresAt:Date.now()+leaseMs},current?.etag);
        if(!etag)throw new Error('Cloudflare R2 did not return an ETag for the JSON write lock.');
        return {owner,etag};
      }catch(error){if(!isConflict(error))throw error;}
    }
    await pause(Math.min(80+attempt*8,250)+Math.floor(Math.random()*60));
  }
  throw new Error('JSON storage is busy. Another write is still in progress; retry shortly.');
}

export async function withR2StateLock(operation){
  if(!configured)return operation();
  const lease=await acquire();
  let etag=lease.etag,lost=false,stopped=false,timer,refreshing=Promise.resolve();
  const refresh=async()=>{
    try{etag=await writeLock({owner:lease.owner,expiresAt:Date.now()+leaseMs},etag);}
    catch(error){if(isConflict(error))lost=true;else console.error('R2 JSON lock refresh failed:',error);}
  };
  const schedule=()=>{if(stopped)return;timer=setTimeout(()=>{refreshing=refresh().finally(schedule);},refreshMs);timer.unref?.();};
  schedule();
  try{
    const result=await operation();
    if(lost)throw new Error('JSON storage lock was lost during the write; retry the operation.');
    return result;
  }finally{
    stopped=true;
    clearTimeout(timer);
    await refreshing;
    if(!lost){
      try{await writeLock({owner:null,expiresAt:0},etag);}
      catch(error){if(!isConflict(error))console.error('R2 JSON lock release failed:',error);}
    }
  }
}

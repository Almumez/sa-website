import 'server-only';
import {DeleteObjectCommand,GetObjectCommand,HeadObjectCommand,PutObjectCommand,S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {vercelBlobPath} from './vercel-json-store.mjs';

const accountId=process.env.R2_ACCOUNT_ID;
const bucketName=process.env.R2_BUCKET_NAME;
const accessKeyId=process.env.R2_ACCESS_KEY_ID;
const secretAccessKey=process.env.R2_SECRET_ACCESS_KEY;
export const r2Configured=Boolean(accountId&&bucketName&&accessKeyId&&secretAccessKey);
const client=r2Configured?new S3Client({region:'auto',endpoint:`https://${accountId}.r2.cloudflarestorage.com`,credentials:{accessKeyId:accessKeyId!,secretAccessKey:secretAccessKey!}}):null;

function s3(){if(!client||!bucketName)throw new Error('Cloudflare R2 is not configured.');return {client,bucket:bucketName};}
function notFound(error:unknown){const value=error as {$metadata?:{httpStatusCode?:number};name?:string};return value?.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey','NoSuchBucket'].includes(value?.name||'');}
export function r2Path(key:string){return vercelBlobPath(key);}

export async function r2Put(key:string,bytes:Uint8Array){
 const {client,bucket}=s3();
 await client.send(new PutObjectCommand({Bucket:bucket,Key:r2Path(key),Body:Buffer.from(bytes),ContentType:'application/octet-stream'}));
}
export async function r2Get(key:string){
 const {client,bucket}=s3();
 try{
  const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:r2Path(key)}));
  if(!result.Body)return null;
  return {body:new Uint8Array(await result.Body.transformToByteArray()),size:result.ContentLength||0,httpEtag:result.ETag||''};
 }catch(error){if(notFound(error))return null;throw error;}
}
export async function r2Head(key:string){
 const {client,bucket}=s3();
 try{const result=await client.send(new HeadObjectCommand({Bucket:bucket,Key:r2Path(key)}));return {size:result.ContentLength||0,httpEtag:result.ETag||''};}
 catch(error){if(notFound(error))return null;throw error;}
}
export async function r2Delete(key:string){
 const {client,bucket}=s3();
 await client.send(new DeleteObjectCommand({Bucket:bucket,Key:r2Path(key)}));
}
export async function createR2UploadUrl(key:string,contentType:string){
 const {client,bucket}=s3();
 return getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:r2Path(key),ContentType:contentType}),{expiresIn:300});
}

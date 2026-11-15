import 'server-only';
import {createHmac, timingSafeEqual, createHash} from 'node:crypto';
import {PutObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {bucket, bucketName, storageClient} from './storage';
import {validateFile, UploadError} from '@/app/uploaded-files';

type Ticket = {key:string;owner:string;filename:string;size:number;sha256:string;expires:number};
function secret() {
  const value=process.env.UPLOAD_SIGNING_SECRET;
  if (!value || value.length<32) throw new Error('UPLOAD_SIGNING_SECRET must contain at least 32 characters.');
  return value;
}
function signature(value:string) {return createHmac('sha256',secret()).update(value).digest('base64url');}
export async function createUpload(owner:string, filename:string, size:number, sha256:string) {
  if (!filename || filename.length>255 || !Number.isInteger(size) || size<1 || size>20*1024*1024 || !/^[a-f0-9]{64}$/.test(sha256)) throw new UploadError('ملف أو حجم غير صالح');
  const ticket:Ticket={key:`staging/${owner}/${crypto.randomUUID()}`,owner,filename,size,sha256,expires:Date.now()+600000};
  const payload=Buffer.from(JSON.stringify(ticket)).toString('base64url');
  const checksum=Buffer.from(sha256,'hex').toString('base64');
  const url=await getSignedUrl(storageClient(),new PutObjectCommand({Bucket:bucketName(),Key:ticket.key,
    ContentType:'application/octet-stream',ContentLength:size,ChecksumSHA256:checksum}),{expiresIn:600});
  return {url,token:payload+'.'+signature(payload),checksum};
}
export async function resolveUpload(token:unknown,owner:string) {
  if (typeof token!=='string' || token.length>4096) throw new UploadError('رمز الرفع غير صالح');
  const [payload,sig,...extra]=token.split('.');
  const expected=signature(payload),actual=Buffer.from(sig||'');
  if (extra.length || actual.length!==expected.length || !timingSafeEqual(actual,Buffer.from(expected))) throw new UploadError('رمز الرفع غير صالح');
  let ticket:Ticket;
  try {ticket=JSON.parse(Buffer.from(payload,'base64url').toString());} catch {throw new UploadError('رمز الرفع غير صالح');}
  if (ticket.owner!==owner || ticket.expires<Date.now() || !ticket.key.startsWith(`staging/${owner}/`)) throw new UploadError('انتهت صلاحية الرفع؛ أعد المحاولة');
  const head=await bucket.head(ticket.key);
  if (!head || head.size!==ticket.size || head.size>20*1024*1024) throw new UploadError('حجم الملف المرفوع غير صحيح');
  const object=await bucket.get(ticket.key);
  if (!object) throw new UploadError('الملف المرفوع غير موجود');
  const bytes=new Uint8Array(await new Response(object.body).arrayBuffer());
  if (bytes.length!==ticket.size || createHash('sha256').update(bytes).digest('hex')!==ticket.sha256) throw new UploadError('محتوى الملف المرفوع غير مطابق');
  // Never publish staging objects. Existing save routes copy validated bytes to a new private key.
  const upload=await validateFile(new File([bytes],ticket.filename));
  await bucket.delete(ticket.key);
  return upload;
}

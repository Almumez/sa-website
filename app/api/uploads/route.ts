import {handleUpload,type HandleUploadBody} from '@vercel/blob/client';
import {getPortalAdmin} from '@/app/portal-access';
import {sameOrigin,authJSON} from '@/app/auth-utils';
import {vercelBlobPath} from '@/lib/server/vercel-json-store.mjs';
import {createR2UploadUrl,r2Configured} from '@/lib/server/r2-storage';

const types:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv',zip:'application/zip'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:Request){
 if(!sameOrigin(request))return authJSON({error:'طلب غير مسموح'},403);
 const user=await getPortalAdmin();if(!user)return authJSON({error:'يرجى تسجيل الدخول'},401);
 if(!user.canAdd&&!user.canEdit)return authJSON({error:'ليس لديك صلاحية رفع الملفات'},403);
 let body:HandleUploadBody;try{body=await request.json() as HandleUploadBody;}catch{return authJSON({error:'طلب رفع غير صالح'},400);}
 if(r2Configured){
  const data=body as unknown as {key?:unknown;filename?:unknown;contentType?:unknown;size?:unknown};
  const key=data?.key,filename=data?.filename,size=Number(data?.size);
  if(typeof key!=='string'||!key.startsWith(`${user.ownerId}/`)||!uuid.test(key.slice(user.ownerId.length+1))||typeof filename!=='string'||filename.length>255)return authJSON({error:'بيانات الملف غير صالحة'},400);
  const extension=filename.split('.').pop()?.toLowerCase()||'',contentType=types[extension];
  if(!contentType||data.contentType!==contentType)return authJSON({error:'نوع الملف غير مدعوم'},400);
  if(!Number.isFinite(size)||size<1||size>20*1024*1024)return authJSON({error:'الحد الأقصى للملف 20 ميجابايت'},413);
  try{return authJSON({uploadUrl:await createR2UploadUrl(key,contentType),objectKey:key,filename});}
  catch(error){console.error('R2 upload URL creation failed:',error);return authJSON({error:'تعذر تجهيز رابط الرفع إلى Cloudflare R2'},503);}
 }
 if(!process.env.BLOB_READ_WRITE_TOKEN)return authJSON({error:'اربط مخزن Vercel Blob الخاص بالمشروع وفعّل read-write token للرفع المباشر.'},503);
 try{
  const response=await handleUpload({body,request,onBeforeGenerateToken:async(pathname,clientPayload)=>{
   let metadata:any;try{metadata=JSON.parse(clientPayload||'null')}catch{throw new Error('بيانات رفع غير صالحة');}
   const key=metadata?.key,filename=metadata?.filename;
   if(typeof key!=='string'||!key.startsWith(`${user.ownerId}/`)||!uuid.test(key.slice(user.ownerId.length+1))||pathname!==vercelBlobPath(key)||typeof filename!=='string'||filename.length>255)throw new Error('مسار رفع غير صالح');
   const extension=filename.split('.').pop()?.toLowerCase()||'',contentType=types[extension];
   if(!contentType)throw new Error('نوع الملف غير مدعوم');
   return {allowedContentTypes:[contentType],maximumSizeInBytes:20*1024*1024,addRandomSuffix:false,tokenPayload:JSON.stringify({ownerId:user.ownerId,key})};
  }});
  return Response.json(response,{headers:{'Cache-Control':'no-store'}});
 }catch(error){return authJSON({error:error instanceof Error?error.message:'تعذر بدء رفع الملف'},400);}
}

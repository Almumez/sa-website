import {sameOrigin} from '@/app/auth-utils';
import {store,listDocuments} from '@/lib/server/repository';
import {bucket} from '@/lib/server/storage';
import type {DocumentRecord} from '@/lib/server/models';
import {getPortalAdmin as getChatGPTUser} from '../../portal-access';
import {validateFile,UploadError} from '../../uploaded-files';
const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'] as const;
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(request:Request){
 try{const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 const trash=new URL(request.url).searchParams.get('trash')==='1'?1:0;
 const rows=await listDocuments(u.ownerId,trash);return json({documents:rows.map(({owner:_owner,object_key:_key,...document})=>document)});
 }catch(error){console.error('Document list failed:',error);return json({error:'تعذر تحميل الملفات. أعد المحاولة أو راجع سجلات Vercel.'},503)}
}
async function handlePost(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(!u.canAdd)return json({error:'ليس لديك صلاحية إضافة الملفات'},403);
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 const length=Number(request.headers.get('content-length')||0);if(length>22*1024*1024)return json({error:'الحد الأقصى للملف 20 ميجابايت'},413);
 let data:FormData|Record<string,unknown>,upload:Awaited<ReturnType<typeof validateFile>>;
 let uploadedKey:string|null=null;
 try{
  if(request.headers.get('content-type')?.includes('application/json')){
   const body=await request.json() as Record<string,unknown>;
   uploadedKey=typeof body.objectKey==='string'?body.objectKey:null;
   if(!uploadedKey||!uploadedKey.startsWith(`${u.ownerId}/`)||! /^[0-9a-f-]{36}$/i.test(uploadedKey.slice(u.ownerId.length+1)))return json({error:'الملف المرفوع غير صالح'},400);
   const object=await bucket.get(uploadedKey);if(!object)return json({error:'انتهت صلاحية رفع الملف. أعد رفعه.'},400);
   const bytes=object.body instanceof Uint8Array?object.body:new Uint8Array(await new Response(object.body).arrayBuffer());
   upload=await validateFile(new File([Buffer.from(bytes)],String(body.filename||''),{type:'application/octet-stream'}));
   data=body;
  }else{
   const form=await request.formData();upload=await validateFile(form.get('file'));data=form;
  }
 }catch(e){if(uploadedKey)await bucket.delete(uploadedKey);if(e instanceof UploadError)return json({error:e.message},e.status);return json({error:'تعذرت قراءة الملف المرفوع'},400)}
 const values=fields.map(f=>String(data instanceof FormData?data.get(f)||'':data[f]||'').trim());
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500)){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'أدخل عنوانًا صالحًا وبيانات لا تتجاوز 500 حرف'},400)}
 if(!values[3])values[3]=new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4])){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'تاريخ أو حالة غير صالحة'},400)}
 const id=crypto.randomUUID();if(!values[1])values[1]=`DOC-${Date.now().toString().slice(-8)}`;
 if(!values[9])values[9]='عام';const key=uploadedKey||`${u.ownerId}/${id}`;
 if(!uploadedKey)await bucket.put(key,upload.bytes);
 const document={id,slug:null,owner:u.ownerId,filename:upload.filename,mime:upload.mime,size:upload.size,object_key:key,...Object.fromEntries(fields.map((field,index)=>[field,values[index]])),uploaded_at:new Date().toISOString(),deleted:0} as DocumentRecord;
 try{await store.transaction(data=>{data.documents.push(document);});}catch(error){try{await bucket.delete(key)}catch(cleanupError){console.error('Failed to remove an unreferenced uploaded blob:',cleanupError)}throw error;}
 return json({id},201);
}
export async function POST(request:Request){
 try{return await handlePost(request)}catch(error){
  console.error('Document upload failed:',error);
  const busy=error instanceof Error&&error.message.includes('JSON storage is busy');
  return json({error:busy?'التخزين مشغول حاليًا؛ أعد المحاولة بعد قليل.':'تعذر حفظ الملف أو بياناته. راجع سجلات Vercel إذا تكررت المشكلة.'},busy?503:500);
 }
}

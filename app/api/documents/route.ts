import {sameOrigin} from '@/app/auth-utils';
import {store,listDocuments} from '@/lib/server/repository';
import {bucket} from '@/lib/server/storage';
import type {DocumentRecord} from '@/lib/server/models';
import {getPortalAdmin as getChatGPTUser} from '../../portal-access';
import {validateFile,UploadError} from '../../uploaded-files';
const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'] as const;
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 const trash=new URL(request.url).searchParams.get('trash')==='1'?1:0;
 const rows=await listDocuments(u.ownerId,trash);return json({documents:rows.map(({owner:_owner,object_key:_key,...document})=>document)});
}
export async function POST(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(!u.canAdd)return json({error:'ليس لديك صلاحية إضافة الملفات'},403);
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 const length=Number(request.headers.get('content-length')||0);if(length>22*1024*1024)return json({error:'الحد الأقصى للملف 20 ميجابايت'},413);
 let data:FormData;try{data=await request.formData()}catch{return json({error:'تعذرت قراءة الملف'},400)}
 let upload:Awaited<ReturnType<typeof validateFile>>;try{upload=await validateFile(data.get('file'))}catch(e){if(e instanceof UploadError)return json({error:e.message},e.status);throw e}
 const values=fields.map(f=>String(data.get(f)||'').trim());
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500))return json({error:'أدخل عنوانًا صالحًا وبيانات لا تتجاوز 500 حرف'},400);
 if(!values[3])values[3]=new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4]))return json({error:'تاريخ أو حالة غير صالحة'},400);
 const id=crypto.randomUUID();if(!values[1])values[1]=`DOC-${Date.now().toString().slice(-8)}`;
 if(!values[9])values[9]='عام';const key=`${u.ownerId}/${id}`;
 await bucket.put(key,upload.bytes);
 const document={id,slug:null,owner:u.ownerId,filename:upload.filename,mime:upload.mime,size:upload.size,object_key:key,...Object.fromEntries(fields.map((field,index)=>[field,values[index]])),uploaded_at:new Date().toISOString(),deleted:0} as DocumentRecord;
 try{await store.transaction(data=>{data.documents.push(document);});}catch(error){await bucket.delete(key);throw error;}
 return json({id},201);
}

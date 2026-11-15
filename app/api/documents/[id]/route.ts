import {sameOrigin} from '@/app/auth-utils';
import {store} from '@/lib/server/repository';
import {bucket} from '@/lib/server/storage';
import {getPortalAdmin as getChatGPTUser} from '../../../portal-access';
import {findDocument,normalizeSlug,validSlug} from '../../../document-links';
import {validateFile,UploadError} from '../../../uploaded-files';
import {timestampDownloadName} from '../../../download-filename';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const d=await findDocument(id);if(!d)return json({error:'الوثيقة غير موجودة أو في سلة المحذوفات'},404);
 const url=new URL(request.url);if(url.searchParams.get('metadata')==='1'){const {object_key:_key,owner:_owner,...document}=d;return json({document})}
 const object=await bucket.get(d.object_key);if(!object)return json({error:'الملف غير متاح'},404);
 const urlDownload=url.searchParams.get('download')==='1';
 const inline=d.mime==='application/pdf'||d.mime.startsWith('image/');
 const name=timestampDownloadName(d.filename);
 const disposition=`${urlDownload||!inline?'attachment':'inline'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
 return new Response(object.body,{headers:{'Content-Type':d.mime,'Content-Length':String(object.size),'ETag':object.httpEtag,'Content-Disposition':disposition,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'X-Frame-Options':'SAMEORIGIN'}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 if(Number(request.headers.get('content-length')||0)>22*1024*1024)return json({error:'الحد الأقصى للملف 20 ميجابايت'},413);
 const {id}=await params;let d:any,form:FormData|null=null,uploadedKey:string|null=null;
 try{if(request.headers.get('content-type')?.includes('multipart/form-data')){form=await request.formData();d=Object.fromEntries(form.entries())}else d=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 if(!d||typeof d!=='object')return json({error:'بيانات غير صالحة'},400);
 if(typeof d.deleted==='boolean'){if(!u.canDelete)return json({error:'ليس لديك صلاحية حذف الملفات واستعادتها'},403)}else if(!u.canEdit)return json({error:'ليس لديك صلاحية تعديل الملفات'},403);
 const existing=(await store.read()).documents.find(row=>row.id===id&&row.owner===u.ownerId);if(!existing)return json({error:'الوثيقة غير موجودة'},404);
 if(typeof d.deleted==='boolean'){await store.transaction(data=>{const current=data.documents.find(row=>row.id===id&&row.owner===u.ownerId);if(current)current.deleted=d.deleted?1:0;});return json({ok:true})}
 const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'];
 const values=fields.map(f=>Object.prototype.hasOwnProperty.call(d,f)?String(d[f]??'').trim():String(existing[f as keyof typeof existing]??''));
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500)||!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4])){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'تحقق من العنوان والتاريخ والحالة'},400)}
 const hasSlug=Object.prototype.hasOwnProperty.call(d,'slug');
 if(hasSlug&&d.slug!=null&&typeof d.slug!=='string'){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'جزء الرابط غير صالح'},400)}
 const slug=hasSlug?normalizeSlug(d.slug||''):existing.slug;
 if(hasSlug&&slug&&!validSlug(slug)){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'استخدم 3 إلى 100 حرف عربي أو إنجليزي أو أرقام وشرطات، دون مسافات أو رموز الروابط'},400)}
 let upload:Awaited<ReturnType<typeof validateFile>>|null=null;
 if(form?.has('file')){
  if(existing.deleted)return json({error:'استعد الملف من السلة قبل استبداله'},409);
  try{upload=await validateFile(form!.get('file'))}catch(e){if(e instanceof UploadError)return json({error:e.message},e.status);throw e}
 }
 if(!form&&typeof d.objectKey==='string'){
  if(existing.deleted)return json({error:'استعد الملف من السلة قبل استبداله'},409);
  if(!d.objectKey.startsWith(`${u.ownerId}/`)||! /^[0-9a-f-]{36}$/i.test(d.objectKey.slice(u.ownerId.length+1)))return json({error:'الملف المرفوع غير صالح'},400);
  uploadedKey=d.objectKey;
  const object=await bucket.get(d.objectKey);if(!object)return json({error:'انتهت صلاحية رفع الملف. أعد رفعه.'},400);
  const bytes=object.body instanceof Uint8Array?object.body:new Uint8Array(await new Response(object.body).arrayBuffer());
  try{upload=await validateFile(new File([Buffer.from(bytes)],String(d.filename||''),{type:'application/octet-stream'}))}catch(e){if(e instanceof UploadError){await bucket.delete(d.objectKey);return json({error:e.message},e.status)}throw e}
 }
 const ifMatch=request.headers.get('if-match');
 if(upload&&ifMatch){const current=await bucket.head(existing.object_key);if(!current||current.httpEtag!==ifMatch){if(uploadedKey)await bucket.delete(uploadedKey);return json({error:'تم تغيير الملف منذ فتح المحرر. أعد فتحه قبل حفظ تعديلات جديدة.'},409)}}
 const newKey=upload?(uploadedKey||`${u.ownerId}/${id}/${crypto.randomUUID()}`):null;
 const newObject=upload&&newKey&&!uploadedKey?await bucket.put(newKey,upload.bytes):null;
 try{
  const updated=await store.transaction(data=>{
   const current=data.documents.find(row=>row.id===id&&row.owner===u.ownerId);
   if(!current||JSON.stringify(current)!==JSON.stringify(existing))return false;
   if(hasSlug&&slug&&data.document_links.some(link=>link.slug===slug&&link.document_id!==id))return false;
   if(hasSlug&&slug&&!data.document_links.some(link=>link.slug===slug))data.document_links.push({slug,document_id:id});
   Object.assign(current,Object.fromEntries(fields.map((field,index)=>[field,values[index]])));
   if(hasSlug)current.slug=slug||null;
   if(upload&&newKey)Object.assign(current,{filename:upload.filename,mime:upload.mime,size:upload.size,object_key:newKey});
   return true;
  });
  if(!updated){if(newKey)await bucket.delete(newKey);return json({error:'تم تغيير الملف أو استخدام الرابط؛ أعد فتح المحرر.'},409);}
 }catch(error){if(newKey)await bucket.delete(newKey);throw error;}
 // Retain prior content for backups and recovery; published links use the new key only.
 return json({ok:true,slug:slug||null,replaced:!!upload,etag:newObject?.httpEtag});
}

import {sameOrigin} from '@/app/auth-utils';
import {resolveUpload} from '@/lib/server/uploads';
import {downloadURL} from '@/lib/server/storage';
import {env} from '@/lib/server/env';
import {getPortalAdmin as getChatGPTUser} from '../../../portal-access';
import {findDocument,normalizeSlug,validSlug} from '../../../document-links';
import {validateFile,UploadError} from '../../../uploaded-files';
import {timestampDownloadName} from '../../../download-filename';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const d:any=await findDocument(id);if(!d)return json({error:'الوثيقة غير موجودة أو في سلة المحذوفات'},404);
 const url=new URL(request.url);if(url.searchParams.get('metadata')==='1'){delete d.object_key;delete d.owner;return json({document:d})}
 const object=await env.BUCKET!.head(d.object_key);if(!object)return json({error:'الملف غير متاح'},404);
 const urlDownload=url.searchParams.get('download')==='1';
 const inline=d.mime==='application/pdf'||d.mime.startsWith('image/');
 const name=timestampDownloadName(d.filename);
 const disposition=`${urlDownload||!inline?'attachment':'inline'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
 return new Response(null,{status:307,headers:{Location:await downloadURL(d.object_key,d.mime,disposition),'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 if(Number(request.headers.get('content-length')||0)>22*1024*1024)return json({error:'الحد الأقصى للملف 20 ميجابايت'},413);
 const {id}=await params;let d:any,form:FormData|null=null;
 try{if(request.headers.get('content-type')?.includes('multipart/form-data')){form=await request.formData();d=Object.fromEntries(form.entries())}else d=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 if(!d||typeof d!=='object')return json({error:'بيانات غير صالحة'},400);
 if(typeof d.deleted==='boolean'){if(!u.canDelete)return json({error:'ليس لديك صلاحية حذف الملفات واستعادتها'},403)}else if(!u.canEdit)return json({error:'ليس لديك صلاحية تعديل الملفات'},403);
 const existing:any=await env.DB!.prepare('SELECT * FROM documents WHERE id=? AND owner=?').bind(id,u.ownerId).first();if(!existing)return json({error:'الوثيقة غير موجودة'},404);
 if(typeof d.deleted==='boolean'){await env.DB!.prepare('UPDATE documents SET deleted=? WHERE id=? AND owner=?').bind(d.deleted?1:0,id,u.ownerId).run();return json({ok:true})}
 const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'];
 const values=fields.map(f=>Object.prototype.hasOwnProperty.call(d,f)?String(d[f]??'').trim():String(existing[f]??''));
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500)||!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4]))return json({error:'تحقق من العنوان والتاريخ والحالة'},400);
 const hasSlug=Object.prototype.hasOwnProperty.call(d,'slug');
 if(hasSlug&&d.slug!=null&&typeof d.slug!=='string')return json({error:'جزء الرابط غير صالح'},400);
 const slug=hasSlug?normalizeSlug(d.slug||''):existing.slug;
 if(hasSlug&&slug&&!validSlug(slug))return json({error:'استخدم 3 إلى 100 حرف عربي أو إنجليزي أو أرقام وشرطات، دون مسافات أو رموز الروابط'},400);
 let upload:Awaited<ReturnType<typeof validateFile>>|null=null;
 if(form?.has('file')||d.uploadToken){
  if(existing.deleted)return json({error:'استعد الملف من السلة قبل استبداله'},409);
  try{upload=d.uploadToken?await resolveUpload(d.uploadToken,u.ownerId):await validateFile(form!.get('file'))}catch(e){if(e instanceof UploadError)return json({error:e.message},e.status);throw e}
 }
 const ifMatch=request.headers.get('if-match');
 if(upload&&ifMatch){const current=await env.BUCKET!.head(existing.object_key);if(!current||current.httpEtag!==ifMatch)return json({error:'تم تغيير الملف منذ فتح المحرر. أعد فتحه قبل حفظ تعديلات جديدة.'},409)}
 const newKey=upload?`${u.ownerId}/${id}/${crypto.randomUUID()}`:null;
 const newObject=upload&&newKey?await env.BUCKET!.put(newKey,upload.bytes,{httpMetadata:{contentType:upload.mime}}):null;
 const fileGuard=upload?' AND object_key=?':'';const guardArgs=upload?[existing.object_key]:[];
 const assignments=[...fields.map(f=>`${f}=?`)],args:any[]=[...values];
 if(hasSlug){assignments.push('slug=?');args.push(slug||null)}
 if(upload){assignments.push('filename=?','mime=?','size=?','object_key=?');args.push(upload.filename,upload.mime,upload.size,newKey)}
 try{
  if(hasSlug&&slug){
   const result=await env.DB!.batch([
    env.DB!.prepare('INSERT INTO document_links (slug,document_id) VALUES (?,?) ON CONFLICT(slug) DO NOTHING').bind(slug,id),
    env.DB!.prepare(`UPDATE documents SET ${assignments.join(',')} WHERE id=? AND owner=?${fileGuard} AND EXISTS(SELECT 1 FROM document_links WHERE slug=? AND document_id=?)`).bind(...args,id,u.ownerId,...guardArgs,slug,id)
   ]);
   if(!result[1].meta.changes){if(newKey)await env.BUCKET!.delete(newKey);return json({error:ifMatch?'تم تغيير الملف أو استخدام الرابط؛ أعد فتح المحرر.':'هذا الرابط مستخدم لملف آخر. اختر رابطًا مختلفًا.'},409)}
  }else{const result=await env.DB!.prepare(`UPDATE documents SET ${assignments.join(',')} WHERE id=? AND owner=?${fileGuard}`).bind(...args,id,u.ownerId,...guardArgs).run();if(!result.meta.changes){if(newKey)await env.BUCKET!.delete(newKey);return json({error:'تم تغيير الملف منذ فتح المحرر. أعد فتحه قبل الحفظ.'},409)}}
 }catch(e){if(newKey)await env.BUCKET!.delete(newKey);throw e}
 if(newKey){try{await env.BUCKET!.delete(existing.object_key)}catch{console.warn('Replaced file saved; old object cleanup deferred')}}
 return json({ok:true,slug:slug||null,replaced:!!upload,etag:newObject?.httpEtag});
}

import {env} from 'cloudflare:workers';
import {getPortalAdmin as getChatGPTUser} from '../../portal-access';
import {validateFile,UploadError} from '../../uploaded-files';
const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'] as const;
function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export async function GET(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 const trash=new URL(request.url).searchParams.get('trash')==='1'?1:0;
 const rows=await env.DB!.prepare('SELECT id,slug,title,filename,mime,size,document_number,unified_number,created,status,facility,cr,subscription,applicant,category,uploaded_at,deleted FROM documents WHERE owner=? AND deleted=? ORDER BY uploaded_at DESC').bind(u.userId,trash).all();return json({documents:rows.results});
}
export async function POST(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'طلب غير مسموح'},403);
 const length=Number(request.headers.get('content-length')||0);if(length>22*1024*1024)return json({error:'الحد الأقصى للملف 20 ميجابايت'},413);
 let data:FormData;try{data=await request.formData()}catch{return json({error:'تعذرت قراءة الملف'},400)}
 let upload:Awaited<ReturnType<typeof validateFile>>;try{upload=await validateFile(data.get('file'))}catch(e){if(e instanceof UploadError)return json({error:e.message},e.status);throw e}
 const values=fields.map(f=>String(data.get(f)||'').trim());
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500))return json({error:'أدخل عنوانًا صالحًا وبيانات لا تتجاوز 500 حرف'},400);
 if(!values[3])values[3]=new Date().toISOString().slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4]))return json({error:'تاريخ أو حالة غير صالحة'},400);
 const id=crypto.randomUUID();if(!values[1])values[1]=`DOC-${Date.now().toString().slice(-8)}`;
 if(!values[9])values[9]='عام';const key=`${u.userId}/${id}`;
 await env.BUCKET!.put(key,upload.bytes,{httpMetadata:{contentType:upload.mime}});
 try{await env.DB!.prepare(`INSERT INTO documents (id,owner,filename,mime,size,object_key,${fields.join(',')},uploaded_at) VALUES (${Array(17).fill('?').join(',')})`).bind(id,u.userId,upload.filename,upload.mime,upload.size,key,...values,new Date().toISOString()).run()}catch(e){await env.BUCKET!.delete(key);throw e}
 return json({id},201);
}

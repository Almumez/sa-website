import {env} from 'cloudflare:workers';
import {getPortalAdmin as getChatGPTUser} from '../../../portal-access';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const d:any=await env.DB!.prepare('SELECT * FROM documents WHERE id=? AND deleted=0').bind(id).first();if(!d)return json({error:'الوثيقة غير موجودة أو في سلة المحذوفات'},404);
 const url=new URL(request.url);if(url.searchParams.get('metadata')==='1'){delete d.object_key;delete d.owner;return json({document:d})}
 const object=await env.BUCKET!.get(d.object_key);if(!object)return json({error:'الملف غير متاح'},404);
 const inline=d.mime==='application/pdf'||d.mime.startsWith('image/');const disposition=url.searchParams.get('download')==='1'||!inline?'attachment':'inline';
 return new Response(object.body,{headers:{'Content-Type':d.mime,'Content-Length':String(object.size),'Content-Disposition':`${disposition}; filename="document.${d.filename.split('.').pop()?.replace(/[^a-z0-9]/gi,'')}"; filename*=UTF-8''${encodeURIComponent(d.filename)}`,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'X-Frame-Options':'SAMEORIGIN'}});
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'طلب غير مسموح'},403);
 const {id}=await params;let d:any;try{d=await request.json()}catch{return json({error:'بيانات غير صالحة'},400)}
 const existing=await env.DB!.prepare('SELECT id FROM documents WHERE id=? AND owner=?').bind(id,u.userId).first();if(!existing)return json({error:'الوثيقة غير موجودة'},404);
 if(typeof d.deleted==='boolean'){await env.DB!.prepare('UPDATE documents SET deleted=? WHERE id=? AND owner=?').bind(d.deleted?1:0,id,u.userId).run();return json({ok:true})}
 const fields=['title','document_number','unified_number','created','status','facility','cr','subscription','applicant','category'];const values=fields.map(f=>String(d[f]||'').trim());
 if(!values[0]||values[0].length>200||values.some(v=>v.length>500)||!/^\d{4}-\d{2}-\d{2}$/.test(values[3])||!['سارية','منتهية','ملغية'].includes(values[4]))return json({error:'تحقق من العنوان والتاريخ والحالة'},400);
 await env.DB!.prepare(`UPDATE documents SET ${fields.map(f=>`${f}=?`).join(',')} WHERE id=? AND owner=?`).bind(...values,id,u.userId).run();return json({ok:true});
}

import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 const d:any=await env.DB!.prepare('SELECT * FROM branding WHERE owner=?').bind(u.userId).first();
 if(new URL(request.url).searchParams.get('logo')==='1'){
  if(!d?.logo_key)return new Response(null,{status:404});const object=await env.BUCKET!.get(d.logo_key);if(!object)return new Response(null,{status:404});
  return new Response(object.body,{headers:{'Content-Type':d.logo_mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-cache'}});
 }
 return json({name:d?.name||'بوابة الملفات',displayMode:d?.display_mode||'name',hasLogo:!!d?.logo_key,version:d?.updated_at||''});
}
export async function POST(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'طلب غير مسموح'},403);
 if(Number(request.headers.get('content-length')||0)>3*1024*1024)return json({error:'الحد الأقصى للشعار 2 ميجابايت'},413);
 let form:FormData;try{form=await request.formData()}catch{return json({error:'بيانات غير صالحة'},400)}
 const name=String(form.get('name')||'').trim(),mode=String(form.get('displayMode')||'name');
 if(!name||name.length>100||!['name','logo','both'].includes(mode))return json({error:'أدخل اسمًا لا يتجاوز 100 حرف واختر طريقة العرض'},400);
 const previous:any=await env.DB!.prepare('SELECT * FROM branding WHERE owner=?').bind(u.userId).first();let key=previous?.logo_key||null,mime=previous?.logo_mime||null,newKey:string|null=null;
 if(form.get('removeLogo')==='1'){key=null;mime=null}
 const logo=form.get('logo');
 if(logo instanceof File&&logo.size){
  if(logo.size>2*1024*1024)return json({error:'الحد الأقصى للشعار 2 ميجابايت'},413);
  const bytes=new Uint8Array(await logo.arrayBuffer()),h=new TextDecoder().decode(bytes.slice(0,12));
  mime=bytes[0]===137&&h.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':h.startsWith('RIFF')&&h.slice(8,12)==='WEBP'?'image/webp':null;
  if(!mime)return json({error:'اختر صورة PNG أو JPEG أو WebP صالحة'},400);
  newKey=`${u.userId}/branding/${crypto.randomUUID()}`;key=newKey;await env.BUCKET!.put(key,bytes,{httpMetadata:{contentType:mime}});
 }
 if(mode!=='name'&&!key)return json({error:'ارفع شعارًا أولًا أو اختر عرض الاسم فقط'},400);
 try{await env.DB!.prepare('INSERT INTO branding (owner,name,display_mode,logo_key,logo_mime,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,display_mode=excluded.display_mode,logo_key=excluded.logo_key,logo_mime=excluded.logo_mime,updated_at=excluded.updated_at').bind(u.userId,name,mode,key,mime,new Date().toISOString()).run()}catch(e){if(newKey)await env.BUCKET!.delete(newKey);throw e}
 return json({ok:true});
}

import {sameOrigin} from '@/app/auth-utils';
import {getBranding,saveBranding} from '@/lib/server/repository';
import {bucket} from '@/lib/server/storage';
import {getPortalAdmin as getChatGPTUser} from '../../portal-access';
import {findDocument} from '../../document-links';
const json=(d:unknown,s=200)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const documentId=new URL(request.url).searchParams.get('document');let owner:string;
 if(documentId){const doc=await findDocument(documentId);if(!doc)return json({error:'الوثيقة غير موجودة'},404);owner=doc.owner;}
 else{const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);owner=u.ownerId;}
 const d=await getBranding(owner);
 if(new URL(request.url).searchParams.get('logo')==='1'){
  if(!d?.logo_key)return new Response(null,{status:404});const object=await bucket.get(d.logo_key);if(!object)return new Response(null,{status:404});
  return new Response(object.body,{headers:{'Content-Type':d.logo_mime||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-cache'}});
 }
 return json({name:d?.name||'بوابة الملفات',displayMode:d?.display_mode||'name',hasLogo:!!d?.logo_key,version:d?.updated_at||'',...(documentId?{documentId}:{})});
}
export async function POST(request:Request){
 const u=await getChatGPTUser();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
 if(!u.isOwner)return json({error:'إعدادات الهوية للمدير فقط'},403);
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 if(Number(request.headers.get('content-length')||0)>3*1024*1024)return json({error:'الحد الأقصى للشعار 2 ميجابايت'},413);
 let form:FormData;try{form=await request.formData()}catch{return json({error:'بيانات غير صالحة'},400)}
 const name=String(form.get('name')||'').trim(),mode=String(form.get('displayMode')||'name');
 if(!name||name.length>100||!['name','logo','both'].includes(mode))return json({error:'أدخل اسمًا لا يتجاوز 100 حرف واختر طريقة العرض'},400);
 const previous=await getBranding(u.ownerId);let key=previous?.logo_key||null,mime=previous?.logo_mime||null,newKey:string|null=null;
 if(form.get('removeLogo')==='1'){key=null;mime=null}
 const logo=form.get('logo');
 if(logo instanceof File&&logo.size){
  if(logo.size>2*1024*1024)return json({error:'الحد الأقصى للشعار 2 ميجابايت'},413);
  const bytes=new Uint8Array(await logo.arrayBuffer()),h=new TextDecoder().decode(bytes.slice(0,12));
  mime=bytes[0]===137&&h.slice(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216?'image/jpeg':h.startsWith('RIFF')&&h.slice(8,12)==='WEBP'?'image/webp':null;
  if(!mime)return json({error:'اختر صورة PNG أو JPEG أو WebP صالحة'},400);
  newKey=`${u.ownerId}/branding/${crypto.randomUUID()}`;key=newKey;await bucket.put(key,bytes);
 }
 if(mode!=='name'&&!key)return json({error:'ارفع شعارًا أولًا أو اختر عرض الاسم فقط'},400);
 try{await saveBranding({owner:u.ownerId,name,display_mode:mode,logo_key:key,logo_mime:mime,updated_at:new Date().toISOString()});}catch(e){if(newKey)await bucket.delete(newKey);throw e}
 return json({ok:true});
}

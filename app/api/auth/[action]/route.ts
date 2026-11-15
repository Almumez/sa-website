import {store} from '@/lib/server/repository';
import {getPortalAdmin,bootstrapOwner,initialized} from '../../../portal-access';
import {authJSON as json,sameOrigin,accountInput,newSession,cookieHeader,loginLimit,safeReturn} from '../../../auth-utils';
import {hashPassword,verifyPassword,validPassword} from '../../../passwords';
export async function GET(_r:Request,{params}:{params:Promise<{action:string}>}){if((await params).action!=='me')return json({error:'غير موجود'},404);const user=await getPortalAdmin();return user?json({user}):json({error:'يرجى تسجيل الدخول'},401)}
async function handlePost(request:Request,{params}:{params:Promise<{action:string}>}){
 if(!sameOrigin(request))return json({error:'طلب غير مسموح'},403);
 const {action}=await params;
 if(action==='logout')return new Response(null,{status:303,headers:{Location:'/login','Set-Cookie':cookieHeader('',request,0),'Cache-Control':'no-store'}});
 if(Number(request.headers.get('content-length')||0)>16384)return json({error:'بيانات كبيرة جدًا'},413);
 let d:any;try{d=await request.json();if(!d||typeof d!=='object')throw 0}catch{return json({error:'بيانات غير صالحة'},400)}
 if(action==='setup'){
  const owner=await bootstrapOwner(d.setupKey);if(!owner)return json({error:'إعداد المدير متاح لصاحب الموقع فقط'},403);
  if(await initialized())return json({error:'تم إعداد حساب المدير مسبقًا'},409);
  const v=accountInput(d);if(!v||!validPassword(d.password))return json({error:'تحقق من البيانات. كلمة المرور من 12 إلى 128 حرفًا واسم المستخدم 3 إلى 50 حرفًا إنجليزيًا أو رقمًا أو . _ -'},400);
  const id=crypto.randomUUID(),hash=await hashPassword(d.password);
  try{await store.transaction(data=>{
   if(data.portal_settings.length||data.portal_accounts.some(a=>a.username===v.username||a.email===v.email))throw new Error('Already initialized');
   data.portal_accounts.push({id,username:v.username,email:v.email,display_name:v.displayName,password_hash:hash,role:'owner',active:1,can_add:1,can_edit:1,can_delete:1});
   data.portal_settings.push({id:1,owner_data_id:owner.userId});
  });}catch{return json({error:'تم الإعداد مسبقًا أو اسم المستخدم مستخدم'},409);}
  const token=await newSession(id);return new Response(JSON.stringify({ok:true,returnTo:'/'}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookieHeader(token,request)}});
 }
 if(action==='login'){
  const identifier=typeof d.identifier==='string'?d.identifier.trim().toLowerCase():'';
  if(!identifier||identifier.length>254||typeof d.password!=='string'||d.password.length>128)return json({error:'بيانات الدخول غير صحيحة'},400);
  if(!await loginLimit(request,identifier))return new Response(JSON.stringify({error:'محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.'}),{status:429,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Retry-After':'900'}});
  const a=(await store.read()).portal_accounts.find(a=>a.username===identifier||a.email===identifier);
  const dummy='pbkdf2-sha256$600000$00000000000000000000000000000000$'+'0'.repeat(64);
  const valid=await verifyPassword(d.password,a?.password_hash||dummy);
  if(!a||!a.active||!valid)return json({error:'اسم المستخدم أو كلمة المرور غير صحيحة'},401);
  const token=await newSession(a.id);return new Response(JSON.stringify({ok:true,returnTo:safeReturn(d.returnTo)}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookieHeader(token,request)}});
 }
 if(action==='password'){
  const u=await getPortalAdmin();if(!u)return json({error:'يرجى تسجيل الدخول'},401);
  if(!await loginLimit(request,'password:'+u.userId))return json({error:'محاولات كثيرة، حاول لاحقًا'},429);
  if(!validPassword(d.password)||typeof d.currentPassword!=='string'||d.currentPassword.length>128)return json({error:'كلمة المرور الجديدة من 12 إلى 128 حرفًا'},400);
  const a=(await store.read()).portal_accounts.find(a=>a.id===u.userId);if(!a||!await verifyPassword(d.currentPassword,a.password_hash))return json({error:'كلمة المرور الحالية غير صحيحة'},400);
  const hash=await hashPassword(d.password);await store.transaction(data=>{const account=data.portal_accounts.find(a=>a.id===u.userId);if(!account||account.password_hash!==a.password_hash)throw new Error('Account changed');account.password_hash=hash;data.portal_sessions=data.portal_sessions.filter(s=>s.account_id!==u.userId);});
  const token=await newSession(u.userId);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookieHeader(token,request)}});
 }
 return json({error:'غير موجود'},404);
}
export async function POST(request:Request,context:{params:Promise<{action:string}>}){
 try{return await handlePost(request,context)}
 catch(error){
  console.error('Authentication API failed:',error);
  const message=error instanceof Error?error.message:'';
  const known=message.includes('Persistent storage is not connected')||message.includes('JSON storage is busy')||message.includes('JSON data is invalid')||message.includes('Main JSON file is missing')||message.includes('Unable to read private Blob');
  return json({error:known?message:'تعذر إكمال طلب المصادقة بسبب مشكلة في الخادم أو التخزين. راجع سجلات Vercel.'},known?503:500);
 }
}

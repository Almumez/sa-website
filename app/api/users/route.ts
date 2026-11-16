import {store} from '@/lib/server/repository';
import {getPortalAdmin} from '../../portal-access';
import {authJSON as json,sameOrigin,accountInput} from '../../auth-utils';
import {hashPassword,validPassword} from '../../passwords';
function failure(error:unknown){console.error('Users API failed:',error);const message=error instanceof Error?error.message:'';const status=message.includes('JSON storage is busy')?503:500;return json({error:status===503?'التخزين مشغول حاليًا؛ أعد المحاولة بعد قليل.':'تعذر إكمال طلب المستخدمين بسبب خطأ في الخادم. راجع سجلات Vercel.'},status)}
export async function GET(){try{const u=await getPortalAdmin();if(!u)return json({error:'يرجى تسجيل الدخول'},401);if(!u.isOwner)return json({error:'هذه الخدمة للمدير فقط'},403);const rows=(await store.read()).portal_accounts.map(({password_hash: _password,...account})=>account).sort((a,b)=>b.role.localeCompare(a.role)||a.display_name.localeCompare(b.display_name));return json({users:rows})}catch(error){return failure(error)}}
export async function POST(r:Request){try{return await save(r,false)}catch(error){return failure(error)}}
export async function PATCH(r:Request){try{return await save(r,true)}catch(error){return failure(error)}}
async function save(r:Request,edit:boolean){
 const u=await getPortalAdmin();if(!u)return json({error:'يرجى تسجيل الدخول'},401);if(!u.isOwner||!sameOrigin(r))return json({error:'هذه الخدمة للمدير فقط'},403);
 if(Number(r.headers.get('content-length')||0)>16384)return json({error:'بيانات كبيرة جدًا'},413);
 let d:any;try{d=await r.json();if(!d||typeof d!=='object')throw 0}catch{return json({error:'بيانات غير صالحة'},400)}
 const v=accountInput(d);if(!v||(!edit&&!validPassword(d.password))||(d.password&&!validPassword(d.password)))return json({error:'تحقق من البيانات؛ اسم المستخدم 3–50 حرفًا إنجليزيًا أو رقمًا أو . _ - وكلمة المرور 12–128 حرفًا'},400);
 if(edit){const a=(await store.read()).portal_accounts.find(a=>a.id===String(d.id));if(!a)return json({error:'المستخدم غير موجود'},404);if(a.role==='owner')return json({error:'حساب المدير محمي. غيّر كلمة مرورك من حسابي.'},403)}
 const id=edit?String(d.id):crypto.randomUUID(),hash=d.password?await hashPassword(d.password):null;
 try{
  await store.transaction(data=>{
   if(data.portal_accounts.some(a=>a.id!==id&&(a.username===v.username||a.email===v.email)))throw new Error('Duplicate account');
   if(edit){const account=data.portal_accounts.find(a=>a.id===id&&a.role==='member');if(!account)throw new Error('Member unavailable');Object.assign(account,{username:v.username,email:v.email,display_name:v.displayName,active:d.active===true?1:0,can_add:d.canAdd===true?1:0,can_edit:d.canEdit===true?1:0,can_delete:d.canDelete===true?1:0,...(hash?{password_hash:hash}:{})});data.portal_sessions=data.portal_sessions.filter(s=>s.account_id!==id);}
   else data.portal_accounts.push({id,username:v.username,email:v.email,display_name:v.displayName,password_hash:hash!,role:'member',active:1,can_add:d.canAdd===true?1:0,can_edit:d.canEdit===true?1:0,can_delete:d.canDelete===true?1:0});
  });
 }catch(error){if(error instanceof Error&&error.message==='Duplicate account')return json({error:'اسم المستخدم أو البريد مستخدم مسبقًا'},409);if(error instanceof Error&&error.message==='Member unavailable')return json({error:'المستخدم غير موجود أو لا يمكن تعديله'},409);throw error}
 return json({ok:true});
}

import {env} from 'cloudflare:workers';
import {getPortalAdmin} from '../../portal-access';
import {authJSON as json,sameOrigin,accountInput} from '../../auth-utils';
import {hashPassword,validPassword} from '../../passwords';
export async function GET(){const u=await getPortalAdmin();if(!u)return json({error:'يرجى تسجيل الدخول'},401);if(!u.isOwner)return json({error:'هذه الخدمة للمدير فقط'},403);const rows=await env.DB!.prepare('SELECT id,username,email,display_name,role,active,can_add,can_edit,can_delete FROM portal_accounts ORDER BY role DESC,display_name').all();return json({users:rows.results})}
export async function POST(r:Request){return save(r,false)}
export async function PATCH(r:Request){return save(r,true)}
async function save(r:Request,edit:boolean){
 const u=await getPortalAdmin();if(!u)return json({error:'يرجى تسجيل الدخول'},401);if(!u.isOwner||!sameOrigin(r))return json({error:'هذه الخدمة للمدير فقط'},403);
 if(Number(r.headers.get('content-length')||0)>16384)return json({error:'بيانات كبيرة جدًا'},413);
 let d:any;try{d=await r.json();if(!d||typeof d!=='object')throw 0}catch{return json({error:'بيانات غير صالحة'},400)}
 const v=accountInput(d);if(!v||(!edit&&!validPassword(d.password))||(d.password&&!validPassword(d.password)))return json({error:'تحقق من البيانات؛ اسم المستخدم 3–50 حرفًا إنجليزيًا أو رقمًا أو . _ - وكلمة المرور 12–128 حرفًا'},400);
 if(edit){const a:any=await env.DB!.prepare('SELECT role FROM portal_accounts WHERE id=?').bind(String(d.id)).first();if(!a)return json({error:'المستخدم غير موجود'},404);if(a.role==='owner')return json({error:'حساب المدير محمي. غيّر كلمة مرورك من حسابي.'},403)}
 const id=edit?String(d.id):crypto.randomUUID(),hash=d.password?await hashPassword(d.password):null;
 try{
  if(edit){await env.DB!.batch([env.DB!.prepare('UPDATE portal_accounts SET username=?,email=?,display_name=?,active=?,can_add=?,can_edit=?,can_delete=?,password_hash=COALESCE(?,password_hash) WHERE id=? AND role=\'member\'').bind(v.username,v.email,v.displayName,d.active===true?1:0,d.canAdd===true?1:0,d.canEdit===true?1:0,d.canDelete===true?1:0,hash,id),env.DB!.prepare('DELETE FROM portal_sessions WHERE account_id=?').bind(id)])}
  else await env.DB!.prepare('INSERT INTO portal_accounts (id,username,email,display_name,password_hash,role,active,can_add,can_edit,can_delete) VALUES (?,?,?,?,?,\'member\',1,?,?,?)').bind(id,v.username,v.email,v.displayName,hash,d.canAdd===true?1:0,d.canEdit===true?1:0,d.canDelete===true?1:0).run();
 }catch{return json({error:'اسم المستخدم أو البريد مستخدم مسبقًا'},409)}
 return json({ok:true});
}

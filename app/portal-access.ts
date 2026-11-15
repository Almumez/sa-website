import {store} from '@/lib/server/repository';
import {cookies} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export type PortalUser={userId:string;ownerId:string;displayName:string;email:string;isOwner:boolean;canAdd:boolean;canEdit:boolean;canDelete:boolean};
export const SESSION_COOKIE='portal_session';
export async function tokenHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
function sessionSecret(){return process.env.SESSION_SIGNING_SECRET||process.env.BLOB_READ_WRITE_TOKEN||process.env.ADMIN_SETUP_SECRET||''}
function sessionClaims(token:string){
 const [payload,signature,...extra]=token.split('.'),secret=sessionSecret();
 if(!payload||!signature||extra.length||secret.length<32)return null;
 try{
  const expected=createHmac('sha256',secret).update(payload).digest(),actual=Buffer.from(signature,'base64url');
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
  const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(typeof value.sub!=='string'||!Number.isSafeInteger(value.exp)||value.exp<=Date.now()||typeof value.pv!=='string')return null;
  return value as {sub:string;exp:number;pv:string};
 }catch{return null;}
}
export async function initialized(){return (await store.read()).portal_settings.length>0}
export async function bootstrapOwner(setupKey:unknown){
 const expected=process.env.ADMIN_SETUP_SECRET;
 if(!expected||expected.length<32||typeof setupKey!=='string')return null;
 const a=Buffer.from(expected),b=Buffer.from(setupKey);
 if(a.length!==b.length||!timingSafeEqual(a,b))return null;
 const email=process.env.SITE_OWNER_EMAIL?.trim().toLowerCase();
 if(!email)return null;
 return {userId:process.env.PORTAL_OWNER_DATA_ID||'portal-owner',email};
}
export async function getPortalAdmin():Promise<PortalUser|null>{
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token)return null;
 const data=await store.read();
 // Accept unexpired legacy sessions during rollout; new sessions are signed
 // cookies and never contend on writes to the shared JSON state file.
 let legacy=null;
 if(/^[a-f0-9]{64}$/.test(token)){const hash=await tokenHash(token);legacy=data.portal_sessions.find(row=>row.token_hash===hash&&row.expires_at>Date.now())||null;}
 const claims=legacy?null:sessionClaims(token);
 const accountId=legacy?.account_id||claims?.sub;
 const account=accountId?data.portal_accounts.find(row=>row.id===accountId&&row.active===1):null;
 if(claims&&account&&claims.pv!==createHash('sha256').update(account.password_hash).digest('base64url'))return null;
 const settings=data.portal_settings[0];
 const a=account&&settings?{...account,owner_data_id:settings.owner_data_id}:null;
 if(!a)return null;const owner=a.role==='owner';return {userId:a.id,ownerId:a.owner_data_id,displayName:a.display_name,email:a.email,isOwner:owner,canAdd:owner||!!a.can_add,canEdit:owner||!!a.can_edit,canDelete:owner||!!a.can_delete};
}
export async function requirePortalAdmin(returnTo:string){const u=await getPortalAdmin();if(!u)redirect('/login?returnTo='+encodeURIComponent(returnTo));return u}
export async function requirePortalPermission(permission:'canAdd'|'canEdit'|'canDelete'|'isOwner',returnTo:string){const u=await requirePortalAdmin(returnTo);if(!u[permission])notFound();return u}

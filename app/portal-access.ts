import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {redirect,notFound} from 'next/navigation';
import {getChatGPTUser} from './chatgpt-auth';
export type PortalUser={userId:string;ownerId:string;displayName:string;email:string;isOwner:boolean;canAdd:boolean;canEdit:boolean;canDelete:boolean};
export const SESSION_COOKIE='portal_session';
export async function tokenHash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')}
export async function initialized(){return !!await env.DB!.prepare('SELECT id FROM portal_settings WHERE id=1').first()}
export async function bootstrapOwner(){const u=await getChatGPTUser();return u&&env.SITE_OWNER_EMAIL&&u.email.trim().toLowerCase()===env.SITE_OWNER_EMAIL.trim().toLowerCase()?u:null}
export async function getPortalAdmin():Promise<PortalUser|null>{
 const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const a:any=await env.DB!.prepare('SELECT a.*,p.owner_data_id FROM portal_sessions s JOIN portal_accounts a ON a.id=s.account_id CROSS JOIN portal_settings p WHERE s.token_hash=? AND s.expires_at>? AND a.active=1 AND p.id=1').bind(await tokenHash(token),Date.now()).first();
 if(!a)return null;const owner=a.role==='owner';return {userId:a.id,ownerId:a.owner_data_id,displayName:a.display_name,email:a.email,isOwner:owner,canAdd:owner||!!a.can_add,canEdit:owner||!!a.can_edit,canDelete:owner||!!a.can_delete};
}
export async function requirePortalAdmin(returnTo:string){const u=await getPortalAdmin();if(!u)redirect('/login?returnTo='+encodeURIComponent(returnTo));return u}
export async function requirePortalPermission(permission:'canAdd'|'canEdit'|'canDelete'|'isOwner',returnTo:string){const u=await requirePortalAdmin(returnTo);if(!u[permission])notFound();return u}

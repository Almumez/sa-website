import {env} from 'cloudflare:workers';
import {SESSION_COOKIE,tokenHash} from './portal-access';
export const authJSON=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export const sameOrigin=(r:Request)=>r.headers.get('origin')===new URL(r.url).origin;
export function safeReturn(value:unknown){if(typeof value!=='string')return '/admin';try{const u=new URL(value,'https://portal.local');return value.startsWith('/')&&u.origin==='https://portal.local'&&(u.pathname==='/'||u.pathname==='/admin'||u.pathname.startsWith('/admin/'))?u.pathname+u.search:'/admin'}catch{return '/admin'}}
export function accountInput(d:any){const username=String(d.username||'').trim().toLowerCase(),email=String(d.email||'').trim().toLowerCase(),displayName=String(d.displayName||'').trim();if(!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!displayName||displayName.length>100)return null;return {username,email,displayName}}
export function cookieHeader(token:string,request:Request,maxAge=43200){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`}
export async function newSession(accountId:string){const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');await env.DB!.prepare('INSERT INTO portal_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)').bind(await tokenHash(token),accountId,Date.now()+43200000).run();return token}
export async function loginLimit(request:Request,identifier:string){
 const ip=request.headers.get('cf-connecting-ip')||'local';const keys=await Promise.all(['ip:'+ip,'user:'+identifier].map(tokenHash));const window=Math.floor(Date.now()/900000);
 const results=await env.DB!.batch(keys.map(key=>env.DB!.prepare('INSERT INTO portal_login_limits (key,window,count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind(key,window)));
 return results.every((r,i)=>Number((r.results[0] as any)?.count)<= (i===0?40:10));
}

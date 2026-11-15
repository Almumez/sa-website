import {store} from '@/lib/server/repository';
import {SESSION_COOKIE,tokenHash} from './portal-access';
export const authJSON=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(r:Request){
 const url=new URL(r.url),host=r.headers.get('host')||url.host;
 const protocol=process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN).protocol:url.protocol;
 if(process.env.APP_ORIGIN)return r.headers.get('origin')===new URL(process.env.APP_ORIGIN).origin;
 return r.headers.get('origin')===`${protocol}//${host}`;
}
export function safeReturn(value:unknown){if(typeof value!=='string')return '/';try{const u=new URL(value,'https://portal.local');return value.startsWith('/')&&u.origin==='https://portal.local'&&(u.pathname==='/'||u.pathname==='/admin'||u.pathname.startsWith('/admin/'))?u.pathname+u.search:'/'}catch{return '/'}}
export function accountInput(d:any){const username=String(d.username||'').trim().toLowerCase(),email=String(d.email||'').trim().toLowerCase(),displayName=String(d.displayName||'').trim();if(!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!displayName||displayName.length>100)return null;return {username,email,displayName}}
export function cookieHeader(token:string,request:Request,maxAge=43200){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${(process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN):new URL(request.url)).protocol==='https:'?'; Secure':''}`}
export async function newSession(accountId:string){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const hash=await tokenHash(token);
 await store.transaction(data=>{if(!data.portal_accounts.some(a=>a.id===accountId&&a.active===1))throw new Error('Account unavailable');data.portal_sessions=data.portal_sessions.filter(s=>s.expires_at>Date.now());data.portal_sessions.push({token_hash:hash,account_id:accountId,expires_at:Date.now()+43200000});});
 return token;
}
export async function loginLimit(request:Request,identifier:string){
 const ip=(process.env.TRUST_PROXY==='true'?request.headers.get('x-forwarded-for')?.split(',')[0].trim():null)||'local';
 const keys=await Promise.all(['ip:'+ip,'user:'+identifier].map(tokenHash)),window=Math.floor(Date.now()/900000);
 return store.transaction(data=>{
  data.portal_login_limits=data.portal_login_limits.filter(row=>row.window>=window-1);
  return keys.map((key,index)=>{let row=data.portal_login_limits.find(row=>row.key===key);if(!row){row={key,window,count:0};data.portal_login_limits.push(row);}if(row.window!==window){row.window=window;row.count=0;}row.count++;return row.count<=(index===0?40:10);}).every(Boolean);
 });
}

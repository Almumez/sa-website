import {store} from '@/lib/server/repository';
import {SESSION_COOKIE} from './portal-access';
import {createHash,createHmac} from 'node:crypto';
const loginWindows=new Map<string,{window:number,count:number}>();
export const authJSON=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(r:Request){
 const origin=r.headers.get('origin');if(!origin)return false;
 try{
  const requestURL=new URL(r.url),originURL=new URL(origin);
  // Proxies can rewrite Host while preserving the public hostname in
  // x-forwarded-host. Next's request URL is also based on the public request.
  const forwardedHost=r.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host=(forwardedHost||r.headers.get('host')||requestURL.host).toLowerCase();
  const forwardedProto=r.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol=forwardedProto||(process.env.VERCEL?'https':requestURL.protocol.replace(':',''));
  return originURL.host.toLowerCase()===host&&originURL.protocol===`${protocol}:`;
 }catch{return false;}
}
export function safeReturn(value:unknown){if(typeof value!=='string')return '/';try{const u=new URL(value,'https://portal.local');return value.startsWith('/')&&u.origin==='https://portal.local'&&(u.pathname==='/'||u.pathname==='/admin'||u.pathname.startsWith('/admin/'))?u.pathname+u.search:'/'}catch{return '/'}}
export function accountInput(d:any){const username=String(d.username||'').trim().toLowerCase(),email=String(d.email||'').trim().toLowerCase(),displayName=String(d.displayName||'').trim();if(!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!displayName||displayName.length>100)return null;return {username,email,displayName}}
export function cookieHeader(token:string,request:Request,maxAge=43200){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${(process.env.APP_ORIGIN?new URL(process.env.APP_ORIGIN):new URL(request.url)).protocol==='https:'?'; Secure':''}`}
export async function newSession(accountId:string){
 const secret=process.env.SESSION_SIGNING_SECRET||process.env.BLOB_READ_WRITE_TOKEN||process.env.ADMIN_SETUP_SECRET||'';
 if(secret.length<32)throw new Error('Session signing secret is not configured. Set SESSION_SIGNING_SECRET to a random value of at least 32 characters.');
 const account=(await store.read()).portal_accounts.find(a=>a.id===accountId&&a.active===1);
 if(!account)throw new Error('Account unavailable');
 const payload=Buffer.from(JSON.stringify({sub:account.id,exp:Date.now()+43200000,pv:createHash('sha256').update(account.password_hash).digest('base64url')})).toString('base64url');
 const signature=createHmac('sha256',secret).update(payload).digest('base64url');
 return `${payload}.${signature}`;
}
export async function loginLimit(request:Request,identifier:string){
 const ip=(process.env.TRUST_PROXY==='true'?request.headers.get('x-forwarded-for')?.split(',')[0].trim():null)||'local';
 // Vercel functions are stateless and a JSON file in Blob is not a suitable
 // shared rate-limit counter: every login would contend on the main state ETag.
 // Keep a bounded per-instance window so normal authentication needs no write.
 const window=Math.floor(Date.now()/900000),keys=['ip:'+ip,'user:'+identifier];
 if(loginWindows.size>5000)for(const [key,row] of loginWindows)if(row.window<window-1)loginWindows.delete(key);
 return keys.map((key,index)=>{
  let row=loginWindows.get(key);
  if(!row||row.window!==window){row={window,count:0};loginWindows.set(key,row);}
  row.count++;
  return row.count<=(index===0?40:10);
 }).every(Boolean);
}

// Integration test: local fixture accounts and documents only. Never target production.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base='http://127.0.0.1:5185',suffix=Date.now().toString(36),password=randomUUID()+randomUUID();
async function req(path,{cookie='',method='GET',data,body,origin=base}={}){const r=await fetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='GET'?{}:{Origin:origin}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):body});const text=await r.text();let json;try{json=JSON.parse(text)}catch{}return {status:r.status,json,cookie:r.headers.get('set-cookie')?.split(';')[0],location:r.headers.get('location'),text}}
const ownerData={username:'owner'+suffix,email:'owner'+suffix+'@example.test',displayName:'Local test owner',password};
assert.equal((await req('/api/documents')).status,401);
assert.equal((await req('/api/documents',{cookie:'__sites_local_auth=1'})).status,401,'platform identity must not bypass custom login');
assert.equal((await req('/api/auth/setup',{method:'POST',data:ownerData})).status,403);
const setup=await req('/api/auth/setup',{method:'POST',cookie:'__sites_local_auth=1',data:ownerData});assert.equal(setup.status,200,setup.text);const owner=setup.cookie;assert.ok(owner);
assert.equal((await req('/api/auth/setup',{method:'POST',cookie:'__sites_local_auth=1',data:ownerData})).status,409);
assert.equal((await req('/api/auth/me',{cookie:owner})).json.user.ownerId,'local_seedy');
assert.equal((await req('/api/users',{method:'POST',cookie:owner,origin:'https://attacker.test',data:ownerData})).status,403);
async function member(label,permissions){const data={username:label+suffix,email:label+suffix+'@example.test',displayName:label,password,...permissions};assert.equal((await req('/api/users',{cookie:owner,method:'POST',data})).status,200);const login=await req('/api/auth/login',{method:'POST',data:{identifier:data.username,password,returnTo:'//attacker.test'}});assert.equal(login.status,200,login.text);assert.equal(login.json.returnTo,'/admin');return {cookie:login.cookie,data}}
const add=await member('adder',{canAdd:true}),edit=await member('editor',{canEdit:true}),del=await member('deleter',{canDelete:true}),read=await member('reader',{});
function file(){const f=new FormData();f.set('file',new File(['local permission fixture'],'fixture.txt',{type:'text/plain'}));f.set('title','Auth fixture');f.set('created','2026-11-14');f.set('status','سارية');return f}
for(const a of [edit,del,read])assert.equal((await req('/api/documents',{method:'POST',cookie:a.cookie,body:file()})).status,403);
const created=await req('/api/documents',{method:'POST',cookie:add.cookie,body:file()});assert.equal(created.status,201,created.text);const id=created.json.id;
assert.equal((await req('/api/documents/'+id)).status,200,'public download');
for(const a of [add,del,read])assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:a.cookie,data:{title:'Forbidden'}})).status,403);
assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:edit.cookie,data:{title:'Edited',slug:'auth-'+suffix}})).status,200);
assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:edit.cookie,body:file()})).status,200,'replacement allowed for editors');
assert.equal((await req('/api/documents/auth-'+suffix)).status,200,'alias survives replacement');
for(const a of [add,edit,read])assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:a.cookie,data:{deleted:true}})).status,403);
assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:del.cookie,data:{deleted:true}})).status,200);
assert.equal((await req('/api/documents/'+id)).status,404);
assert.equal((await req('/api/documents/'+id,{method:'PATCH',cookie:del.cookie,data:{deleted:false}})).status,200);
for(const a of [add,edit,del,read]){assert.equal((await req('/api/users',{cookie:a.cookie})).status,403);assert.equal((await req('/api/users',{method:'POST',cookie:a.cookie,data:ownerData})).status,403);assert.equal((await req('/api/branding',{method:'POST',cookie:a.cookie,body:new FormData()})).status,403)}
const users=(await req('/api/users',{cookie:owner})).json.users,reader=users.find(x=>x.username===read.data.username),ownerRow=users.find(x=>x.role==='owner');
assert.equal((await req('/api/users',{method:'PATCH',cookie:owner,data:{...ownerData,id:ownerRow.id,active:false}})).status,403,'owner protected');
assert.equal((await req('/api/users',{method:'PATCH',cookie:owner,data:{...read.data,password:'',id:reader.id,active:false}})).status,200);
assert.equal((await req('/api/documents',{cookie:read.cookie})).status,401,'disabled sessions revoked');
assert.equal((await req('/api/auth/login',{method:'POST',data:{identifier:read.data.username,password}})).status,401);
assert.equal((await req('/api/auth/password',{method:'POST',cookie:owner,data:{currentPassword:password,password:password+'changed'}})).status,200);
assert.equal((await req('/api/auth/me',{cookie:owner})).status,401,'old sessions revoked after password change');
const fresh=await req('/api/auth/login',{method:'POST',data:{identifier:ownerData.username,password:password+'changed'}});assert.equal(fresh.status,200);
assert.equal((await req('/api/auth/logout',{method:'POST',cookie:fresh.cookie})).status,303);
assert.equal((await req('/api/auth/me',{cookie:fresh.cookie})).status,401);
for(let i=0;i<10;i++)assert.equal((await req('/api/auth/login',{method:'POST',data:{identifier:'missing'+suffix,password:'wrong'}})).status,401);
assert.equal((await req('/api/auth/login',{method:'POST',data:{identifier:'missing'+suffix,password:'wrong'}})).status,429);
console.log('PASS: independent login, secure bootstrap, all permissions, shared ownership, public links, replacement, aliases, owner protection, disable, password rotation, logout, rate limits, CSRF. Local fixtures retained.');

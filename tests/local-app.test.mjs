import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

test('local JSON production app: permissions, 5 MB files, aliases, concurrent edits, restart and passwords',{timeout:150000},async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'portal-local-test-'));
  const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const env={...process.env,PORTAL_DATA_DIR:directory,ADMIN_SETUP_SECRET:randomBytes(32).toString('hex'),SITE_OWNER_EMAIL:'owner@example.test',PORTAL_OWNER_DATA_ID:'test-owner',APP_ORIGIN:base,TRUST_PROXY:'false',VERCEL:'',NEXT_TELEMETRY_DISABLED:'1'};
  // An empty deployment must need no database or storage service credentials.
  for(const key of Object.keys(env))if(/^(TURSO_|S3_|UPLOAD_SIGNING_SECRET)/.test(key))delete env[key];
  let server,log='';
  async function start(){
    log='';server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',value=>{log+=value});server.stderr.on('data',value=>{log+=value});
    for(let i=0;i<160;i++){
      if(server.exitCode!==null)throw new Error('Next exited: '+log);
      try{if((await fetch(base+'/login')).status===200)return;}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }throw new Error('Next startup failed: '+log);
  }
  async function stop(){if(server&&server.exitCode===null){server.kill();await once(server,'exit');}}
  async function request(url,{method='GET',data,body,cookie='',headers={}}={}){
    const response=await fetch(base+url,{method,redirect:'manual',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):body});
    const text=await response.text();let json;try{json=JSON.parse(text)}catch{}
    return {status:response.status,json,headers:response.headers,text,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  function fileForm(bytes,title='Document'){
    const form=new FormData();form.set('file',new File([bytes],'test.pdf',{type:'application/pdf'}));form.set('title',title);form.set('status','سارية');return form;
  }
  try{
    const init=spawnSync(process.execPath,['scripts/init-json.mjs'],{env,encoding:'utf8'});assert.equal(init.status,0,init.stderr);
    await start();
    assert.equal((await request('/api/documents')).status,401);
    assert.equal((await request('/data/portal.json')).status,404);
    const account={username:'owner',email:'owner@example.test',displayName:'Owner',password:randomBytes(20).toString('hex')};
    assert.equal((await request('/api/auth/setup',{method:'POST',data:account,headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':env.SITE_OWNER_EMAIL}})).status,403);
    const setups=await Promise.all([1,2].map(()=>request('/api/auth/setup',{method:'POST',data:{...account,setupKey:env.ADMIN_SETUP_SECRET}})));
    assert.deepEqual(setups.map(s=>s.status).sort(),[200,409]);const cookie=setups.find(s=>s.status===200).cookie;
    assert.ok(cookie);
    assert.equal((await request('/api/auth/login',{method:'POST',data:{identifier:'missing-user',password:'invalid-password'}})).status,401);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory,'portal.json'),'utf8')).portal_login_limits,[],'login throttling must not write to the shared JSON store');
    // Reverse proxies may add the public host/protocol. A same-origin login
    // must work and an external Origin must continue to be rejected.
    const proxiedLogin=await request('/api/auth/login',{method:'POST',data:{identifier:account.username,password:account.password},headers:{'x-forwarded-host':new URL(base).host,'x-forwarded-proto':'http'}});
    assert.equal(proxiedLogin.status,200,proxiedLogin.text);
    assert.equal((await request('/api/auth/login',{method:'POST',data:{identifier:account.username,password:account.password},headers:{Origin:'https://attacker.test'}})).status,403);
    assert.equal((await request('/api/documents',{method:'POST',cookie,body:fileForm(Buffer.from('%PDF-1.7\n')),headers:{Origin:'https://attacker.test'}})).status,403);
    const bytes=Buffer.alloc(5*1024*1024,65);bytes.write('%PDF-1.7\n');
    const saved=await request('/api/documents',{method:'POST',cookie,body:fileForm(bytes,'Large file')});assert.equal(saved.status,201,saved.text);
    const id=saved.json.id;
    const downloaded=await fetch(base+'/api/documents/'+id);assert.equal(downloaded.status,200);const etag=downloaded.headers.get('etag');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
    assert.match((await request('/api/documents/'+id+'?download=1')).headers.get('content-disposition'),/^attachment/);
    const meta=(await request('/api/documents/'+id+'?metadata=1')).json.document;
    assert.ok(!('owner' in meta)&&!('object_key' in meta));
    assert.equal((await request('/files-portal/'+id)).status,200);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie,body:fileForm(Buffer.from('%PDF-1.7\nwrong')),headers:{'If-Match':'"old"'}})).status,409);
    const replacement=fileForm(Buffer.from('%PDF-1.7\nnew'));replacement.set('slug','public-link');
    const replaced=await request('/api/documents/'+id,{method:'PATCH',cookie,body:replacement,headers:{'If-Match':etag}});assert.equal(replaced.status,200,replaced.text);
    assert.equal((await request('/api/documents/public-link')).status,200);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie,body:fileForm(bytes),headers:{'If-Match':etag}})).status,409);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie,data:{slug:'رابط-عربي'}})).status,200);
    assert.equal((await request('/api/documents/public-link')).status,200);
    assert.equal((await request('/api/documents/'+encodeURIComponent('رابط-عربي'))).status,200);
    assert.equal((await request('/api/documents',{method:'POST',cookie,body:fileForm(Buffer.from('invalid content'))})).status,400);
    assert.equal((await request('/api/documents',{method:'POST',cookie,body:fileForm(Buffer.alloc(20*1024*1024+1))})).status,413);
    const created=await Promise.all(Array.from({length:8},(_,i)=>request('/api/documents',{method:'POST',cookie,body:fileForm(Buffer.from('%PDF-1.7\n'+i),'Concurrent '+i)})));
    assert.ok(created.every(row=>row.status===201),JSON.stringify(created));
    assert.equal((await request('/api/documents',{cookie})).json.documents.length,9);
    const raced=await Promise.all(created.slice(0,2).map(row=>request('/api/documents/'+row.json.id,{method:'PATCH',cookie,data:{slug:'shared-link'}})));
    assert.deepEqual(raced.map(row=>row.status).sort(),[200,409]);
    const users={};
    for(const [username,permissions] of [['reader',{}],['adder',{canAdd:true}],['editor',{canEdit:true}],['deleter',{canDelete:true}]]){
      const data={username,email:username+'@example.test',displayName:username,password:account.password,...permissions};
      assert.equal((await request('/api/users',{method:'POST',cookie,data})).status,200);
      const login=await request('/api/auth/login',{method:'POST',data:{identifier:username,password:account.password}});assert.equal(login.status,200);users[username]=login.cookie;
    }
    for(const member of Object.values(users))assert.equal((await request('/api/users',{cookie:member})).status,403);
    assert.equal((await request('/api/documents',{method:'POST',cookie:users.reader,body:fileForm(bytes)})).status,403);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:users.adder,data:{title:'No'}})).status,403);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:users.editor,data:{title:'Edited'}})).status,200);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:users.reader,data:{deleted:true}})).status,403);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:users.deleter,data:{deleted:true}})).status,200);
    assert.equal((await request('/api/documents/public-link')).status,404);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:users.deleter,data:{deleted:false}})).status,200);
    const brand=new FormData();brand.set('name','JSON Portal');brand.set('displayMode','both');
    brand.set('logo',new File([Buffer.from('89504e470d0a1a0a00000000','hex')],'logo.png',{type:'image/png'}));
    assert.equal((await request('/api/branding',{method:'POST',cookie,body:brand})).status,200);
    assert.equal((await request('/api/branding?document='+id)).json.name,'JSON Portal');
    assert.equal((await request('/api/branding?logo=1&document='+id)).status,200);
    const json=JSON.parse(await readFile(path.join(directory,'portal.json'),'utf8'));
    assert.equal(json.portal_accounts.length,5);assert.equal(json.document_links.filter(row=>row.slug==='shared-link').length,1);
    assert.ok(!(await readFile(path.join(directory,'portal.json'),'utf8')).includes(cookie.split('=')[1]),'only session fingerprints are persisted');
    await stop();await start();
    assert.equal((await request('/api/auth/me',{cookie})).status,200);
    assert.equal((await request('/api/documents/public-link')).status,200);
    assert.equal((await request('/api/branding?document='+id)).json.name,'JSON Portal');
    const list=(await request('/api/users',{cookie})).json.users,reader=list.find(row=>row.username==='reader');
    assert.ok(list.every(row=>!('password_hash' in row)));
    assert.equal((await request('/api/users',{method:'PATCH',cookie,data:{...reader,displayName:'Reader',password:'',active:false}})).status,200);
    assert.equal((await request('/api/auth/me',{cookie:users.reader})).status,401);
    const changed=await request('/api/auth/password',{method:'POST',cookie,data:{currentPassword:account.password,password:account.password+'changed'}});assert.equal(changed.status,200,changed.text);
    assert.equal((await request('/api/auth/me',{cookie})).status,401);
    assert.equal((await request('/api/auth/me',{cookie:changed.cookie})).status,200);
    assert.equal((await request('/api/auth/logout',{method:'POST',cookie:changed.cookie})).status,303);
    assert.equal((await request('/api/auth/me',{cookie:changed.cookie})).status,401);
  }finally{await stop();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});

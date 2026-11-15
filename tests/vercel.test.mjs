import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {createClient} from '@libsql/client';

test('Vercel build: bootstrap, permissions, direct 5 MB upload, download and replacement', {timeout:120000}, async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'portal-vercel-'));
  const objects=new Map();
  const storage=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost'),key=decodeURIComponent(url.pathname);
      if(req.method==='PUT'){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);
        const body=Buffer.concat(chunks),etag='"'+createHash('md5').update(body).digest('hex')+'"';
        objects.set(key,{body,etag});res.writeHead(200,{ETag:etag}).end();return;
      }
      if(req.method==='DELETE'){objects.delete(key);res.writeHead(204).end();return;}
      const object=objects.get(key);
      if(!object){res.writeHead(404,{'Content-Type':'application/xml'}).end('<Error><Code>NoSuchKey</Code></Error>');return;}
      res.writeHead(200,{'Content-Length':object.body.length,ETag:object.etag,
        'Content-Type':url.searchParams.get('response-content-type')||'application/octet-stream',
        ...(url.searchParams.has('response-content-disposition')?{'Content-Disposition':url.searchParams.get('response-content-disposition')}:{}),});
      res.end(req.method==='HEAD'?undefined:object.body);
    }catch{res.writeHead(500).end();}
  });
  storage.listen(0,'127.0.0.1');await once(storage,'listening');
  const reservation=http.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const base=`http://127.0.0.1:${port}`;
  const env={...process.env,TURSO_DATABASE_URL:`file:${path.join(directory,'test.db').replaceAll('\\','/')}`,
    TURSO_AUTH_TOKEN:'',S3_ENDPOINT:`http://127.0.0.1:${storage.address().port}`,S3_REGION:'auto',S3_BUCKET:'test',S3_ACCESS_KEY_ID:'test',S3_SECRET_ACCESS_KEY:'test',S3_FORCE_PATH_STYLE:'true',
    ADMIN_SETUP_SECRET:randomBytes(32).toString('hex'),UPLOAD_SIGNING_SECRET:randomBytes(32).toString('hex'),SITE_OWNER_EMAIL:'owner@example.test',PORTAL_OWNER_DATA_ID:'test-owner',VERCEL:'',NEXT_TELEMETRY_DISABLED:'1'};
  let server,log='';
  try{
    for(let i=0;i<2;i++){
      const migration=spawnSync(process.execPath,['scripts/migrate.mjs'],{env,encoding:'utf8'});
      assert.equal(migration.status,0,migration.stderr);
    }
    const db=createClient({url:env.TURSO_DATABASE_URL});
    assert.equal((await db.execute('SELECT COUNT(*) AS n FROM portal_migrations')).rows[0].n,4);
    await assert.rejects(db.batch([{sql:"INSERT INTO portal_settings VALUES (1,'rollback')",args:[]},{sql:'INSERT INTO nonexistent_table VALUES (1)',args:[]}],'write'));
    assert.equal((await db.execute('SELECT * FROM portal_settings')).rows.length,0,'failed batch rolls back');db.close();
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',value=>{log+=value});server.stderr.on('data',value=>{log+=value});
    let ready=false;
    for(let i=0;i<160;i++){
      if(server.exitCode!==null)throw new Error('Next exited: '+log);
      try{if((await fetch(base+'/login')).status===200){ready=true;break}}catch{}
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    assert.ok(ready,'Next startup failed: '+log);
    async function request(url,{method='GET',data,body,cookie='',headers={}}={}){
      const response=await fetch(base+url,{method,redirect:'manual',headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):body});
      const text=await response.text();let json;try{json=JSON.parse(text)}catch{}
      return {status:response.status,json,headers:response.headers,text,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    assert.equal((await request('/api/documents')).status,401);
    const account={username:'owner',email:'owner@example.test',displayName:'Owner',password:randomBytes(20).toString('hex')};
    assert.equal((await request('/api/auth/setup',{method:'POST',data:account,headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':env.SITE_OWNER_EMAIL}})).status,403);
    const setup=await request('/api/auth/setup',{method:'POST',data:{...account,setupKey:env.ADMIN_SETUP_SECRET}});
    assert.equal(setup.status,200,setup.text);const cookie=setup.cookie;assert.ok(cookie);
    assert.equal((await request('/api/auth/setup',{method:'POST',data:{...account,setupKey:env.ADMIN_SETUP_SECRET}})).status,409);
    assert.equal((await request('/api/uploads',{method:'POST',cookie,data:{filename:'x.pdf',size:1,sha256:'0'.repeat(64)},headers:{Origin:'https://attacker.test'}})).status,403);
    const bytes=Buffer.alloc(5*1024*1024,65);bytes.write('%PDF-1.7\n');
    async function stage(content,filename='test.pdf'){
      const ticket=await request('/api/uploads',{method:'POST',cookie,data:{filename,size:content.length,sha256:createHash('sha256').update(content).digest('hex')}});
      assert.equal(ticket.status,200,ticket.text);
      assert.equal((await fetch(ticket.json.url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','x-amz-checksum-sha256':ticket.json.checksum},body:content})).status,200);
      return ticket.json.token;
    }
    const form=new FormData();form.set('uploadToken',await stage(bytes));form.set('title','Large file');form.set('status','سارية');
    const saved=await request('/api/documents',{method:'POST',cookie,body:form});assert.equal(saved.status,201,saved.text);
    const id=saved.json.id;
    const publicFile=await request('/api/documents/'+id);assert.equal(publicFile.status,307);
    const downloaded=await fetch(publicFile.headers.get('location'));const etag=downloaded.headers.get('etag');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
    assert.equal((await request('/files-portal/'+id)).status,200);
    const wrong=await request('/api/documents/'+id,{method:'PATCH',cookie,data:{uploadToken:await stage(Buffer.from('%PDF-1.7\nnew'))},headers:{'If-Match':'"old"'}});assert.equal(wrong.status,409);
    const replaced=await request('/api/documents/'+id,{method:'PATCH',cookie,data:{uploadToken:await stage(Buffer.from('%PDF-1.7\nnew')),slug:'public-link'},headers:{'If-Match':etag}});assert.equal(replaced.status,200,replaced.text);
    assert.equal((await request('/api/documents/public-link')).status,307);
    const bad=await request('/api/documents',{method:'POST',cookie,data:{}});assert.equal(bad.status,400);
    const badForm=new FormData();badForm.set('uploadToken',await stage(Buffer.from('invalid content')));badForm.set('title','Bad');badForm.set('status','سارية');
    assert.equal((await request('/api/documents',{method:'POST',cookie,body:badForm})).status,400);
    assert.equal((await request('/api/users',{method:'POST',cookie,data:{username:'reader',email:'reader@example.test',displayName:'Reader',password:account.password}})).status,200);
    const reader=await request('/api/auth/login',{method:'POST',data:{identifier:'reader',password:account.password}});assert.equal(reader.status,200);
    assert.equal((await request('/api/uploads',{method:'POST',cookie:reader.cookie,data:{filename:'x.pdf',size:1,sha256:'0'.repeat(64)}})).status,403);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie:reader.cookie,data:{deleted:true}})).status,403);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie,data:{deleted:true}})).status,200);
    assert.equal((await request('/api/documents/public-link')).status,404);
    assert.equal((await request('/api/documents/'+id,{method:'PATCH',cookie,data:{deleted:false}})).status,200);
    assert.equal((await request('/api/documents/public-link')).status,307);
  }finally{
    if(server && server.exitCode===null){server.kill();await once(server,'exit');}
    await new Promise(resolve=>storage.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
    await rm(directory,{recursive:true,force:true});
  }
});

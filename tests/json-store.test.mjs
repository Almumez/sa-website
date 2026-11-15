import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,unlink,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import path from 'node:path';
import os from 'node:os';
import {createJsonStore} from '../lib/server/json-store.mjs';

test('atomic JSON transactions, independent processes, rollback, backups and corruption protection',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'portal-json-test-'));
  const store=createJsonStore(root);
  try{
    await store.transaction(data=>data.portal_login_limits.push({key:'counter',window:1,count:0}));
    await Promise.all(Array.from({length:20},()=>store.transaction(async data=>{
      await new Promise(resolve=>setTimeout(resolve,2));data.portal_login_limits[0].count++;
    })));
    assert.equal((await store.read()).portal_login_limits[0].count,20);
    const code=`import {createJsonStore} from ${JSON.stringify(new URL('../lib/server/json-store.mjs',import.meta.url).href)};const store=createJsonStore(process.argv[1]);for(let i=0;i<10;i++)await store.transaction(data=>{data.portal_login_limits[0].count++;});`;
    const children=Array.from({length:3},()=>spawn(process.execPath,['--input-type=module','-e',code,root],{stdio:['ignore','pipe','pipe']}));
    const results=await Promise.all(children.map(async child=>{let errors='';child.stderr.on('data',chunk=>errors+=chunk);const [exit]=await once(child,'exit');assert.equal(exit,0,errors);}));
    assert.equal(results.length,3);assert.equal((await store.read()).portal_login_limits[0].count,50);
    assert.equal(JSON.parse(await readFile(path.join(root,'portal.previous.json'),'utf8')).portal_login_limits[0].count,49);
    await assert.rejects(store.transaction(data=>{data.portal_login_limits[0].count=99;throw new Error('rollback');}),/rollback/);
    assert.equal((await store.read()).portal_login_limits[0].count,50);
    await assert.rejects(store.transaction(data=>data.portal_login_limits.push({key:'counter',window:1,count:0})),/Duplicate/);
    assert.equal((await store.read()).portal_login_limits.length,1);
    const crashCode=`import {createJsonStore} from ${JSON.stringify(new URL('../lib/server/json-store.mjs',import.meta.url).href)};await createJsonStore(process.argv[1]).transaction(()=>process.exit(0));`;
    assert.equal(spawnSync(process.execPath,['--input-type=module','-e',crashCode,root]).status,0);
    const recovered=spawnSync(process.execPath,['scripts/recover-json-lock.mjs'],{env:{...process.env,VERCEL:'',PORTAL_DATA_DIR:root},encoding:'utf8'});
    assert.equal(recovered.status,0,recovered.stderr);
    await store.transaction(data=>{data.portal_login_limits[0].count++;});
    assert.equal((await store.read()).portal_login_limits[0].count,51);
    await writeFile(path.join(root,'portal.json'),'{broken','utf8');
    await assert.rejects(store.transaction(data=>{data.portal_login_limits=[];}),/data is invalid/);
    assert.equal(await readFile(path.join(root,'portal.json'),'utf8'),'{broken');
    await unlink(path.join(root,'portal.json'));
    await assert.rejects(store.read(),/backup exists/);
  }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(root,{recursive:true,force:true});}
});

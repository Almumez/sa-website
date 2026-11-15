import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BlobPreconditionFailedError} from '@vercel/blob';
import {createVercelJsonStore} from '../lib/server/vercel-json-store.mjs';

function memoryBlob(){
  const objects=new Map();let version=0;
  return {
    objects,
    async get(path){
      const item=objects.get(path);if(!item)return null;
      const bytes=new TextEncoder().encode(item.raw);
      return {statusCode:200,blob:{etag:item.etag},stream:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};
    },
    async put(path,body,options){
      const old=objects.get(path);
      if(options.ifMatch!==undefined&&old?.etag!==options.ifMatch)throw new BlobPreconditionFailedError();
      if(!options.allowOverwrite&&old)throw new BlobPreconditionFailedError();
      const raw=typeof body==='string'?body:Buffer.from(body).toString('utf8');
      const etag=`test-${++version}`;objects.set(path,{raw,etag});return {etag};
    },
  };
}

test('Vercel Blob JSON storage initializes once and preserves concurrent transactions',async()=>{
  const blob=memoryBlob(),stores=Array.from({length:8},()=>createVercelJsonStore(blob));
  assert.equal((await stores[0].read()).portal_accounts.length,0);
  await Promise.all(Array.from({length:24},(_,index)=>stores[index%stores.length].transaction(data=>{
    const row=data.portal_login_limits.find(item=>item.key==='parallel');
    if(row)row.count++;else data.portal_login_limits.push({key:'parallel',window:1,count:1});
  })));
  assert.equal((await stores[3].read()).portal_login_limits[0].count,24);
  assert.ok(blob.objects.has('portal/recovery/index.json'));
  assert.equal([...blob.objects.keys()].filter(path=>path.startsWith('portal/recovery/')&&path.endsWith('.json')).length,2,'ephemeral login counters must not create backup churn');
});

test('Vercel Blob JSON storage refuses to silently reset when the main object disappears',async()=>{
  const blob=memoryBlob(),store=createVercelJsonStore(blob);
  await store.transaction(data=>data.portal_login_limits.push({key:'x',window:1,count:1}));
  await store.transaction(data=>{data.portal_login_limits[0].count++;});
  blob.objects.delete('portal/state.json');
  await assert.rejects(store.read(),/backup exists/);
});

test('Vercel Blob JSON recovery snapshots are immutable and deduplicated',async()=>{
  const blob=memoryBlob(),store=createVercelJsonStore(blob);
  await store.transaction(data=>data.portal_accounts.push({id:'owner',username:'owner',email:'owner@example.test',display_name:'Owner',password_hash:'hash',role:'owner',active:1,can_add:1,can_edit:1,can_delete:1}));
  await store.transaction(data=>data.portal_sessions.push({token_hash:'token',account_id:'owner',expires_at:10}));
  await store.transaction(data=>data.portal_login_limits.push({key:'login',window:1,count:1}));
  const snapshots=[...blob.objects.keys()].filter(path=>path.startsWith('portal/recovery/')&&path.endsWith('.json'));
  assert.equal(snapshots.length,2);
  const recovered=JSON.parse(blob.objects.get(snapshots.find(path=>path!=='portal/recovery/index.json')).raw);
  assert.equal(recovered.portal_accounts.length,1);
  assert.deepEqual(recovered.portal_sessions,[]);
  assert.deepEqual(recovered.portal_login_limits,[]);
});

test('Vercel Blob JSON transaction retries sustained ETag contention',async()=>{
  const blob=memoryBlob(),store=createVercelJsonStore(blob);
  await store.transaction(data=>data.portal_login_limits.push({key:'counter',window:1,count:0}));
  let conflicts=45;
  const busyClient={
    get:(...args)=>blob.get(...args),
    put:(...args)=>{
      if(args[0]==='portal/state.json'&&conflicts-->0)throw new BlobPreconditionFailedError();
      return blob.put(...args);
    },
  };
  const resilient=createVercelJsonStore(busyClient);
  await resilient.transaction(data=>{data.portal_login_limits[0].count++;});
  assert.equal((await store.read()).portal_login_limits[0].count,1);
});

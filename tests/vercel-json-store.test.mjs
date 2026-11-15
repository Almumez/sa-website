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
  assert.ok(blob.objects.has('portal/state.previous.json'));
});

test('Vercel Blob JSON storage refuses to silently reset when the main object disappears',async()=>{
  const blob=memoryBlob(),store=createVercelJsonStore(blob);
  await store.transaction(data=>data.portal_login_limits.push({key:'x',window:1,count:1}));
  await store.transaction(data=>{data.portal_login_limits[0].count++;});
  blob.objects.delete('portal/state.json');
  await assert.rejects(store.read(),/backup exists/);
});

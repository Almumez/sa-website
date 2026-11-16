import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3';
import {emptyData} from '../lib/server/json-store.mjs';
import {createR2JsonStore} from '../lib/server/r2-json-store.mjs';

function precondition(){return Object.assign(new Error('Precondition failed'),{name:'PreconditionFailed',$metadata:{httpStatusCode:412}});}
function memoryR2(){
  const objects=new Map();let version=0;
  return {objects,async send(command){
    await new Promise(resolve=>setTimeout(resolve,0));
    const input=command.input;
    if(command instanceof GetObjectCommand){
      const item=objects.get(input.Key);if(!item)throw Object.assign(new Error('Not found'),{name:'NoSuchKey',$metadata:{httpStatusCode:404}});
      return {ETag:item.etag,Body:{transformToString:async()=>item.raw}};
    }
    if(command instanceof PutObjectCommand){
      const old=objects.get(input.Key);
      if(input.IfNoneMatch==='*'&&old)throw precondition();
      if(input.IfMatch!==undefined&&old?.etag!==input.IfMatch)throw precondition();
      const raw=typeof input.Body==='string'?input.Body:Buffer.from(input.Body).toString('utf8');
      const ETag=`"r2-${++version}"`;objects.set(input.Key,{raw,etag:ETag});return {ETag};
    }
    throw new Error(`Unsupported R2 command: ${command.constructor.name}`);
  }};
}
function memoryBlob(initial){
  const objects=new Map();if(initial)objects.set('portal/state.json',{raw:JSON.stringify(initial),etag:'legacy-1'});
  return {objects,async get(path){
    const item=objects.get(path);if(!item)return null;
    const bytes=new TextEncoder().encode(item.raw);
    return {statusCode:200,blob:{etag:item.etag},stream:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})};
  }};
}

test('R2 JSON store migrates Blob state without deleting the legacy copy',async()=>{
  const legacy=emptyData();legacy.portal_login_limits.push({key:'kept',window:1,count:4});
  const r2=memoryR2(),blob=memoryBlob(legacy),store=createR2JsonStore(r2,blob);
  assert.equal((await store.read()).portal_login_limits[0].count,4);
  await store.transaction(data=>{data.portal_login_limits[0].count++;});
  assert.equal((await store.read()).portal_login_limits[0].count,5);
  assert.equal(JSON.parse(blob.objects.get('portal/state.json').raw).portal_login_limits[0].count,4);
  assert.ok(r2.objects.has('portal/state.json'));
  assert.ok(r2.objects.has('portal/state.previous.json')||[...r2.objects.keys()].some(key=>key.startsWith('portal/recovery/')));
  assert.ok(r2.objects.has('portal/recovery/index.json'));
});

test('R2 JSON store preserves concurrent updates with conditional writes',async()=>{
  const r2=memoryR2(),store=createR2JsonStore(r2,memoryBlob());
  await Promise.all(Array.from({length:20},()=>store.transaction(data=>{
    const row=data.portal_login_limits.find(item=>item.key==='parallel');
    if(row)row.count++;else data.portal_login_limits.push({key:'parallel',window:1,count:1});
  })));
  assert.equal((await store.read()).portal_login_limits[0].count,20);
});

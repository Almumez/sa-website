import {cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {store,dataDirectory} from '../lib/server/json-store.mjs';

const source=dataDirectory(),target=path.resolve('backups','json-'+new Date().toISOString().replaceAll(':','-')+'-'+randomUUID());
if(target===source||target.startsWith(source+path.sep))throw new Error('Backup destination must be outside the data directory.');
await mkdir(path.dirname(target),{recursive:true,mode:0o700});
await store.transaction(async()=>{
  await cp(source,target,{recursive:true,errorOnExist:true,force:false,filter:entry=>path.basename(entry)!=='.write-lock'&&!path.basename(entry).includes('.tmp-')});
});
console.log('Private backup:',target);

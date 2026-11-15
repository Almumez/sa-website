import {readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {dataDirectory} from '../lib/server/json-store.mjs';

const lock=path.join(dataDirectory(),'.write-lock');
try{
  const owner=JSON.parse(await readFile(path.join(lock,'owner.json'),'utf8'));
  try{process.kill(owner.pid,0);throw new Error('The writer is still running. Stop the application first.');}
  catch(error){if(error.code!=='ESRCH')throw error;}
  await unlink(path.join(lock,'owner.json'));await rmdir(lock);
  console.log('Removed abandoned write lock.');
}catch(error){if(error.code==='ENOENT')console.log('No abandoned lock found.');else throw error;}

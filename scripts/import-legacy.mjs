import {spawnSync} from 'node:child_process';
import {readFile,rename,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {dataDirectory,validateData} from '../lib/server/json-store.mjs';

const target=dataDirectory(),staging=target+'-import-'+randomUUID();
try{await stat(target);throw new Error('Destination exists. Refusing to overwrite local JSON data. Choose a new PORTAL_DATA_DIR.');}
catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(path.dirname(target),{recursive:true});
const source=path.resolve(process.env.LEGACY_STATE_DIR||'.wrangler/state/v3');
const result=spawnSync(process.env.PYTHON||'python',['scripts/export-legacy.py',source,staging],{encoding:'utf8'});
if(result.status!==0)throw new Error('Migration stopped. Original data is unchanged. Staging: '+staging+'\n'+(result.stderr||result.error?.message||''));
const data=validateData(JSON.parse(await readFile(path.join(staging,'portal.json'),'utf8')));
const manifest=JSON.parse(await readFile(path.join(staging,'migration-manifest.json'),'utf8'));
for(const object of manifest){
  if(!/^[a-f0-9]{64}$/.test(object.file))throw new Error('Invalid migration path');
  const bytes=await readFile(path.join(staging,'uploads',object.file));
  if(bytes.length!==object.size||createHash('sha256').update(bytes).digest('hex')!==object.sha256)throw new Error('Migrated content verification failed');
}
// Rename only after validating the complete JSON and every copied object. No source files are removed.
await rename(staging,target);
console.log(`Migrated ${data.documents.length} documents, ${data.portal_accounts.length} accounts and ${manifest.length} objects to ${target}`);

import {mkdir, readFile, open, rename, unlink, rmdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {vercelStore} from './vercel-json-store.mjs';

const text=z.string(),flag=z.union([z.literal(0),z.literal(1)]);
export const portalSchema=z.object({
  schemaVersion:z.literal(1),
  documents:z.array(z.object({id:text,slug:text.nullable(),owner:text,title:text,filename:text,mime:text,size:z.number().int().nonnegative(),object_key:text,
    document_number:text,unified_number:text,created:text,status:text,facility:text,cr:text,subscription:text,applicant:text,category:text,uploaded_at:text,deleted:flag})),
  document_links:z.array(z.object({slug:text,document_id:text})),
  branding:z.array(z.object({owner:text,name:text,display_mode:text,logo_key:text.nullable(),logo_mime:text.nullable(),updated_at:text})),
  portal_accounts:z.array(z.object({id:text,username:text,email:text,display_name:text,password_hash:text,role:z.enum(['owner','member']),active:flag,can_add:flag,can_edit:flag,can_delete:flag})),
  portal_settings:z.array(z.object({id:z.literal(1),owner_data_id:text})).max(1),
  portal_sessions:z.array(z.object({token_hash:text,account_id:text,expires_at:z.number()})),
  portal_login_limits:z.array(z.object({key:text,window:z.number(),count:z.number()})),
});

export function emptyData(){return portalSchema.parse({schemaVersion:1,documents:[],document_links:[],branding:[],portal_accounts:[],portal_settings:[],portal_sessions:[],portal_login_limits:[]});}
export function validateData(value){
  const data=portalSchema.parse(value);
  for(const [rows,key] of [[data.documents,'id'],[data.document_links,'slug'],[data.branding,'owner'],[data.portal_accounts,'id'],[data.portal_accounts,'username'],[data.portal_accounts,'email'],[data.portal_sessions,'token_hash'],[data.portal_login_limits,'key']]){
    const keys=rows.map(row=>row[key]);if(new Set(keys).size!==keys.length)throw new Error(`Duplicate JSON field: ${key}`);
  }
  const documents=new Set(data.documents.map(row=>row.id)),accounts=new Set(data.portal_accounts.map(row=>row.id));
  if(data.document_links.some(row=>!documents.has(row.document_id))||data.portal_sessions.some(row=>!accounts.has(row.account_id)))throw new Error('Invalid JSON relationship');
  return data;
}
export function dataDirectory(){
  if(useVercelBlob())throw new Error('Vercel Blob is the active storage backend; local data directory is unavailable.');
  return path.resolve(process.env.PORTAL_DATA_DIR||path.join(process.cwd(),'data'));
}
function useVercelBlob(){return process.env.VERCEL==='1'||process.env.PORTAL_STORAGE_BACKEND==='vercel-blob';}
function assertVercelBlobConfigured(){if(!(process.env.BLOB_READ_WRITE_TOKEN||(process.env.VERCEL==='1'&&process.env.BLOB_STORE_ID&&process.env.VERCEL_OIDC_TOKEN)))throw new Error('Persistent storage is not connected. Create a private Vercel Blob store and connect it to this project.');}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** @param {string} directory */
export function createJsonStore(directory){
  const root=path.resolve(directory),filename=path.join(root,'portal.json'),lock=path.join(root,'.write-lock');
  async function acquire(){
    await mkdir(root,{recursive:true,mode:0o700});
    const deadline=Date.now()+15000;
    for(;;){
      try{await mkdir(lock,{mode:0o700});}
      catch(error){
        if(error.code!=='EEXIST')throw error;
        // Never steal a lock: a slow live writer must not be mistaken for a crashed one.
        // After a crash, stop the app and use scripts/recover-json-lock.mjs.
        if(Date.now()>deadline)throw new Error('JSON storage is busy. If the process crashed, stop the app and run npm run data:unlock.');
        await delay(20+Math.floor(Math.random()*20));continue;
      }
      try{await writeFileSynced(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid}));}
      catch(error){try{await rmdir(lock);}catch{}throw error;}
      return async()=>{await unlink(path.join(lock,'owner.json'));await rmdir(lock);};
    }
  }
  async function read(){
    try{return validateData(JSON.parse(await readFile(filename,'utf8')));}
    catch(error){
      if(error.code==='ENOENT'){
        try{await stat(path.join(root,'portal.previous.json'));}
        catch(previousError){if(previousError.code==='ENOENT')return emptyData();throw previousError;}
        throw new Error('Main JSON file is missing but a backup exists. Restore a verified backup; data was not reset.');
      }
      throw new Error('JSON data is invalid or unreadable. Restore a verified backup; data was not reset.',{cause:error});
    }
  }
  /** @template T @param {(data: import('./models').PortalData)=>T|Promise<T>} operation @returns {Promise<T>} */
  async function transaction(operation){
    const release=await acquire();
    try{
      const previous=await read(),draft=structuredClone(previous),result=await operation(draft);
      const encoded=JSON.stringify(validateData(draft),null,2)+'\n';
      if(encoded!==JSON.stringify(previous,null,2)+'\n'){
        await atomicWrite(path.join(root,'portal.previous.json'),JSON.stringify(previous,null,2)+'\n');
        await atomicWrite(filename,encoded);
      }else{
        try{await stat(filename);}catch(error){if(error.code!=='ENOENT')throw error;await atomicWrite(filename,encoded);}
      }
      return result;
    }finally{await release();}
  }
  return {read,transaction};
}
async function writeFileSynced(filename,content){
  const file=await open(filename,'wx',0o600);
  try{await file.writeFile(content,'utf8');await file.sync();}finally{await file.close();}
}
async function atomicWrite(filename,content){
  const temporary=filename+'.tmp-'+randomUUID();
  try{
    await writeFileSynced(temporary,content);
    for(let retry=0;;retry++){
      try{await rename(temporary,filename);break;}
      catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||retry>=10)throw error;await delay(25);}
    }
  }finally{try{await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}
}
export const store={
  read:()=>{if(useVercelBlob()){assertVercelBlobConfigured();return vercelStore.read();}return createJsonStore(dataDirectory()).read();},
  /** @template T @param {(data: import('./models').PortalData)=>T|Promise<T>} operation @returns {Promise<T>} */
  transaction:operation=>{if(useVercelBlob()){assertVercelBlobConfigured();return vercelStore.transaction(operation);}return createJsonStore(dataDirectory()).transaction(operation);},
};

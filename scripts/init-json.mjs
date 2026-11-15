import {store,dataDirectory} from '../lib/server/json-store.mjs';
await store.transaction(()=>{});
const data=await store.read();
console.log('JSON storage:',dataDirectory());
console.log(`Documents: ${data.documents.length}; accounts: ${data.portal_accounts.length}`);

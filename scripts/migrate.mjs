import {createClient} from '@libsql/client';
import {readdir,readFile} from 'node:fs/promises';

if(!process.env.TURSO_DATABASE_URL)throw new Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first.');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try {
  await client.execute('CREATE TABLE IF NOT EXISTS portal_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied=new Set((await client.execute('SELECT name FROM portal_migrations')).rows.map(row=>row.name));
  const directory=new URL('../drizzle/',import.meta.url);
  const files=(await readdir(directory)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  for(const name of files){
    if(applied.has(name))continue;
    const sql=await readFile(new URL(name,directory),'utf8');
    const statements=sql.split(/--> statement-breakpoint|;/).map(value=>value.trim()).filter(Boolean);
    await client.batch([...statements.map(sql=>({sql,args:[]})),{sql:'INSERT INTO portal_migrations (name,applied_at) VALUES (?,?)',args:[name,new Date().toISOString()]}],'write');
    console.log('Applied',name);
  }
} finally {client.close();}

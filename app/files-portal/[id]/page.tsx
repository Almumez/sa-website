import Portal from '../../portal';
import {env} from 'cloudflare:workers';
import type {Metadata} from 'next';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const brand=await env.DB!.prepare('SELECT b.name,b.logo_key,b.updated_at FROM documents d LEFT JOIN branding b ON b.owner=d.owner WHERE d.id=? AND d.deleted=0').bind(id).first<{name:string|null;logo_key:string|null;updated_at:string|null}>();
 const icon=brand?.logo_key?`/api/branding?logo=1&document=${encodeURIComponent(id)}&v=${encodeURIComponent(brand.updated_at||'')}`:'/favicon.svg';
 return {title:brand?.name||'بوابة الملفات',icons:{icon,shortcut:icon,apple:icon},robots:{index:false,follow:false}};
}
export default async function Viewer({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Portal documentId={id} />}

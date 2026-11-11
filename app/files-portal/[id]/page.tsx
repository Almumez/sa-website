import Portal from '../../portal';
import {env} from 'cloudflare:workers';
import type {Metadata} from 'next';
import {findDocument} from '../../document-links';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params;
 const doc=await findDocument(id);
 const brand=doc?await env.DB!.prepare('SELECT name,logo_key,updated_at FROM branding WHERE owner=?').bind(doc.owner).first<{name:string|null;logo_key:string|null;updated_at:string|null}>():null;
 const icon=brand?.logo_key?`/api/branding?logo=1&document=${encodeURIComponent(id)}&v=${encodeURIComponent(brand.updated_at||'')}`:'/favicon.svg';
 return {title:brand?.name||'بوابة الملفات',icons:{icon,shortcut:icon,apple:icon},robots:{index:false,follow:false}};
}
export default async function Viewer({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Portal documentId={id} />}

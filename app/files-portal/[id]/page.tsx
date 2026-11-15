import Portal from '../../portal';
import {getBranding} from '@/lib/server/repository';
import {cache} from 'react';
import type {Metadata} from 'next';
import type {Brand} from '../../branding';
import {findDocument} from '../../document-links';
export const dynamic='force-dynamic';
const documentBrand=cache(async(id:string):Promise<Brand>=>{
 const doc=await findDocument(id);
 const brand=doc?await getBranding(doc.owner):null;
 return {name:brand?.name||'بوابة الملفات',displayMode:brand?.display_mode||'name',hasLogo:!!brand?.logo_key,version:brand?.updated_at||'',documentId:id};
});
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
 const {id}=await params,brand=await documentBrand(id);
 const icon=brand.hasLogo?`/api/branding?logo=1&document=${encodeURIComponent(id)}&v=${encodeURIComponent(brand.version)}`:'/favicon.svg';
 return {title:brand.name,icons:{icon,shortcut:icon,apple:icon},robots:{index:false,follow:false}};
}
export default async function Viewer({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Portal documentId={id} initialBrand={await documentBrand(id)}/>}

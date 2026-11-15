import {store} from '@/lib/server/repository';
export const normalizeSlug=(value:string)=>value.trim().normalize('NFC').toLowerCase();
export function validSlug(value:string){return /^[\p{L}\p{N}][\p{L}\p{N}_-]{2,99}$/u.test(value)&&!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))}
export async function findDocument(reference:string){const data=await store.read();const linked=data.document_links.find(row=>row.slug===normalizeSlug(reference))?.document_id;return data.documents.find(row=>(row.id===reference||row.id===linked)&&row.deleted===0)||null;}

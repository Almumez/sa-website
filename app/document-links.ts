import {env} from 'cloudflare:workers';
export const normalizeSlug=(value:string)=>value.trim().normalize('NFC').toLowerCase();
export function validSlug(value:string){return /^[\p{L}\p{N}][\p{L}\p{N}_-]{2,99}$/u.test(value)&&!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))}
export function findDocument(reference:string):Promise<any>{return env.DB!.prepare('SELECT d.* FROM documents d WHERE (d.id=? OR d.id=(SELECT document_id FROM document_links WHERE slug=?)) AND d.deleted=0').bind(reference,normalizeSlug(reference)).first()}

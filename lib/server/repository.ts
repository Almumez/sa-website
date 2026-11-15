import 'server-only';
import {store} from './json-store.mjs';
import type {BrandingRecord} from './models';

export {store};
export async function getBranding(owner:string){return (await store.read()).branding.find(row=>row.owner===owner)||null;}
export async function saveBranding(brand:BrandingRecord){await store.transaction(data=>{
  data.branding=data.branding.filter(row=>row.owner!==brand.owner);data.branding.push(brand);
});}
export async function listDocuments(owner:string,deleted=0){return (await store.read()).documents.filter(row=>row.owner===owner&&row.deleted===deleted).sort((a,b)=>b.uploaded_at.localeCompare(a.uploaded_at));}

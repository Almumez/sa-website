import {PDFDocument,PDFDict,PDFName,PDFRef,PDFArray,PDFStream,type PDFObject,type PDFPage} from 'pdf-lib';
export type EditorPage={key:string;source:string;index:number};
function hasFormWidgets(page:PDFPage){return page.node.Annots()?.asArray().some(ref=>{const annotation=page.doc.context.lookup(ref);return annotation instanceof PDFDict&&annotation.get(PDFName.of('Subtype'))?.toString()==='/Widget'})||false}
function pruneUnusedObjects(pdf:PDFDocument){
 const reachable=new Set<string>();
 function visit(object:PDFObject|undefined){
  if(object instanceof PDFRef){const key=object.toString();if(reachable.has(key))return;reachable.add(key);visit(pdf.context.lookup(object));}
  else if(object instanceof PDFDict){for(const [,value] of object.entries())visit(value);}
  else if(object instanceof PDFArray){for(const value of object.asArray())visit(value);}
  else if(object instanceof PDFStream)visit(object.dict);
 }
 for(const root of Object.values(pdf.context.trailerInfo))visit(root);
 for(const [ref] of pdf.context.enumerateIndirectObjects())if(!reachable.has(ref.toString()))pdf.context.delete(ref);
}
export function movePage(pages:EditorPage[],from:number,to:number){if(from<0||from>=pages.length||to<0||to>=pages.length||from===to)return pages;const next=[...pages],item=next.splice(from,1)[0];next.splice(to,0,item);return next}
export async function buildEditedPDF(original:Uint8Array,pages:EditorPage[],sources:Map<string,Uint8Array>){
 if(!pages.length)throw new Error('يجب الإبقاء على صفحة واحدة على الأقل.');
 const output=await PDFDocument.load(original,{updateMetadata:false});
 const originalPages=output.getPages(),kept=new Set(pages.filter(p=>p.source==='original').map(p=>p.index));
 if(originalPages.some((page,index)=>!kept.has(index)&&hasFormWidgets(page)))throw new Error('الصفحة المطلوب حذفها أو استبدالها تحتوي حقول نموذج تفاعلية. يمكن تغيير ترتيبها، لكن حذفها أو استبدالها غير مدعوم لحماية بيانات النموذج.');
 const parsed=new Map<string,PDFDocument>(),ordered:PDFPage[]=[];
 for(const page of pages){
  if(!Number.isInteger(page.index)||page.index<0)throw new Error('رقم صفحة غير صالح.');
  if(page.source==='original'){if(!originalPages[page.index])throw new Error('صفحة أصلية غير موجودة.');ordered.push(originalPages[page.index]);continue}
  let source=parsed.get(page.source);if(!source){const bytes=sources.get(page.source);if(!bytes)throw new Error('ملف الصفحة البديلة غير موجود.');source=await PDFDocument.load(bytes,{updateMetadata:false});parsed.set(page.source,source)}
  const selected=source.getPage(page.index);if(hasFormWidgets(selected))throw new Error('الصفحة البديلة تحتوي نموذجًا تفاعليًا؛ اختر صفحة PDF عادية للحفاظ على بيانات النماذج.');
  ordered.push((await output.copyPages(source,[page.index]))[0]);
 }
 for(let index=originalPages.length-1;index>=0;index--)output.removePage(index);
 for(const page of ordered)output.addPage(page);
 output.setModificationDate(new Date());
 pruneUnusedObjects(output);
 const result=await output.save({addDefaultPage:false,updateFieldAppearances:false});
 if(result.byteLength>20*1024*1024)throw new Error('حجم النسخة المعدّلة يتجاوز 20 ميجابايت.');
 return result;
}

export class UploadError extends Error{constructor(message:string,public status=400){super(message)}}
export async function validateFile(value:FormDataEntryValue|null){
 if(!(value instanceof File)||!value.size)throw new UploadError('اختر ملفًا غير فارغ');
 if(value.size>20*1024*1024)throw new UploadError('الحد الأقصى للملف 20 ميجابايت',413);
 const ext=value.name.split('.').pop()?.toLowerCase()||'';
 const types:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv',zip:'application/zip'};
 if(!types[ext])throw new UploadError('نوع الملف غير مدعوم');
 const bytes=new Uint8Array(await value.arrayBuffer()),head=new TextDecoder().decode(bytes.slice(0,12));
 const valid=ext==='pdf'?head.startsWith('%PDF-'):ext==='png'?bytes[0]===137&&head.slice(1,4)==='PNG':['jpg','jpeg'].includes(ext)?bytes[0]===255&&bytes[1]===216:ext==='webp'?head.startsWith('RIFF')&&head.slice(8,12)==='WEBP':['zip','docx','xlsx','pptx'].includes(ext)?head.startsWith('PK'):!bytes.slice(0,4096).includes(0);
 if(!valid)throw new UploadError('محتوى الملف لا يتطابق مع نوعه');
 return {bytes,mime:types[ext],filename:value.name.slice(0,255),size:value.size};
}

'use client';

export async function directUpload(file:File):Promise<string> {
  if (!file.size || file.size>20*1024*1024) throw new Error('اختر ملفًا غير فارغ حتى 20 ميجابايت');
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  const sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  const response=await fetch('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({filename:file.name,size:file.size,sha256})});
  const data=await response.json() as {error?:string;url:string;checksum:string;token:string};
  if (!response.ok) throw new Error(data.error || 'تعذر بدء الرفع');
  const uploaded=await fetch(data.url,{method:'PUT',headers:{'Content-Type':'application/octet-stream','x-amz-checksum-sha256':data.checksum},body:file});
  if (!uploaded.ok) throw new Error('تعذر رفع الملف إلى التخزين. تحقق من الاتصال وإعداد CORS.');
  return data.token;
}

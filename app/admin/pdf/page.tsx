import {env} from 'cloudflare:workers';
import {requirePortalAdmin} from '../../portal-access';
import {FileText,ArrowRight,ChevronLeft} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function PDFDocuments(){
 const user=await requirePortalAdmin('/admin/pdf');
 const result=await env.DB!.prepare('SELECT id,title,filename,size,document_number FROM documents WHERE owner=? AND mime=? AND deleted=0 ORDER BY uploaded_at DESC').bind(user.userId,'application/pdf').all<{id:string;title:string;filename:string;size:number;document_number:string}>();
 return <><header className="topbar"><span className="brand"><FileText/>إدارة صفحات PDF</span><a className="btn subtle" href="/admin"><ArrowRight size={17}/>لوحة التحكم</a></header><main className="workspace library"><div className="page-heading"><div><span className="eyebrow">أدوات الوثائق</span><h1>إدارة صفحات PDF</h1><p>اختر ملفًا لاستبدال صفحاته أو حذفها أو تغيير ترتيبها.</p></div></div><section className="files-panel"><div className="panel-top"><h2>ملفات PDF <span>{result.results.length}</span></h2></div>{result.results.length?<div className="pdf-manager-list">{result.results.map(doc=><a href={`/admin/pdf/${doc.id}`} key={doc.id}><span className="file-icon"><FileText/></span><div><strong>{doc.title}</strong><small>{doc.filename} · {doc.document_number} · {(doc.size/1048576).toFixed(1)} MB</small></div><span className="btn subtle">إدارة الصفحات<ChevronLeft size={16}/></span></a>)}</div>:<div className="empty"><FileText size={35}/><h3>لا توجد ملفات PDF بعد</h3><p>ارفع ملف PDF من لوحة التحكم ليظهر هنا.</p><a className="btn primary" href="/admin">العودة إلى الملفات</a></div>}</section></main></>;
}

import PDFPageEditor from '../../../pdf-page-editor';
export default async function PDFEditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){const {id}=await params,query=await searchParams;return <PDFPageEditor documentId={id} justSaved={query.saved==='1'}/>}

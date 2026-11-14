import {requirePortalPermission} from '../../../portal-access';
import PDFPageEditor from '../../../pdf-page-editor';
export default async function PDFEditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){const {id}=await params,query=await searchParams;await requirePortalPermission('canEdit','/admin/pdf/'+id);return <PDFPageEditor documentId={id} justSaved={query.saved==='1'}/>}

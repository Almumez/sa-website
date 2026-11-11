import Portal from '../../portal';
export default async function Viewer({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Portal documentId={id} />}
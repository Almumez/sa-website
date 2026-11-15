import Portal from './portal';
import {requirePortalAdmin} from './portal-access';
export const dynamic='force-dynamic';
export default async function Home(){await requirePortalAdmin('/');return <Portal blobUploads={process.env.VERCEL==='1'} />;}

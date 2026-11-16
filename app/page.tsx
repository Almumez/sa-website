import Portal from './portal';
import {requirePortalAdmin} from './portal-access';
import {r2Configured} from '@/lib/server/r2-storage';
export const dynamic='force-dynamic';
export default async function Home(){await requirePortalAdmin('/');return <Portal uploadBackend={r2Configured?'r2':process.env.VERCEL==='1'?'vercel-blob':'server'} />;}

import Portal from '../portal';
import {r2Configured} from '@/lib/server/r2-storage';
export default function Admin(){return <Portal admin uploadBackend={r2Configured?'r2':process.env.VERCEL==='1'?'vercel-blob':'server'} />}

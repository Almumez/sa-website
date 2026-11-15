import Portal from '../portal';
export default function Admin(){return <Portal admin blobUploads={process.env.VERCEL==='1'} />}

import {requirePortalAdmin} from '../portal-access';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){await requirePortalAdmin('/admin');return children}

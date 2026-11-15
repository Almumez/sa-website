import type { Metadata } from 'next';
import {getBranding} from '@/lib/server/repository';
import {getPortalAdmin} from './portal-access';
import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 let name='بوابة الملفات',icon='/favicon.svg';
 const user=await getPortalAdmin();
 if(user){const brand=await getBranding(user.ownerId);if(brand?.name)name=brand.name;if(brand?.logo_key)icon=`/api/branding?logo=1&v=${encodeURIComponent(brand.updated_at)}`;}
 return {title:name,icons:{icon,shortcut:icon,apple:icon},description:'بوابة عربية لحفظ الملفات وإدارة الوثائق ومعاينتها.'};
}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}

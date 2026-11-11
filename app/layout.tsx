import type { Metadata } from 'next';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from './chatgpt-auth';
import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 let name='بوابة الملفات',icon='/favicon.svg';
 const user=await getChatGPTUser();
 if(user&&env.DB){const brand=await env.DB.prepare('SELECT name,logo_key,updated_at FROM branding WHERE owner=?').bind(user.userId).first<{name:string;logo_key:string|null;updated_at:string}>();if(brand?.name)name=brand.name;if(brand?.logo_key)icon=`/api/branding?logo=1&v=${encodeURIComponent(brand.updated_at)}`;}
 return {title:name,icons:{icon,shortcut:icon,apple:icon},description:'بوابة عربية لحفظ الملفات وإدارة الوثائق ومعاينتها.'};
}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}

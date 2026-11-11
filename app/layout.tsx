import type { Metadata } from 'next';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from './chatgpt-auth';
import './globals.css';
export const dynamic='force-dynamic';
export async function generateMetadata():Promise<Metadata>{
 let name='بوابة الملفات';
 const user=await getChatGPTUser();
 if(user&&env.DB){const brand=await env.DB.prepare('SELECT name FROM branding WHERE owner=?').bind(user.userId).first<{name:string}>();if(brand?.name)name=brand.name;}
 return {title:name,description:'بوابة عربية لحفظ الملفات وإدارة الوثائق ومعاينتها.'};
}
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}

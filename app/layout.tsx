import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'بوابة الملفات | إدارة وعرض الوثائق',description:'بوابة عربية لحفظ الملفات وإدارة الوثائق ومعاينتها.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
import {redirect} from 'next/navigation';
import {initialized} from '../portal-access';
import AuthForm from '../auth-form';
export default async function Setup(){
 if(await initialized())redirect('/login');
 return <main className="auth-page"><section className="auth-card"><span className="eyebrow">إعداد لمرة واحدة</span><h1>إنشاء حساب المدير</h1><p>أدخل مفتاح الإعداد الخاص بالموقع واختر بيانات حساب المدير.</p><AuthForm setup/></section></main>;
}

import {redirect} from 'next/navigation';
import {getPortalAdmin,initialized} from '../portal-access';
import AuthForm from '../auth-form';
export default async function Login(){if(await getPortalAdmin())redirect('/admin');const ready=await initialized();return <main className="auth-page"><section className="auth-card"><span className="eyebrow">بوابة الملفات</span><h1>تسجيل الدخول</h1><p>ادخل بحسابك للوصول إلى لوحة التحكم.</p>{ready?<AuthForm/>:<div className="auth-setup"><p>يلزم إعداد حساب المدير أول مرة بواسطة صاحب الموقع.</p><a href="/setup" className="btn primary">إعداد حساب المدير</a></div>}</section></main>}

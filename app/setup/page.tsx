import {redirect,notFound} from 'next/navigation';
import {initialized,bootstrapOwner} from '../portal-access';
import {requireChatGPTUser} from '../chatgpt-auth';
import AuthForm from '../auth-form';
export default async function Setup(){if(await initialized())redirect('/login');await requireChatGPTUser('/setup');const owner=await bootstrapOwner();if(!owner)notFound();return <main className="auth-page"><section className="auth-card"><span className="eyebrow">إعداد لمرة واحدة</span><h1>إنشاء حساب المدير</h1><p>اختر بيانات دخول مستقلة. ستبقى ملفاتك وروابطها محفوظة.</p><AuthForm setup email={owner.email}/></section></main>}

'use client';
import {useEffect,useState} from 'react';
import {Check,Upload,ArrowRight,LoaderCircle} from 'lucide-react';
export type Brand={name:string;displayMode:string;hasLogo:boolean;version:string;documentId?:string};
export function logoUrl(brand:Brand){return `/api/branding?logo=1&v=${encodeURIComponent(brand.version)}${brand.documentId?'&document='+encodeURIComponent(brand.documentId):''}`}
const fallback:Brand={name:'بوابة الملفات',displayMode:'name',hasLogo:false,version:''};
function updateBrowserBrand(brand:Brand){
 document.title=brand.name;
 const href=brand.hasLogo?logoUrl(brand):'/favicon.svg';
 for(const rel of ['icon','shortcut icon','apple-touch-icon']){
  document.head.querySelectorAll(`link[rel="${rel}"]`).forEach(node=>node.remove());
  const link=document.createElement('link');link.rel=rel;link.href=href;document.head.appendChild(link);
 }
}
export function BrandMark({compact=false,brand}:{compact?:boolean;brand:Brand}){
 return <span className={`custom-brand ${compact?'compact':''}`}>
 {brand.displayMode!=='name'&&brand.hasLogo&&<img alt={brand.name} src={logoUrl(brand)}/>}
 {brand.displayMode!=='logo'&&<span>{brand.name}</span>}
 </span>;
}
export function useBrand(documentId?:string,initialBrand?:Brand){const [brand,setBrand]=useState<Brand>(initialBrand||fallback);useEffect(()=>{let active=true;const refresh=()=>fetch('/api/branding'+(documentId?'?document='+encodeURIComponent(documentId):''),{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d&&active){const next=d as Brand;setBrand(next);updateBrowserBrand(next)}}).catch(()=>{});refresh();window.addEventListener('focus',refresh);const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('portal-branding'):null;if(channel)channel.onmessage=refresh;return()=>{active=false;window.removeEventListener('focus',refresh);channel?.close()}},[documentId]);return brand}
export default function BrandingSettings(){
 const [brand,setBrand]=useState<Brand>(fallback),[name,setName]=useState('بوابة الملفات'),[mode,setMode]=useState('name'),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[remove,setRemove]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch('/api/branding').then(async r=>{if(!r.ok)throw new Error('يرجى تسجيل الدخول لعرض الإعدادات');const d=await r.json() as Brand;setBrand(d);setName(d.name);setMode(d.displayMode)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
 useEffect(()=>{if(!loading)updateBrowserBrand(brand)},[brand,loading]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setSaved(false);try{const form=new FormData();form.set('name',name);form.set('displayMode',mode);if(file)form.set('logo',file);if(remove)form.set('removeLogo','1');const r=await fetch('/api/branding',{method:'POST',body:form});const d:any=await r.json();if(!r.ok)throw new Error(d.error);const fresh=await fetch('/api/branding').then(r=>r.json()) as Brand;setBrand(fresh);if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('portal-branding');channel.postMessage('updated');channel.close()}setFile(null);setRemove(false);setSaved(true)}catch(e:any){setError(e.message||'تعذر حفظ الإعدادات')}finally{setBusy(false)}}
 const logo=preview||(!remove&&brand.hasLogo?logoUrl(brand):'');
 return <><header className="topbar"><a href="/admin" className="brand">إعدادات الهوية</a><a href="/admin" className="btn subtle"><ArrowRight size={17}/>العودة إلى لوحة التحكم</a></header><main className="branding-settings"><h1>الاسم والشعار</h1><p>تحكم بالهوية التي تظهر في أعلى صفحات الملفات.</p><form onSubmit={save}><section className="settings-card"><h2>هوية الموقع</h2><label>الاسم المعروض<input required maxLength={100} value={name} onChange={e=>{setName(e.target.value);setSaved(false)}}/></label><label>الشعار <small>PNG أو JPEG أو WebP، حتى 2 MB. يُفضّل شعار بخلفية شفافة.</small><span className="logo-upload"><Upload size={20}/><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>2*1048576){setError('الحد الأقصى للشعار 2 ميجابايت');return}setFile(f||null);setRemove(false);setSaved(false)}}/></span></label>{logo&&<div className="logo-preview"><img alt="معاينة الشعار" src={logo}/><button type="button" className="btn subtle" onClick={()=>{setFile(null);setRemove(true);setMode('name')}}>إزالة الشعار</button></div>}<fieldset><legend>طريقة الظهور</legend>{[['name','الاسم فقط'],['logo','الشعار فقط'],['both','الاسم والشعار']].map(([v,t])=><label className="mode-option" key={v}><input type="radio" name="displayMode" value={v} checked={mode===v} onChange={()=>{setMode(v);setSaved(false)}}/>{t}</label>)}</fieldset></section><section className="settings-card"><h2>معاينة الشريط العلوي لصفحة الملف</h2><div className="viewer-brand-preview"><span className="custom-brand compact">{mode!=='name'&&logo&&<img alt="" src={logo}/>} {mode!=='logo'&&<span>{name}</span>}</span></div><p>ارتفاع الشريط 27 بكسل عند تكبير المتصفح 100٪. لا تظهر فيه روابط الإدارة أو تسجيل الدخول والخروج.</p></section>{error&&<div className="error-banner" role="alert">{error}</div>}{saved&&<div className="saved-banner" role="status"><Check size={18}/>تم حفظ الاسم والشعار وطريقة العرض.</div>}<button className="btn primary" disabled={busy||loading}>{busy?<LoaderCircle className="spin" size={18}/>:<Check size={18}/>}حفظ الإعدادات</button></form></main></>;
}

'use client';
import {useEffect,useState} from 'react';
import {logoUrl,type Brand} from './branding';
export default function DocumentLoading({active,brand}:{active:boolean;brand:Brand}){
 const [visible,setVisible]=useState(active);
 useEffect(()=>{if(active){setVisible(true);return}const timer=setTimeout(()=>setVisible(false),180);return()=>clearTimeout(timer)},[active]);
 if(!visible)return null;
 return <div className={`document-loading-overlay ${active?'':'leaving'}`} role="status" aria-live="polite" aria-label="جارٍ تحميل الملف للعرض"><div className="document-loading-pulse" aria-hidden="true"/><div className="document-loading-emblem" aria-hidden="true">{brand.hasLogo?<img src={logoUrl(brand)} alt=""/>:<span>{brand.name}</span>}</div></div>;
}

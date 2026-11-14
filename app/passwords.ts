import {pbkdf2Sync} from 'node:crypto';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
const hex=(v:Uint8Array)=>Array.from(v,b=>b.toString(16).padStart(2,'0')).join('');
async function derive(password:string,salt:Uint8Array){try{return new Uint8Array(pbkdf2Sync(password,salt,600000,32,'sha256'))}catch{return pbkdf2Async(sha256,password,salt,{c:600000,dkLen:32})}}
export function validPassword(p:unknown):p is string{return typeof p==='string'&&p.length>=12&&p.length<=128}
export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));return 'pbkdf2-sha256$600000$'+hex(salt)+'$'+hex(await derive(password,salt))}
export async function verifyPassword(password:string,stored:string){const parts=stored.split('$');if(parts[0]!=='pbkdf2-sha256'||parts[1]!=='600000'||!/^[a-f0-9]{32}$/.test(parts[2]||'')||!/^[a-f0-9]{64}$/.test(parts[3]||''))return false;const salt=Uint8Array.from(parts[2].match(/../g)!,b=>parseInt(b,16));const actual=hex(await derive(password,salt));let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^parts[3].charCodeAt(i);return diff===0}

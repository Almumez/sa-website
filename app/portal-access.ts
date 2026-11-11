import {env} from 'cloudflare:workers';
import {notFound} from 'next/navigation';
import {getChatGPTUser,requireChatGPTUser} from './chatgpt-auth';
function isOwner(email:string){return !!env.SITE_OWNER_EMAIL&&email.trim().toLowerCase()===env.SITE_OWNER_EMAIL.trim().toLowerCase()}
export async function getPortalAdmin(){const user=await getChatGPTUser();return user&&isOwner(user.email)?user:null}
export async function requirePortalAdmin(returnTo:string){const user=await requireChatGPTUser(returnTo);if(!isOwner(user.email))notFound();return user}

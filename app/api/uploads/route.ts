import {getPortalAdmin} from '@/app/portal-access';
import {sameOrigin,authJSON} from '@/app/auth-utils';
import {createUpload} from '@/lib/server/uploads';
import {UploadError} from '@/app/uploaded-files';

export async function POST(request:Request) {
  const user=await getPortalAdmin();
  if (!user) return authJSON({error:'يرجى تسجيل الدخول'},401);
  if (!sameOrigin(request) || (!user.canAdd && !user.canEdit)) return authJSON({error:'طلب غير مسموح'},403);
  if (Number(request.headers.get('content-length'))>8192) return authJSON({error:'بيانات كبيرة جدًا'},413);
  try {
    const data:unknown=await request.json();
    if (!data || typeof data!=='object' || !('filename' in data) || !('size' in data) || !('sha256' in data)
      || typeof data.filename!=='string' || typeof data.size!=='number' || typeof data.sha256!=='string') return authJSON({error:'بيانات غير صالحة'},400);
    return authJSON(await createUpload(user.ownerId,data.filename,data.size,data.sha256));
  } catch(error) {
    if (error instanceof UploadError) return authJSON({error:error.message},error.status);
    if (error instanceof SyntaxError) return authJSON({error:'بيانات غير صالحة'},400);
    throw error;
  }
}

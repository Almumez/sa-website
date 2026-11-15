import 'server-only';
import {S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

let client: S3Client | undefined;
export function storageClient() {
  if (!client) {
    const {S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY} = process.env;
    if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('Missing S3 credentials. See DEPLOYMENT.md.');
    client = new S3Client({region:process.env.S3_REGION || 'auto', endpoint:S3_ENDPOINT || undefined,
      forcePathStyle:process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:{accessKeyId:S3_ACCESS_KEY_ID,secretAccessKey:S3_SECRET_ACCESS_KEY},
      requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
  }
  return client;
}
export function bucketName() {
  if (!process.env.S3_BUCKET) throw new Error('Missing S3_BUCKET. See DEPLOYMENT.md.');
  return process.env.S3_BUCKET;
}
function missing(error: unknown) {
  return (error as {$metadata?: {httpStatusCode?: number}})?.$metadata?.httpStatusCode === 404;
}
export const bucket = {
  async put(key: string, bytes: Uint8Array, options?: {httpMetadata?: {contentType?: string}}) {
    const value = await storageClient().send(new PutObjectCommand({Bucket:bucketName(),Key:key,Body:bytes,ContentType:options?.httpMetadata?.contentType}));
    return {httpEtag:value.ETag || ''};
  },
  async head(key: string) {
    try {
      const value = await storageClient().send(new HeadObjectCommand({Bucket:bucketName(),Key:key}));
      return {size:value.ContentLength || 0,httpEtag:value.ETag || ''};
    } catch (error) { if (missing(error)) return null; throw error; }
  },
  async get(key: string) {
    try {
      const value = await storageClient().send(new GetObjectCommand({Bucket:bucketName(),Key:key}));
      if (!value.Body) return null;
      return {body:value.Body.transformToWebStream(),size:value.ContentLength || 0,httpEtag:value.ETag || ''};
    } catch (error) { if (missing(error)) return null; throw error; }
  },
  async delete(key: string) { await storageClient().send(new DeleteObjectCommand({Bucket:bucketName(),Key:key})); },
};
export async function downloadURL(key: string, mime: string, disposition: string) {
  return getSignedUrl(storageClient(),new GetObjectCommand({Bucket:bucketName(),Key:key,
    ResponseContentType:mime,ResponseContentDisposition:disposition,ResponseCacheControl:'no-store'}),{expiresIn:300});
}

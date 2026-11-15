import type {z} from 'zod';
import type {portalSchema} from './json-store.mjs';
export type PortalData=z.infer<typeof portalSchema>;
export type DocumentRecord=PortalData['documents'][number];
export type AccountRecord=PortalData['portal_accounts'][number];
export type BrandingRecord=PortalData['branding'][number];

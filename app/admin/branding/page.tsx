import BrandingSettings from '../../branding';
import {requirePortalPermission} from '../../portal-access';
export default async function Page(){await requirePortalPermission('isOwner','/admin/branding');return <BrandingSettings/>}

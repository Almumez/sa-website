import {requirePortalPermission} from '../../portal-access';
import Users from '../../users';
export default async function Page(){await requirePortalPermission('isOwner','/admin/users');return <Users/>}

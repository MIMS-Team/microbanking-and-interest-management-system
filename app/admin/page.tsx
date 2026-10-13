import AdminPage from '../../src/app/admin/page';
import { RequireSession } from '../_components';

export default function AdminRoute() {
  return <RequireSession allowedRoles={['admin']}><AdminPage /></RequireSession>;
}

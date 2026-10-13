import BranchManagementPage from '../../src/app/branch-management/page';
import { RequireSession } from '../_components';

export default function BranchManagementRoute() {
  return <RequireSession allowedRoles={['manager']}><BranchManagementPage /></RequireSession>;
}

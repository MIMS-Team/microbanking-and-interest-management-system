import HigherManagementPage from '../../src/app/higher-management/page';
import { RequireSession } from '../_components';

export default function HigherManagementRoute() {
  return <RequireSession allowedRoles={['higher_manager']}><HigherManagementPage /></RequireSession>;
}

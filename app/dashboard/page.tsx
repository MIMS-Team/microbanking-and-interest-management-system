import { Suspense } from 'react';
import { RequireSession } from '../_components';
import { Workspace } from '@/components/workspace';
export default function DashboardPage() {
  return <Suspense fallback={<p>Loading workspace...</p>}><RequireSession><Workspace /></RequireSession></Suspense>;
}

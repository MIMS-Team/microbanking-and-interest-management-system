import { AuthFrame, LoginForm } from '../_components';
import { Suspense } from 'react';

export default function LoginPage() {
  return <AuthFrame label="Welcome back" title="Sign in to your workspace" description="Use your work credentials to access the areas assigned to your role."><Suspense fallback={<p>Loading sign-in details...</p>}><LoginForm /></Suspense></AuthFrame>;
}

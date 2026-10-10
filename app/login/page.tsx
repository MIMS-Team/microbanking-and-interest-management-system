import { AuthFrame, LoginForm } from '../_components';
import { Suspense } from 'react';

export default function LoginPage() {
  return <AuthFrame label="Welcome back" title="Sign in to your workspace" description="Use your work credentials to access the areas assigned to your role."><Suspense fallback={<p>Loading sign-in details...</p>}><LoginForm /></Suspense><p className="mt-8 text-center text-xs text-[#829ab1]">Need access? <a href="/passwordreset" className="font-bold text-[#b65f45]">Reset your password</a></p></AuthFrame>;
}

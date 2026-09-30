import { AuthFrame, LoginForm } from '../ravindu/_components';

export default function LoginPage() {
  return <AuthFrame label="Welcome back" title="Sign in to your workspace" description="Use your work credentials to access the areas assigned to your role."><LoginForm /><p className="mt-8 text-center text-xs text-[#829ab1]">Need access? <a href="/ravindu/password-reset" className="font-bold text-[#b65f45]">Reset your password</a></p></AuthFrame>;
}
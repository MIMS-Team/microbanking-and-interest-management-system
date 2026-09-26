import Link from 'next/link';
import { AuthFrame, OtpForm } from '../_components';

export default function RavinduOtpPage() { return <AuthFrame label="Step 2 of 2" title="Verify your identity" description="A second check keeps sensitive banking work in the right hands."><OtpForm /><p className="mt-8 text-center text-xs text-[#829ab1]"><Link href="/ravindu/login" className="font-bold text-[#b65f45]">Use a different account</Link></p></AuthFrame>; }
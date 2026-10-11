'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
export default function Onboarding(){
  const [error,setError]=useState(''),[done,setDone]=useState(false),[busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setError('');const values=new FormData(event.currentTarget);
    try{const token=new URLSearchParams(window.location.hash.slice(1)).get('token');const response=await fetch('/api/auth/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:values.get('password'),confirmPassword:values.get('confirmPassword')})}),body=await response.json();if(!response.ok)throw new Error(body.error);window.history.replaceState(null,'','/onboarding');setDone(true);}catch(reason){setError(reason instanceof Error?reason.message:'Unable to set password.');}finally{setBusy(false);}
  }
  return <main className="panel" style={{maxWidth:600,margin:'4rem auto',padding:32}}><h1>Set your personal employee password</h1>{done?<p>Password set. <Link href="/login">Sign in with your work email and OTP</Link>.</p>:<form onSubmit={submit}><p>Your personal invitation expires after 30 minutes and can be used once. Ask your administrator to resend if it has expired.</p>{error&&<p role="alert">{error}</p>}<fieldset disabled={busy}><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/></label><label>Repeat password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={128}/></label><p>Include uppercase, lowercase and a number.</p><button type="submit">{busy?'Setting password…':'Set personal password'}</button></fieldset></form>}</main>;
}

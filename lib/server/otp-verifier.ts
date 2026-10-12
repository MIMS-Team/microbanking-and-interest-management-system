import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashOtp(code:string):string {
  const salt=randomBytes(16).toString('hex');
  return 's1$'+salt+'$'+scryptSync(code.trim(),salt,32).toString('hex');
}
export function otpMatches(code:string,verifier:string):boolean {
  let actual:string;
  if(verifier.startsWith('s1$')) {
    const [,salt,digest]=verifier.split('$');
    if(!/^[a-f0-9]{32}$/.test(salt??'')||!/^[a-f0-9]{64}$/.test(digest??'')) return false;
    actual='s1$'+salt+'$'+scryptSync(code.trim(),salt,32).toString('hex');
  } else actual=createHash('sha256').update('mims_salt:'+code.trim()).digest('hex');
  return actual.length===verifier.length && timingSafeEqual(Buffer.from(actual),Buffer.from(verifier));
}

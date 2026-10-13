import Image from 'next/image';

/** One brand asset for navigation, authentication and the sign-in illustration. */
export function BankMark({ className = '' }: { className?: string }) {
  return <Image src="/btrust-logo.png" alt="" aria-hidden="true" width={40} height={40} sizes="40px" className={`bank-mark ${className}`} />;
}

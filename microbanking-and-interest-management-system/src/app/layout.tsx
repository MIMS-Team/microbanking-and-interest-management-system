import type { Metadata } from 'next';
import './globals.css';
import { BankProvider } from '@/context/BankContext';

export const metadata: Metadata = {
  title: 'B-Trust Bank - Microbanking and Interest Management System (MIMS)',
  description: 'Role-based interfaces for Branch Management, Higher Management, and System Administrator.',
};

/**
 * Root Layout wrapping the entire application in BankProvider.
 * Provides shared client-side hardcoded state conforming strictly to the final ERD.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <BankProvider>
          {children}
        </BankProvider>
      </body>
    </html>
  );
}

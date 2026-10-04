import type { Metadata } from 'next';
import './globals.css';
import { SessionProvider } from '@/context/SessionContext';

export const metadata: Metadata = {
  title: 'B-Trust Bank - Microbanking and Interest Management System',
  description: 'Enterprise Banking Operations and Management Portal',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}

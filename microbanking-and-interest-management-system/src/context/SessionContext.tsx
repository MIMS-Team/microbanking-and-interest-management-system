'use client';

import React, { createContext, useContext, useState } from 'react';
import { Employee, UserRole } from '@/types';
import { mockEmployees } from '@/data/mockData';
import { usePathname, useRouter } from 'next/navigation';

// Session state interface for logged-in user and active branch context
interface SessionContextType {
  currentUser: Employee;
  currentRole: UserRole;
  currentBranchId: string;
  setCurrentBranchId: (branchId: string) => void;
  updateUserPassword: (currentPass: string, newPass: string) => { success: boolean; message: string };
  logout: () => void;
}
const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentBranchId, setCurrentBranchId] = useState<string>('BR001');
  const currentRole: UserRole = pathname.startsWith('/admin')
    ? 'Admin'
    : pathname.startsWith('/higher-management')
      ? 'Higher Management'
      : 'Branch Manager';
  const currentUser =
    mockEmployees.find((employee) => employee.role === currentRole) ?? mockEmployees[0];

  const logout = () => {
    setCurrentBranchId('BR001');
    router.replace('/');
  };

  // Self-service password change handler
  const updateUserPassword = (currentPass: string, newPass: string) => {
    if (!currentPass || !newPass) {
      return { success: false, message: 'Both current and new passwords are required.' };
    }
    if (newPass.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    return { success: true, message: 'Password updated successfully.' };
  };

  return (
    <SessionContext.Provider
      value={{
        currentUser,
        currentRole,
        currentBranchId,
        setCurrentBranchId,
        updateUserPassword,
        logout,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// Custom hook to consume session state
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}



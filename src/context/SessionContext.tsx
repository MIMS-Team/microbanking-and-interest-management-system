'use client';

import React, { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { Employee, UserRole } from '@/types';
import { mockEmployees } from '@/data/mockData';
import { usePathname, useRouter } from 'next/navigation';

// Session state interface for logged-in user and active branch context
interface SessionContextType {
  currentUser: Employee;
  currentRole: UserRole;
  currentBranchId: string;
  setCurrentBranchId: (branchId: string) => void;
  logout: () => void;
}

interface StoredEmployeeSession {
  employeeId: number;
  branchId: number;
  name: string;
  email: string;
  roleId: string;
}

function subscribeToSession(onSessionChange: () => void): () => void {
  window.addEventListener('storage', onSessionChange);
  return () => window.removeEventListener('storage', onSessionChange);
}

function getSerializedSession(): string | null {
  return sessionStorage.getItem('btrust_session');
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentBranchId, setCurrentBranchId] = useState<string>('BR001');
  const serializedSession = useSyncExternalStore(
    subscribeToSession,
    getSerializedSession,
    () => null
  );
  const storedSession = useMemo<StoredEmployeeSession | null>(() => {
    if (!serializedSession) {
      return null;
    }

    try {
      const session: unknown = JSON.parse(serializedSession);
      if (
        typeof session !== 'object' ||
        session === null ||
        !('employeeId' in session) ||
        typeof session.employeeId !== 'number' ||
        !('branchId' in session) ||
        typeof session.branchId !== 'number' ||
        !('name' in session) ||
        typeof session.name !== 'string' ||
        !('email' in session) ||
        typeof session.email !== 'string' ||
        !('roleId' in session) ||
        typeof session.roleId !== 'string'
      ) {
        console.error('Stored employee session has an invalid shape.');
        return null;
      }

      return {
        employeeId: session.employeeId,
        branchId: session.branchId,
        name: session.name,
        email: session.email,
        roleId: session.roleId,
      };
    } catch (error) {
      console.error('Failed to read stored employee session:', error);
      return null;
    }
  }, [serializedSession]);

  const currentRole: UserRole = pathname.startsWith('/admin')
    ? 'Admin'
    : pathname.startsWith('/higher-management')
      ? 'Higher Management'
      : 'Branch Manager';
  const fallbackUser =
    mockEmployees.find((employee) => employee.role === currentRole) ?? mockEmployees[0];
  const currentUser: Employee = storedSession
    ? {
        ...fallbackUser,
        id: String(storedSession.employeeId),
        name: storedSession.name,
        email: storedSession.email,
        role: currentRole,
        branchId: String(storedSession.branchId),
      }
    : fallbackUser;

  const logout = () => {
    setCurrentBranchId('BR001');
    router.replace('/');
  };

  return (
    <SessionContext.Provider
      value={{
        currentUser,
        currentRole,
        currentBranchId,
        setCurrentBranchId,
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

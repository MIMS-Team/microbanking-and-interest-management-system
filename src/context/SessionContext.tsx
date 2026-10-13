'use client';

import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Employee, UserRole } from '@/types';
import { mockEmployees } from '@/data/mockData';
import { portalEmployees } from '@/data/portalEmployees';
import { usePathname, useRouter } from 'next/navigation';

// Session state interface for logged-in user and active branch context
interface SessionContextType {
  currentUser: Employee;
  currentRole: UserRole;
  currentBranchId: string;
  logout: () => void;
}

interface StoredEmployeeSession {
  employeeId: number;
  branchId: number;
  name: string;
  email: string;
  roleId: string;
}

interface AuthenticatedEmployeeSession {
  id: number;
  full_name: string;
  email: string;
  role: 'agent' | 'manager' | 'higher_manager' | 'admin';
  branch_id: number | null;
}

function subscribeToSession(onSessionChange: () => void): () => void {
  window.addEventListener('storage', onSessionChange);
  window.addEventListener('btrust-session-change', onSessionChange);
  return () => {
    window.removeEventListener('storage', onSessionChange);
    window.removeEventListener('btrust-session-change', onSessionChange);
  };
}

function getSerializedSession(): string | null {
  return JSON.stringify([
    sessionStorage.getItem('btrust_session'),
    localStorage.getItem('mims-user-session'),
  ]);
}

function isAuthenticatedEmployeeSession(value: unknown): value is AuthenticatedEmployeeSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    'full_name' in value &&
    typeof value.full_name === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'role' in value &&
    ['agent', 'manager', 'higher_manager', 'admin'].includes(String(value.role)) &&
    'branch_id' in value &&
    (value.branch_id === null ||
      (typeof value.branch_id === 'number' &&
        Number.isSafeInteger(value.branch_id) &&
        value.branch_id > 0))
  );
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const serializedSession = useSyncExternalStore(
    subscribeToSession,
    getSerializedSession,
    () => null
  );
  const { storedSession, authenticatedSession } = useMemo(() => {
    if (!serializedSession) {
      return { storedSession: null, authenticatedSession: null };
    }

    try {
      const snapshot: unknown = JSON.parse(serializedSession);
      if (
        !Array.isArray(snapshot) ||
        snapshot.length !== 2 ||
        (snapshot[0] !== null && typeof snapshot[0] !== 'string') ||
        (snapshot[1] !== null && typeof snapshot[1] !== 'string')
      ) {
        console.error('Stored employee sessions have an invalid format.');
        return { storedSession: null, authenticatedSession: null };
      }

      const legacyValue: unknown = snapshot[0] ? JSON.parse(snapshot[0]) : null;
      const authenticatedValue: unknown = snapshot[1] ? JSON.parse(snapshot[1]) : null;
      let storedSession: StoredEmployeeSession | null = null;
      let authenticatedSession: AuthenticatedEmployeeSession | null = null;

      if (
        typeof legacyValue === 'object' &&
        legacyValue !== null &&
        'employeeId' in legacyValue &&
        typeof legacyValue.employeeId === 'number' &&
        'branchId' in legacyValue &&
        typeof legacyValue.branchId === 'number' &&
        'name' in legacyValue &&
        typeof legacyValue.name === 'string' &&
        'email' in legacyValue &&
        typeof legacyValue.email === 'string' &&
        'roleId' in legacyValue &&
        typeof legacyValue.roleId === 'string'
      ) {
        storedSession = {
          employeeId: legacyValue.employeeId,
          branchId: legacyValue.branchId,
          name: legacyValue.name,
          email: legacyValue.email,
          roleId: legacyValue.roleId,
        };
      } else if (legacyValue !== null) {
        console.error('Stored employee session has an invalid shape.');
      }

      if (authenticatedValue !== null) {
        if (!isAuthenticatedEmployeeSession(authenticatedValue)) {
          console.error('Authenticated employee session has an invalid shape.');
        } else {
          authenticatedSession = authenticatedValue;
        }
      }

      return { storedSession, authenticatedSession };
    } catch (error) {
      console.error('Failed to read stored employee sessions:', error);
      return { storedSession: null, authenticatedSession: null };
    }
  }, [serializedSession]);

  const currentRole: UserRole = pathname.startsWith('/admin')
    ? 'Admin'
    : pathname.startsWith('/higher-management')
      ? 'Higher Management'
      : 'Branch Manager';
  const fallbackUser =
    mockEmployees.find((employee) => employee.role === currentRole) ?? mockEmployees[0];
  const expectedPortalEmployee =
    currentRole === 'Admin'
      ? portalEmployees.admin
      : currentRole === 'Higher Management'
        ? portalEmployees.higherManagement
        : portalEmployees.branchManagement;
  // A stored identity is valid only in the portal assigned to that employee and role.
  const activeSession = storedSession
    ? storedSession.employeeId === expectedPortalEmployee.employeeId &&
      storedSession.roleId === expectedPortalEmployee.roleId
      ? storedSession
      : expectedPortalEmployee
    : null;
  const currentUser: Employee = activeSession
    ? {
        ...fallbackUser,
        id: String(activeSession.employeeId),
        name: activeSession.name,
        email: activeSession.email,
        role: currentRole,
        branchId: String(activeSession.branchId),
      }
    : fallbackUser;
  const authenticatedRole: UserRole | null =
      authenticatedSession?.role === 'admin'
        ? 'Admin'
        : authenticatedSession?.role === 'higher_manager'
          ? 'Higher Management'
          : authenticatedSession?.role === 'manager'
            ? 'Branch Manager'
            : null;
  const sessionUser: Employee | null =
      authenticatedSession && authenticatedRole === currentRole
        ? {
            ...fallbackUser,
            id: String(authenticatedSession.id),
            name: authenticatedSession.full_name,
            email: authenticatedSession.email,
            role:
              authenticatedSession.role === 'admin'
                ? 'Admin'
                : authenticatedSession.role === 'higher_manager'
                  ? 'Higher Management'
                  : authenticatedSession.role === 'manager'
                    ? 'Branch Manager'
                    : 'Field Agent',
            branchId: authenticatedSession.branch_id === null ? '' : String(authenticatedSession.branch_id),
          }
        : null;
  const sessionCurrentUser = sessionUser ?? currentUser;
  useEffect(() => {
    if (
      !storedSession ||
      (storedSession.employeeId === expectedPortalEmployee.employeeId &&
      storedSession.roleId === expectedPortalEmployee.roleId
      )
    ) {
      return;
    }
    sessionStorage.setItem('btrust_session', JSON.stringify(expectedPortalEmployee));
    window.dispatchEvent(new Event('btrust-session-change'));
  }, [expectedPortalEmployee, storedSession]);

  const logout = () => {
    router.replace('/');
  };

  return (
    <SessionContext.Provider
      value={{
        currentUser: sessionCurrentUser,
        currentRole,
        currentBranchId: /^\d+$/.test(sessionCurrentUser.branchId)
          ? `BR${sessionCurrentUser.branchId.padStart(3, '0')}`
          : sessionCurrentUser.branchId,
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

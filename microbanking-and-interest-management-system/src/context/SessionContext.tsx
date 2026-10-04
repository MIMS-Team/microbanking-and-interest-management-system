'use client';

import React, { createContext, useContext, useState } from 'react';
import { Employee, UserRole } from '@/types';
import { mockEmployees } from '@/data/mockData';

// Session state interface for logged-in user and active branch context
interface SessionContextType {
  currentUser: Employee;
  currentRole: UserRole;
  currentBranchId: string;
  setCurrentBranchId: (branchId: string) => void;
  setCurrentRole: (role: UserRole) => void;
  notification: string | null;
  showNotification: (msg: string) => void;
  clearNotification: () => void;
  updateUserPassword: (currentPass: string, newPass: string) => { success: boolean; message: string };
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Currently authenticated user (default to Manager Nalin Perera)
  const [currentUser, setCurrentUser] = useState<Employee>(mockEmployees[0]);
  const [currentRole, setCurrentRoleState] = useState<UserRole>('Branch Manager');
  const [currentBranchId, setCurrentBranchId] = useState<string>('BR001');
  const [notification, setNotification] = useState<string | null>(null);

  // Switch active role and assign appropriate test user
  const setCurrentRole = (role: UserRole) => {
    setCurrentRoleState(role);
    if (role === 'Branch Manager') {
      setCurrentUser(mockEmployees[0]); // Nalin Perera
      setCurrentBranchId('BR001');
    } else if (role === 'Higher Management') {
      setCurrentUser(mockEmployees[2]); // Dr. Rohan Jayasuriya
    } else {
      setCurrentUser(mockEmployees[4]); // Dinesh Kumara (Admin)
    }
    showNotification(`Switched interface to ${role}`);
  };

  // Display auto-dismissing toast notification
  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((current) => (current === msg ? null : current));
    }, 4000);
  };

  const clearNotification = () => setNotification(null);

  // Self-service password change handler
  const updateUserPassword = (currentPass: string, newPass: string) => {
    if (!currentPass || !newPass) {
      return { success: false, message: 'Both current and new passwords are required.' };
    }
    if (newPass.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    showNotification('Password updated successfully.');
    return { success: true, message: 'Password updated successfully.' };
  };

  return (
    <SessionContext.Provider
      value={{
        currentUser,
        currentRole,
        currentBranchId,
        setCurrentBranchId,
        setCurrentRole,
        notification,
        showNotification,
        clearNotification,
        updateUserPassword,
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

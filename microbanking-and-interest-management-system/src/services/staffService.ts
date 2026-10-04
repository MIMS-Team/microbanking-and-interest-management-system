import { Employee, AuditLog, SecurityToken } from '@/types';
import { mockEmployees, mockAuditLogs, mockSecurityTokens } from '@/data/mockData';

// In-memory staff repository
let employeesState: Employee[] = [...mockEmployees];
let auditLogsState: AuditLog[] = [...mockAuditLogs];
let securityTokensState: SecurityToken[] = [...mockSecurityTokens];

// Valid authorization OTP tokens
const validOtpCodes = new Set(['849201', '731904', '123456']);

// Retrieve staff members, optionally filtered by role
export function getEmployees(roleCategory?: string): Employee[] {
  if (roleCategory && roleCategory !== 'All') {
    return employeesState.filter((e) => e.role === roleCategory);
  }
  return [...employeesState];
}

// Provision a new employee account with HRM OTP verification
export function createEmployeeWithOtp(
  data: Omit<Employee, 'id' | 'createdAt'>,
  otpCode: string
): { success: boolean; message: string; employee?: Employee } {
  if (!validOtpCodes.has(otpCode.trim())) {
    return {
      success: false,
      message: 'Invalid HRM Authorization OTP. Staff account creation denied.',
    };
  }

  const newEmployee: Employee = {
    ...data,
    id: `EMP${String(employeesState.length + 1).padStart(3, '0')}`,
    createdAt: new Date().toISOString().split('T')[0],
  };

  employeesState = [newEmployee, ...employeesState];

  // Log to audit trail
  const newAudit: AuditLog = {
    id: `AUD-${Math.floor(100 + Math.random() * 900)}`,
    userId: 'ADMIN',
    userName: 'System Administrator',
    userRole: 'Admin',
    action: `Provisioned ${newEmployee.role} account for ${newEmployee.name} via OTP ${otpCode}`,
    ipAddress: '192.168.1.104',
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
    status: 'Success',
  };
  auditLogsState = [newAudit, ...auditLogsState];

  return {
    success: true,
    message: `Account for ${newEmployee.name} (${newEmployee.role}) successfully created.`,
    employee: newEmployee,
  };
}

// Update employee credentials or assigned branch
export function updateEmployee(employee: Employee): { success: boolean; message: string } {
  employeesState = employeesState.map((e) => (e.id === employee.id ? employee : e));
  return { success: true, message: 'Employee profile updated successfully.' };
}

// Toggle staff account active/suspended status
export function toggleEmployeeStatus(employeeId: string): { success: boolean; newStatus: string } {
  let newStatus = 'Active';
  employeesState = employeesState.map((e) => {
    if (e.id === employeeId) {
      newStatus = e.status === 'Active' ? 'Suspended' : 'Active';
      return { ...e, status: newStatus as 'Active' | 'Suspended' };
    }
    return e;
  });
  return { success: true, newStatus };
}

// Reset and renew employee password with temporary credentials
export function renewEmployeePassword(employeeId: string): {
  success: boolean;
  temporaryPassword: string;
  message: string;
} {
  const emp = employeesState.find((e) => e.id === employeeId);
  const tempPass = `EMP-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    success: true,
    temporaryPassword: tempPass,
    message: `Temporary password generated and dispatched to ${emp?.email || 'registered email'}.`,
  };
}

// Retrieve security OTP tokens for HRM authorization hub
export function getSecurityTokens(): SecurityToken[] {
  return [...securityTokensState];
}

// Release or verify security token
export function releaseSecurityToken(tokenId: string): { success: boolean; message: string } {
  securityTokensState = securityTokensState.map((t) =>
    t.id === tokenId ? { ...t, status: 'Used' as const } : t
  );
  return { success: true, message: 'Security token released to Administrator.' };
}

// Retrieve audit logs
export function getAuditLogs(): AuditLog[] {
  return [...auditLogsState];
}

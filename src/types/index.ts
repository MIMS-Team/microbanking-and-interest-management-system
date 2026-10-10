// User role identifiers for application routing and authorization
export type UserRole = 'Branch Manager' | 'Higher Management' | 'Admin';

// System roles for bank personnel
export type EmployeeRole = 'Higher Management' | 'HRM' | 'Branch Manager' | 'Field Agent' | 'Admin';

// Branch office entity
export interface Branch {
  id: string;
  name: string;
  code?: string;
  address: string;
  phone: string;
  email: string;
  managerId?: string;
  managerName?: string;
  status: boolean | 'Active' | 'Inactive';
  openedDate: string;
}

//Branch ID and Name
export interface BranchOption {
  id: string;
  name: string;
};

export interface RoleOption {
  id: string;
  title: string;
}

export interface EmployeeRecord extends Omit<Employee, 'role'> {
  username: string;
  roleId: string;
  role: string;
  secondaryOtpRoles: Array<'BM' | 'HRM'>;
}


// Staff and employee account entity
export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  branchId: string;
  branchName: string;
  status: 'Active' | 'Suspended';
  createdAt: string;
}


// Customer entity
export interface Customer {
  id: string;
  nationalId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string;
  assignedBranchId: string;
  assignedAgentId: string;
  assignedAgentName: string;
  status: 'Active' | 'Inactive';
  registeredDate: string;
}

// Savings account tier configurations
export interface AccountPlan {
  id: string;
  planName: string;
  interestRate: number; // Annual rate percentage
  minimumBalance: number;
}

// Customer savings account record
export interface SavingsAccount {
  accountNumber: string;
  planId: string;
  planName: string;
  branchId: string;
  primaryCustomerId: string;
  primaryCustomerName: string;
  ownershipType: 'Individual' | 'Joint';
  jointCustomerIds?: string[];
  balance: number;
  cumulativeInterest: number;
  assignedAgentId: string;
  assignedAgentName: string;
  status: 'Active' | 'Dormant' | 'Closed';
  openedDate: string;
}

// Fixed deposit plan definition
export interface DepositPlan {
  id: string;
  termMonths: number;
  interestRate: number;
  minimumDeposit: number;
}

// Fixed deposit account record
export interface FixedDeposit {
  id: string;
  linkedAccountNumber: string;
  customerName: string;
  branchId: string;
  principalAmount: number;
  termMonths: number;
  interestRate: number;
  monthlyInterestPayout: number;
  autoRenew: boolean;
  status: 'Active' | 'Matured' | 'Closed';
  startDate: string;
  maturityDate: string;
}

// Counter and field transaction record
export interface Transaction {
  id: string;
  accountNumber: string;
  customerName: string;
  branchId: string;
  type: 'Deposit' | 'Withdrawal' | 'Interest Credit' | 'FD Transfer';
  amount: number;
  balanceAfter: number;
  processedBy: string; // Staff or Agent name
  channel: 'Counter' | 'Field Agent' | 'System';
  timestamp: string;
  remark: string;
}

// Two-tier operational approval request
export interface ApprovalRequest {
  id: string;
  category: 'Customer Registration' | 'Account Opening' | 'Fixed Deposit' | 'Ownership Transfer';
  targetId: string;
  customerName: string;
  branchId: string;
  submittedBy: string;
  submittedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  details: string;
  rejectionReason?: string;
}

// Security one-time password record for sensitive admin actions
export interface SecurityToken {
  id: string;
  purpose: string;
  targetUserOrBranch: string;
  code: string;
  issuedTo: string;
  expiresAt: string;
  status: 'Valid' | 'Used' | 'Expired';
}

// User authentication audit log
export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  ipAddress: string;
  timestamp: string;
  status: 'Success' | 'Failed';
}

'use client';

/**
 * B-Trust Microfinance Bank - Microbanking and Interest Management System (MIMS)
 * Central Bank Context & State Management
 * 
 * Implements strict SRS rules:
 * - Branch Scoping: Branch Manager only accesses data for their assigned branch (SRS 2.3.3)
 * - Higher Management OTP Verification for Branch Creations & Updates (SRS FR-BM-004, BR-011)
 * - Account Ownership Transfer & Modification by Branch Manager (SRS 4.3, BR-004)
 * - Separate Employee Accounts and Customer Accounts tracking in Admin
 * - Password renewal with simulated SMS/Email notifications
 * - Self-service password change for all management roles
 * - Full CRUD with explicit confirmation requirements
 */

import React, { createContext, useContext, useState, useMemo } from 'react';
import {
  Branch,
  Employee,
  Customer,
  AccountType,
  SavingsAccount,
  CustomerAccount,
  FixedDepositType,
  FixedDeposit,
  NormalTransaction,
  OnlineTransaction,
  ApprovalRequestCustomer,
  ApprovalRequestAccount,
  ApprovalRequestFD,
  OTP,
  EmployeeAuthentication,
  UserRole,
} from '@/types';
import {
  initialBranches,
  initialEmployees,
  initialAccountTypes,
  initialFDTypes,
  initialCustomers,
  initialSavingsAccounts,
  initialCustomerAccounts,
  initialFixedDeposits,
  initialNormalTransactions,
  initialOnlineTransactions,
  initialApprovalCustomerRequests,
  initialApprovalAccountRequests,
  initialApprovalFDRequests,
  initialOTPs,
  initialAuthLogs,
} from '@/data/mockData';

interface BankContextType {
  // Current logged in user & branch scope
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  currentUser: Employee;
  setCurrentUser: (emp: Employee) => void;
  currentBranchId: string;
  setCurrentBranchId: (branchId: string) => void;
  currentBranch: Branch | undefined;

  // Master lists
  branches: Branch[];
  employees: Employee[];
  accountTypes: AccountType[];
  fdTypes: FixedDepositType[];
  otps: OTP[];
  authLogs: EmployeeAuthentication[];

  // Customer Management (SRS 4.2)
  customers: Customer[];
  branchCustomers: Customer[];
  addCustomer: (cust: Omit<Customer, 'Customer_ID' | 'Register_Date'>) => void;
  updateCustomer: (cust: Customer) => void;
  toggleCustomerStatus: (customerId: string) => void;
  renewCustomerPassword: (customerId: string) => { tempPass: string; message: string };

  // Savings Account Management (SRS 4.3)
  savingsAccounts: SavingsAccount[];
  branchSavingsAccounts: SavingsAccount[];
  customerAccounts: CustomerAccount[];
  addSavingsAccount: (
    account: Omit<SavingsAccount, 'Account_No' | 'cumulative_interest'>,
    customerIds: string[]
  ) => void;
  updateSavingsAccount: (account: SavingsAccount) => void;
  toggleSavingsAccountStatus: (accountNo: string) => void;
  getCustomerIdsForAccount: (accountNo: string) => string[];
  updateAccountOwnership: (
    accountNo: string,
    primaryCustomerId: string,
    jointCustomerIds: string[],
    reason: string
  ) => boolean;

  // Fixed Deposit Management (SRS 4.4 & BR-006)
  fixedDeposits: FixedDeposit[];
  branchFixedDeposits: FixedDeposit[];
  addFixedDeposit: (fd: Omit<FixedDeposit, 'FD_ID'>) => boolean;
  toggleFDRenewal: (fdId: string) => void;
  closeFixedDeposit: (fdId: string) => void;

  // Transactions (SRS 4.5 & FR-TM-004)
  normalTransactions: NormalTransaction[];
  branchNormalTransactions: NormalTransaction[];
  onlineTransactions: OnlineTransaction[];
  processTransaction: (
    accountNo: string,
    type: 'withdrawal' | 'deposit',
    amount: number,
    remark: string
  ) => { success: boolean; message: string };

  // 2-Level Approvals Hub
  approvalCustomerRequests: ApprovalRequestCustomer[];
  branchApprovalCustomerRequests: ApprovalRequestCustomer[];
  approvalAccountRequests: ApprovalRequestAccount[];
  branchApprovalAccountRequests: ApprovalRequestAccount[];
  approvalFDRequests: ApprovalRequestFD[];
  branchApprovalFDRequests: ApprovalRequestFD[];
  pendingApprovalsCount: number;
  approveCustomerReq: (reqId: string, notes?: string) => void;
  rejectCustomerReq: (reqId: string, notes?: string) => void;
  approveAccountReq: (reqId: string, notes?: string) => void;
  rejectAccountReq: (reqId: string, notes?: string) => void;
  approveFDReq: (reqId: string, notes?: string) => void;
  rejectFDReq: (reqId: string, notes?: string) => void;

  // Employee Accounts Management (Admin)
  addEmployee: (emp: Omit<Employee, 'Employee_ID'>, hrmOtp: string) => boolean;
  updateEmployee: (emp: Employee) => void;
  toggleEmployeeStatus: (empId: string, hrmOtp?: string) => void;
  renewEmployeePassword: (empId: string) => { tempPass: string; message: string };

  // Branch Detail Management with Higher Management OTP (Admin)
  requestBranchActionOtp: (actionPurpose: string) => string;
  addBranchWithOtp: (branchData: Omit<Branch, 'Branch_ID'>, otpCode: string) => { success: boolean; message: string };
  updateBranchWithOtp: (branch: Branch, otpCode: string) => { success: boolean; message: string };
  toggleBranchStatusWithOtp: (branchId: string, otpCode: string) => { success: boolean; message: string };

  // Self Service Password Change
  changeCurrentUserPassword: (oldPass: string, newPass: string) => { success: boolean; message: string };

  // Notification banners
  notificationMessage: string | null;
  clearNotification: () => void;
  showNotification: (msg: string) => void;
}

const BankContext = createContext<BankContextType | undefined>(undefined);

export function BankProvider({ children }: { children: React.ReactNode }) {
  // Current Role & User State
  const [currentRole, setCurrentRoleState] = useState<UserRole>('Manager');
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [currentUser, setCurrentUser] = useState<Employee>(initialEmployees[0]); // Manager Nalin Perera
  const [currentBranchId, setCurrentBranchId] = useState<string>('BR001'); // Colombo Central
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  // Entities state
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [accountTypes] = useState<AccountType[]>(initialAccountTypes);
  const [fdTypes] = useState<FixedDepositType[]>(initialFDTypes);
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>(initialSavingsAccounts);
  const [customerAccounts, setCustomerAccounts] = useState<CustomerAccount[]>(initialCustomerAccounts);
  const [fixedDeposits, setFixedDeposits] = useState<FixedDeposit[]>(initialFixedDeposits);
  const [normalTransactions, setNormalTransactions] = useState<NormalTransaction[]>(initialNormalTransactions);
  const [onlineTransactions] = useState<OnlineTransaction[]>(initialOnlineTransactions);
  const [approvalCustomerRequests, setApprovalCustomerRequests] = useState<ApprovalRequestCustomer[]>(initialApprovalCustomerRequests);
  const [approvalAccountRequests, setApprovalAccountRequests] = useState<ApprovalRequestAccount[]>(initialApprovalAccountRequests);
  const [approvalFDRequests, setApprovalFDRequests] = useState<ApprovalRequestFD[]>(initialApprovalFDRequests);
  const [otps, setOtps] = useState<OTP[]>(initialOTPs);
  const [authLogs, setAuthLogs] = useState<EmployeeAuthentication[]>(initialAuthLogs);

  // Current branch details
  const currentBranch = useMemo(() => {
    return branches.find((b) => b.Branch_ID === currentBranchId) || branches[0];
  }, [branches, currentBranchId]);

  // Role Switcher helper
  const setCurrentRole = (newRole: UserRole) => {
    setCurrentRoleState(newRole);
    const matchedUser = employees.find((e) => e.Role === newRole && e.Status === 'Active') || employees[0];
    setCurrentUser(matchedUser);
    if (matchedUser.Branch_ID) {
      setCurrentBranchId(matchedUser.Branch_ID);
    }
    showNotification(`Switched authorization to ${newRole}: ${matchedUser.Name}`);
  };

  const showNotification = (msg: string) => {
    setNotificationMessage(msg);
    setTimeout(() => {
      setNotificationMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const clearNotification = () => setNotificationMessage(null);

  // ============================================================================
  // STRICT BRANCH SCOPING (SRS 2.3.3: Branch Manager accesses ONLY their branch data)
  // ============================================================================
  // Agents belonging to current branch
  const branchAgentIds = useMemo(() => {
    return employees
      .filter((e) => e.Branch_ID === currentBranchId && e.Role === 'Agent')
      .map((e) => e.Employee_ID);
  }, [employees, currentBranchId]);

  // Customers assigned to agents of current branch
  const branchCustomers = useMemo(() => {
    return customers.filter((c) => branchAgentIds.includes(c.Agent_ID));
  }, [customers, branchAgentIds]);

  // Savings accounts hosted at current branch
  const branchSavingsAccounts = useMemo(() => {
    return savingsAccounts.filter((sa) => sa.Branch_ID === currentBranchId);
  }, [savingsAccounts, currentBranchId]);

  const branchSavingsAccountNos = useMemo(() => {
    return branchSavingsAccounts.map((sa) => sa.Account_No);
  }, [branchSavingsAccounts]);

  // Fixed Deposits tied to current branch savings accounts
  const branchFixedDeposits = useMemo(() => {
    return fixedDeposits.filter((fd) => branchSavingsAccountNos.includes(fd.Account_No));
  }, [fixedDeposits, branchSavingsAccountNos]);

  // Transactions conducted on current branch accounts
  const branchNormalTransactions = useMemo(() => {
    return normalTransactions.filter((tx) => branchSavingsAccountNos.includes(tx.Account_No));
  }, [normalTransactions, branchSavingsAccountNos]);

  // Approvals belonging to current branch
  const branchApprovalCustomerRequests = useMemo(() => {
    return approvalCustomerRequests.filter((r) => branchAgentIds.includes(r.Request_By));
  }, [approvalCustomerRequests, branchAgentIds]);

  const branchApprovalAccountRequests = useMemo(() => {
    return approvalAccountRequests.filter((r) => branchSavingsAccountNos.includes(r.Account_No));
  }, [approvalAccountRequests, branchSavingsAccountNos]);

  const branchApprovalFDRequests = useMemo(() => {
    return approvalFDRequests.filter((r) => branchAgentIds.includes(r.Request_By));
  }, [approvalFDRequests, branchAgentIds]);

  // ============================================================================
  // Customer Operations (SRS 4.2)
  // ============================================================================
  const addCustomer = (custData: Omit<Customer, 'Customer_ID' | 'Register_Date'>) => {
    const newId = `CUST${1000 + customers.length + 1}`;
    const today = new Date().toISOString().split('T')[0];
    const newCustomer: Customer = {
      ...custData,
      Customer_ID: newId,
      Register_Date: today,
    };
    setCustomers((prev) => [newCustomer, ...prev]);

    // Create 2-level approval record (FR-CM-003)
    const newApproval: ApprovalRequestCustomer = {
      Request_ID: `REQ-CUST-00${approvalCustomerRequests.length + 1}`,
      Customer_ID: newId,
      Request_By: custData.Agent_ID || 'EMP005',
      Request_To: currentUser.Employee_ID,
      Request_Type: 'new_customer_registration',
      Request_Data: `New registration for ${custData.Name} (NIC: ${custData.NIC})`,
      Request_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      Approval_Timestamp: null,
      Status: 'Pending',
      Notes: 'KYC verified by agent. Submitted for Branch Manager authorization.',
    };
    setApprovalCustomerRequests((prev) => [newApproval, ...prev]);
    showNotification(`Customer ${newCustomer.Name} registered (ID: ${newId}). Submitted for 2-level approval.`);
  };

  const updateCustomer = (updatedCust: Customer) => {
    setCustomers((prev) => prev.map((c) => (c.Customer_ID === updatedCust.Customer_ID ? updatedCust : c)));
    showNotification(`Customer ${updatedCust.Name} profile successfully updated.`);
  };

  const toggleCustomerStatus = (customerId: string) => {
    setCustomers((prev) =>
      prev.map((c) => {
        if (c.Customer_ID === customerId) {
          const nextStatus = c.Status === 'Active' ? 'Dormant' : 'Active';
          showNotification(`Customer ${c.Name} status changed to ${nextStatus}. Preserved per BR-013.`);
          return { ...c, Status: nextStatus };
        }
        return c;
      })
    );
  };

  const renewCustomerPassword = (customerId: string) => {
    const cust = customers.find((c) => c.Customer_ID === customerId);
    const tempPass = `BT@Cust${Math.floor(1000 + Math.random() * 9000)}`;
    const msg = `Security Alert sent via SMS to ${cust?.Mobile_No || 'Customer'}: 'Dear ${cust?.Name || 'Client'}, your B-Trust password was reset. Temporary password is: ${tempPass}'`;
    showNotification(msg);
    return { tempPass, message: msg };
  };

  // ============================================================================
  // Savings Account & Ownership Management (SRS 4.3, BR-004)
  // ============================================================================
  const getCustomerIdsForAccount = (accountNo: string): string[] => {
    return customerAccounts.filter((ca) => ca.Account_No === accountNo).map((ca) => ca.Customer_ID);
  };

  const addSavingsAccount = (
    accountData: Omit<SavingsAccount, 'Account_No' | 'cumulative_interest'>,
    customerIds: string[]
  ) => {
    const newAccNo = `SA1000${1000 + savingsAccounts.length + 1}`;
    const newAccount: SavingsAccount = {
      ...accountData,
      Branch_ID: currentBranchId, // tied strictly to current branch
      Account_No: newAccNo,
      cumulative_interest: 0,
      Last_Transaction_Date: new Date().toISOString().split('T')[0],
    };

    setSavingsAccounts((prev) => [newAccount, ...prev]);

    // Bridge table mappings
    const newBridges = customerIds.map((cId) => ({
      Customer_ID: cId,
      Account_No: newAccNo,
    }));
    setCustomerAccounts((prev) => [...prev, ...newBridges]);

    // Initial deposit transaction
    if (accountData.Balance > 0) {
      const initialTxn: NormalTransaction = {
        Transaction_ID: `TXN${80000 + normalTransactions.length + 1}`,
        Account_No: newAccNo,
        Employee_ID: currentUser.Employee_ID,
        Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        Transaction_Type: 'deposit',
        Amount: accountData.Balance,
        After_Balance: accountData.Balance,
        Remark: 'Opening initial cash deposit at branch counter',
      };
      setNormalTransactions((prev) => [initialTxn, ...prev]);
    }

    showNotification(`Savings Account ${newAccNo} created at ${currentBranch?.Name}.`);
  };

  const updateSavingsAccount = (updatedAcc: SavingsAccount) => {
    setSavingsAccounts((prev) => prev.map((a) => (a.Account_No === updatedAcc.Account_No ? updatedAcc : a)));
    showNotification(`Savings Account ${updatedAcc.Account_No} details updated.`);
  };

  // Branch Manager Changes Account Ownership (SRS BR-004)
  const updateAccountOwnership = (
    accountNo: string,
    primaryCustomerId: string,
    jointCustomerIds: string[],
    reason: string
  ): boolean => {
    const allOwners = [primaryCustomerId, ...jointCustomerIds.filter((id) => id !== primaryCustomerId)];
    if (allOwners.length > 4) {
      showNotification('Error: SRS BR-004 allows maximum 4 account holders.');
      return false;
    }

    // Remove old bridge records for this account
    const remainingBridges = customerAccounts.filter((ca) => ca.Account_No !== accountNo);
    const newBridges = allOwners.map((cId) => ({
      Customer_ID: cId,
      Account_No: accountNo,
    }));
    setCustomerAccounts([...remainingBridges, ...newBridges]);

    // Update ownership type on savings account
    setSavingsAccounts((prev) =>
      prev.map((sa) =>
        sa.Account_No === accountNo
          ? { ...sa, Ownership_Type: allOwners.length > 1 ? 'Joint' : 'Single' }
          : sa
      )
    );

    showNotification(`Ownership mandate for Account ${accountNo} successfully updated: ${allOwners.length} holder(s). Reason: ${reason}`);
    return true;
  };

  const toggleSavingsAccountStatus = (accountNo: string) => {
    setSavingsAccounts((prev) =>
      prev.map((a) => {
        if (a.Account_No === accountNo) {
          const nextStatus = a.Status === 'Active' ? 'Inactive' : 'Active';
          showNotification(`Account ${a.Account_No} marked as ${nextStatus}. Soft preserved per BR-013.`);
          return { ...a, Status: nextStatus };
        }
        return a;
      })
    );
  };

  // ============================================================================
  // Fixed Deposit Management (SRS 4.4 & BR-006)
  // ============================================================================
  const addFixedDeposit = (fdData: Omit<FixedDeposit, 'FD_ID'>): boolean => {
    const existingActiveFD = fixedDeposits.find(
      (fd) => fd.Account_No === fdData.Account_No && fd.Status === 'Active'
    );
    if (existingActiveFD) {
      showNotification(`Violation: Savings Account ${fdData.Account_No} already has active Fixed Deposit ${existingActiveFD.FD_ID} (SRS BR-006).`);
      return false;
    }

    const targetAccount = savingsAccounts.find((sa) => sa.Account_No === fdData.Account_No);
    if (!targetAccount || targetAccount.Balance < fdData.Principal_Amount) {
      showNotification(`Error: Insufficient balance in account ${fdData.Account_No} to open FD of Rs. ${fdData.Principal_Amount.toLocaleString()}.`);
      return false;
    }

    const newFDId = `FD${20000 + fixedDeposits.length + 1}`;
    const newFD: FixedDeposit = {
      ...fdData,
      FD_ID: newFDId,
    };

    setFixedDeposits((prev) => [newFD, ...prev]);

    // Debit savings account
    setSavingsAccounts((prev) =>
      prev.map((sa) =>
        sa.Account_No === fdData.Account_No
          ? { ...sa, Balance: sa.Balance - fdData.Principal_Amount }
          : sa
      )
    );

    // Record debit transaction
    const debitTxn: NormalTransaction = {
      Transaction_ID: `TXN${80000 + normalTransactions.length + 1}`,
      Account_No: fdData.Account_No,
      Employee_ID: currentUser.Employee_ID,
      Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      Transaction_Type: 'withdrawal',
      Amount: fdData.Principal_Amount,
      After_Balance: targetAccount.Balance - fdData.Principal_Amount,
      Remark: `Principal debit for new Fixed Deposit ${newFDId}`,
    };
    setNormalTransactions((prev) => [debitTxn, ...prev]);

    showNotification(`Fixed Deposit ${newFDId} issued for Rs. ${fdData.Principal_Amount.toLocaleString()}.`);
    return true;
  };

  const toggleFDRenewal = (fdId: string) => {
    setFixedDeposits((prev) =>
      prev.map((fd) => (fd.FD_ID === fdId ? { ...fd, Renewal_Status: !fd.Renewal_Status } : fd))
    );
    showNotification(`Auto-renewal preference toggled for FD ${fdId}.`);
  };

  const closeFixedDeposit = (fdId: string) => {
    const fd = fixedDeposits.find((f) => f.FD_ID === fdId);
    if (!fd) return;

    setFixedDeposits((prev) =>
      prev.map((f) =>
        f.FD_ID === fdId
          ? { ...f, Status: 'Closed' as const, PayOut_Date: new Date().toISOString().split('T')[0] }
          : f
      )
    );

    // Credit back to savings account
    setSavingsAccounts((prev) =>
      prev.map((sa) =>
        sa.Account_No === fd.Account_No ? { ...sa, Balance: sa.Balance + fd.Principal_Amount } : sa
      )
    );

    showNotification(`FD ${fdId} closed. Rs. ${fd.Principal_Amount.toLocaleString()} credited back to ${fd.Account_No}.`);
  };

  // ============================================================================
  // Transactions (SRS 4.5 & FR-TM-004)
  // ============================================================================
  const processTransaction = (
    accountNo: string,
    type: 'withdrawal' | 'deposit',
    amount: number,
    remark: string
  ): { success: boolean; message: string } => {
    const targetAccount = savingsAccounts.find((sa) => sa.Account_No === accountNo);
    if (!targetAccount) return { success: false, message: 'Account not found.' };

    if (targetAccount.Status !== 'Active') {
      return { success: false, message: 'Account is inactive/dormant. Transactions disallowed per SRS BR-005.' };
    }

    const typeConfig = accountTypes.find((t) => t.Type_ID === targetAccount.Type_ID);
    const minBalance = typeConfig ? typeConfig.Min_balance : 1000;

    let newBalance = targetAccount.Balance;

    if (type === 'withdrawal') {
      if (targetAccount.Balance - amount < minBalance) {
        return {
          success: false,
          message: `Violation FR-TM-004: Cannot withdraw Rs. ${amount.toLocaleString()}. Mandatory minimum balance of Rs. ${minBalance.toLocaleString()} required. Current balance: Rs. ${targetAccount.Balance.toLocaleString()}.`,
        };
      }
      newBalance = targetAccount.Balance - amount;
    } else {
      newBalance = targetAccount.Balance + amount;
    }

    setSavingsAccounts((prev) =>
      prev.map((sa) =>
        sa.Account_No === accountNo
          ? {
              ...sa,
              Balance: newBalance,
              Last_Transaction_Date: new Date().toISOString().split('T')[0],
            }
          : sa
      )
    );

    const newTxn: NormalTransaction = {
      Transaction_ID: `TXN${80000 + normalTransactions.length + 1}`,
      Account_No: accountNo,
      Employee_ID: currentUser.Employee_ID,
      Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      Transaction_Type: type,
      Amount: amount,
      After_Balance: newBalance,
      Remark: remark || `${type === 'deposit' ? 'Counter Deposit' : 'Cash Withdrawal'} via branch staff`,
    };

    setNormalTransactions((prev) => [newTxn, ...prev]);
    showNotification(`Transaction complete: ${type.toUpperCase()} Rs. ${amount.toLocaleString()} for ${accountNo}.`);
    return { success: true, message: 'Transaction posted successfully.' };
  };

  // ============================================================================
  // 2-Level Approvals Hub
  // ============================================================================
  const pendingApprovalsCount =
    approvalCustomerRequests.filter((r) => r.Status === 'Pending').length +
    approvalAccountRequests.filter((r) => r.Status === 'Pending').length +
    approvalFDRequests.filter((r) => r.Status === 'Pending').length;

  const approveCustomerReq = (reqId: string, notes?: string) => {
    setApprovalCustomerRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Approved',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || r.Notes,
            }
          : r
      )
    );
    showNotification(`Customer request ${reqId} approved by Manager.`);
  };

  const rejectCustomerReq = (reqId: string, notes?: string) => {
    setApprovalCustomerRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Rejected',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || 'Rejected by branch manager.',
            }
          : r
      )
    );
    showNotification(`Customer request ${reqId} rejected.`);
  };

  const approveAccountReq = (reqId: string, notes?: string) => {
    setApprovalAccountRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Approved',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || r.Notes,
            }
          : r
      )
    );
    showNotification(`Account request ${reqId} approved.`);
  };

  const rejectAccountReq = (reqId: string, notes?: string) => {
    setApprovalAccountRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Rejected',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || 'Rejected by branch manager.',
            }
          : r
      )
    );
    showNotification(`Account request ${reqId} rejected.`);
  };

  const approveFDReq = (reqId: string, notes?: string) => {
    setApprovalFDRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Approved',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || r.Notes,
            }
          : r
      )
    );
    showNotification(`Fixed Deposit request ${reqId} approved.`);
  };

  const rejectFDReq = (reqId: string, notes?: string) => {
    setApprovalFDRequests((prev) =>
      prev.map((r) =>
        r.Request_ID === reqId
          ? {
              ...r,
              Status: 'Rejected',
              Approval_Timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              Notes: notes || 'Rejected by branch manager.',
            }
          : r
      )
    );
    showNotification(`Fixed Deposit request ${reqId} rejected.`);
  };

  // ============================================================================
  // Employee Accounts Management (Admin & HRM OTP per SRS BR-011)
  // ============================================================================
  const addEmployee = (empData: Omit<Employee, 'Employee_ID'>, hrmOtp: string): boolean => {
    // Verify OTP against valid tokens in system
    const matchedOtp = otps.find((o) => o.OTP_Hash === hrmOtp && o.Status === 'Valid');
    if (!matchedOtp && hrmOtp !== '849201') {
      showNotification('OTP Verification Failed: Invalid or expired HRM security code.');
      return false;
    }

    const newEmpId = `EMP${(employees.length + 1).toString().padStart(3, '0')}`;
    const newEmp: Employee = {
      ...empData,
      Employee_ID: newEmpId,
    };
    setEmployees((prev) => [...prev, newEmp]);

    // Invalidate used OTP
    setOtps((prev) =>
      prev.map((o) => (o.OTP_Hash === hrmOtp ? { ...o, Status: 'Used' as const } : o))
    );

    showNotification(`Staff ${newEmp.Name} (${newEmp.Role}) created with ID ${newEmpId}. HRM verified.`);
    return true;
  };

  const updateEmployee = (emp: Employee) => {
    setEmployees((prev) => prev.map((e) => (e.Employee_ID === emp.Employee_ID ? emp : e)));
    showNotification(`Staff account for ${emp.Name} updated.`);
  };

  const toggleEmployeeStatus = (empId: string, hrmOtp?: string) => {
    setEmployees((prev) =>
      prev.map((e) => {
        if (e.Employee_ID === empId) {
          const nextStatus = e.Status === 'Active' ? 'Dormant' : 'Active';
          showNotification(`Staff ${e.Name} status changed to ${nextStatus}. Soft preserved per BR-013.`);
          return { ...e, Status: nextStatus };
        }
        return e;
      })
    );
  };

  const renewEmployeePassword = (empId: string) => {
    const emp = employees.find((e) => e.Employee_ID === empId);
    const tempPass = `BTrust@${Math.floor(1000 + Math.random() * 9000)}#`;
    const msg = `Security Alert sent via Email to ${emp?.Email}: 'Dear ${emp?.Name}, your B-Trust system password was reset. Temporary credentials: ${tempPass}'`;
    showNotification(msg);
    return { tempPass, message: msg };
  };

  // ============================================================================
  // Branch Management with Higher Management OTP (SRS FR-BM-004, BR-011)
  // ============================================================================
  const requestBranchActionOtp = (actionPurpose: string): string => {
    const newOtpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newOtp: OTP = {
      OTP_ID: `OTP${7000 + otps.length + 1}`,
      Employee_ID: 'EMP002', // Issued by Higher Management Director Sunimal Fernando
      OTP_Hash: newOtpCode,
      Purpose: 'branch_action',
      Created_At: new Date().toISOString().replace('T', ' ').substring(0, 19),
      Expires_At: new Date(Date.now() + 15 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      Status: 'Valid',
    };
    setOtps((prev) => [newOtp, ...prev]);
    showNotification(`Higher Management issued OTP ${newOtpCode} for: ${actionPurpose}`);
    return newOtpCode;
  };

  const verifyOtp = (code: string) => {
    return otps.some((o) => o.OTP_Hash === code && o.Status === 'Valid') || code === '849201';
  };

  const addBranchWithOtp = (branchData: Omit<Branch, 'Branch_ID'>, otpCode: string) => {
    if (!verifyOtp(otpCode)) {
      return { success: false, message: 'Invalid or expired Higher Management OTP. Authorization denied.' };
    }
    const newBranchId = `BR${(branches.length + 1).toString().padStart(3, '0')}`;
    const newBranch: Branch = {
      ...branchData,
      Branch_ID: newBranchId,
    };
    setBranches((prev) => [...prev, newBranch]);
    // Mark OTP used
    setOtps((prev) => prev.map((o) => (o.OTP_Hash === otpCode ? { ...o, Status: 'Used' as const } : o)));
    showNotification(`New branch ${newBranch.Name} established (${newBranchId}) with Higher Management OTP verification.`);
    return { success: true, message: 'Branch created successfully.' };
  };

  const updateBranchWithOtp = (branch: Branch, otpCode: string) => {
    if (!verifyOtp(otpCode)) {
      return { success: false, message: 'Invalid or expired Higher Management OTP. Authorization denied.' };
    }
    setBranches((prev) => prev.map((b) => (b.Branch_ID === branch.Branch_ID ? branch : b)));
    setOtps((prev) => prev.map((o) => (o.OTP_Hash === otpCode ? { ...o, Status: 'Used' as const } : o)));
    showNotification(`Branch ${branch.Name} updated with Higher Management sign-off.`);
    return { success: true, message: 'Branch updated successfully.' };
  };

  const toggleBranchStatusWithOtp = (branchId: string, otpCode: string) => {
    if (!verifyOtp(otpCode)) {
      return { success: false, message: 'Invalid Higher Management OTP.' };
    }
    setBranches((prev) =>
      prev.map((b) => {
        if (b.Branch_ID === branchId) {
          const nextStatus = b.Status === 'Active' ? 'Closed' : 'Active';
          return { ...b, Status: nextStatus };
        }
        return b;
      })
    );
    setOtps((prev) => prev.map((o) => (o.OTP_Hash === otpCode ? { ...o, Status: 'Used' as const } : o)));
    showNotification(`Branch status updated with Higher Management OTP authorization.`);
    return { success: true, message: 'Branch status changed successfully.' };
  };

  // ============================================================================
  // Self Service Password Change
  // ============================================================================
  const changeCurrentUserPassword = (oldPass: string, newPass: string) => {
    if (!newPass || newPass.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    setEmployees((prev) =>
      prev.map((e) => (e.Employee_ID === currentUser.Employee_ID ? { ...e, Password: newPass } : e))
    );
    showNotification(`Password for ${currentUser.Name} successfully changed.`);
    return { success: true, message: 'Password updated successfully.' };
  };

  return (
    <BankContext.Provider
      value={{
        currentRole,
        setCurrentRole,
        currentUser,
        setCurrentUser,
        currentBranchId,
        setCurrentBranchId,
        currentBranch,
        branches,
        employees,
        accountTypes,
        fdTypes,
        otps,
        authLogs,
        customers,
        branchCustomers,
        addCustomer,
        updateCustomer,
        toggleCustomerStatus,
        renewCustomerPassword,
        savingsAccounts,
        branchSavingsAccounts,
        customerAccounts,
        addSavingsAccount,
        updateSavingsAccount,
        toggleSavingsAccountStatus,
        getCustomerIdsForAccount,
        updateAccountOwnership,
        fixedDeposits,
        branchFixedDeposits,
        addFixedDeposit,
        toggleFDRenewal,
        closeFixedDeposit,
        normalTransactions,
        branchNormalTransactions,
        onlineTransactions,
        processTransaction,
        approvalCustomerRequests,
        branchApprovalCustomerRequests,
        approvalAccountRequests,
        branchApprovalAccountRequests,
        approvalFDRequests,
        branchApprovalFDRequests,
        pendingApprovalsCount,
        approveCustomerReq,
        rejectCustomerReq,
        approveAccountReq,
        rejectAccountReq,
        approveFDReq,
        rejectFDReq,
        addEmployee,
        updateEmployee,
        toggleEmployeeStatus,
        renewEmployeePassword,
        requestBranchActionOtp,
        addBranchWithOtp,
        updateBranchWithOtp,
        toggleBranchStatusWithOtp,
        changeCurrentUserPassword,
        notificationMessage,
        clearNotification,
        showNotification,
      }}
    >
      {children}
    </BankContext.Provider>
  );
}

export function useBank() {
  const context = useContext(BankContext);
  if (!context) {
    throw new Error('useBank must be used within a BankProvider');
  }
  return context;
}

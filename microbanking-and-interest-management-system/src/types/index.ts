/**
 * B-Trust Microfinance Bank - Microbanking and Interest Management System (MIMS)
 * TypeScript type definitions strictly adhering to the Final Database ERD schema.
 * All entities correspond directly to ERD tables:
 * - Customer & Customer Authentication
 * - Employee & Employee Authentication & OTP
 * - Branch
 * - Account Type & Savings Account & Customer Account
 * - Fixed Deposit Type & Fixed Deposit
 * - Normal Transaction & Online Transaction
 * - Approval Requests (Customer, Account, Fixed Deposit)
 */

// ============================================================================
// 1. User & Role Types (System Access Levels)
// ============================================================================

export type UserRole = 'Manager' | 'Higher Management' | 'Admin' | 'Agent';

export type RecordStatus = 'Active' | 'Dormant' | 'Closed' | 'Inactive';

export type SessionStatus = 'Active' | 'Invalid' | 'Logged_out' | 'Expired' | 'Terminated';

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected' | 'Expired';

export type TransactionType = 'withdrawal' | 'deposit' | 'saving_interest' | 'FD_interest';

// ============================================================================
// 2. ERD Tables: Employee & Authentication
// ============================================================================

/**
 * Employee entity representing bank staff: Branch Managers, Higher Mgmt, Admins, Agents
 * ERD: PK Employee_ID, FK Branch_ID, Name, UserName, Password, Email, Mobile_No, Role, Status
 */
export interface Employee {
  Employee_ID: string;
  Branch_ID: string;
  Name: string;
  UserName: string;
  Password?: string;
  Email: string;
  Mobile_No: string;
  Role: UserRole;
  Status: 'Active' | 'Dormant';
}

/**
 * Employee Authentication log table
 * ERD: PK Session_ID, FK Employee_ID, Login_Time, Logout_Time, Session_Status
 */
export interface EmployeeAuthentication {
  Session_ID: string;
  Employee_ID: string;
  Login_Time: string;
  Logout_Time: string | null;
  Session_Status: SessionStatus;
  IP_Address?: string;
}

/**
 * OTP entity for high-security administrative operations (HRM approvals, password resets)
 * ERD: PK OTP_ID, FK Employee_ID, OTP_Hash, Purpose, Created_At, Expires_At
 */
export interface OTP {
  OTP_ID: string;
  Employee_ID: string;
  OTP_Hash: string;
  Purpose: 'change_employee_password' | 'add_employee' | 'inactivate_employee' | 'branch_action';
  Created_At: string;
  Expires_At: string;
  Status: 'Valid' | 'Used' | 'Expired';
}

// ============================================================================
// 3. ERD Table: Branch
// ============================================================================

/**
 * Branch entity representing physical branches of B-Trust Bank
 * ERD: PK Branch_ID, Name, Address, Phone_No, Status, Email
 */
export interface Branch {
  Branch_ID: string;
  Name: string;
  Address: string;
  Phone_No: string;
  Status: 'Active' | 'Closed';
  Email: string;
  Manager_ID?: string;
}

// ============================================================================
// 4. ERD Tables: Customer & Customer Authentication
// ============================================================================

/**
 * Customer entity representing registered bank clients
 * ERD: PK Customer_ID, FK Agent_ID, Name, NIC, Password, Address, Lan_No, Mobile_No, Email, Date_of_Birth, Register_Date, Status
 */
export interface Customer {
  Customer_ID: string;
  Agent_ID: string;
  Name: string;
  NIC: string;
  Password?: string;
  Address: string;
  Lan_No: string;
  Mobile_No: string;
  Email: string;
  Date_of_Birth: string;
  Register_Date: string;
  Status: 'Active' | 'Dormant';
}

/**
 * Customer Authentication session log
 * ERD: PK Session_ID, FK Customer_ID, Login_Time, Logout_Time, Session_Status
 */
export interface CustomerAuthentication {
  Session_ID: string;
  Customer_ID: string;
  Login_Time: string;
  Logout_Time: string | null;
  Session_Status: SessionStatus;
}

// ============================================================================
// 5. ERD Tables: Account Types & Savings Accounts
// ============================================================================

/**
 * Account Type entity defining savings schemes
 * ERD: PK Type_ID, Type_Name, Interest_Rate, Min_balance, Min_Age, Max_Age
 */
export interface AccountType {
  Type_ID: string;
  Type_Name: 'Regular Savings' | 'Children Savings' | 'Senior Citizens';
  Interest_Rate: number; // e.g. 8.5%
  Min_balance: number;   // e.g. 1000
  Min_Age: number;       // e.g. 18
  Max_Age: number;       // e.g. 59
}

/**
 * Savings Account entity
 * ERD: PK Account_No, FK Branch_ID, FK Agent_ID, FK Type_ID, Balance, Opened_Date, Ownership_Type, Status, cumulative_interest
 */
export interface SavingsAccount {
  Account_No: string;
  Branch_ID: string;
  Agent_ID: string;
  Type_ID: string;
  Balance: number;
  Opened_Date: string;
  Ownership_Type: 'Single' | 'Joint';
  Status: 'Active' | 'Inactive';
  cumulative_interest: number;
  Last_Transaction_Date?: string; // For auto-deactivation rules (SRS BR-005)
}

/**
 * Customer Account join entity (Bridge table for Single or Joint accounts up to 4 holders BR-004)
 * ERD: PK,FK Customer_ID, PK,FK Account_No
 */
export interface CustomerAccount {
  Customer_ID: string;
  Account_No: string;
}

// ============================================================================
// 6. ERD Tables: Fixed Deposit Types & Fixed Deposits
// ============================================================================

/**
 * Fixed Deposit Type definition
 * ERD: PK Type, Duration, Interest_Rate, Min_Deposit
 */
export interface FixedDepositType {
  Type: string; // e.g. 'FD_6_MONTH', 'FD_12_MONTH', 'FD_24_MONTH'
  Duration: string; // e.g. '6 Months', '12 Months', '24 Months'
  Interest_Rate: number; // e.g. 12.0
  Min_Deposit: number;   // e.g. 50000
}

/**
 * Fixed Deposit entity linked to a savings account (BR-006: 1 active FD per savings account)
 * ERD: PK FD_ID, FK Account_No, FK Type, Principal_Amount, Monthly_Amount, Start_Date, Maturity_Date, Renewal_Status, Status, PayOut_Date
 */
export interface FixedDeposit {
  FD_ID: string;
  Account_No: string;
  Type: string;
  Principal_Amount: number;
  Monthly_Amount: number;
  Start_Date: string;
  Maturity_Date: string;
  Renewal_Status: boolean;
  Status: 'Active' | 'Closed' | 'Dormant';
  PayOut_Date: string | null;
}

// ============================================================================
// 7. ERD Tables: Transactions
// ============================================================================

/**
 * Normal (In-person / Agent) Transaction entity
 * ERD: PK Transaction_ID, FK Account_No, FK Employee_ID, Timestamp, Transaction_Type, Amount, After_Balance, Remark
 */
export interface NormalTransaction {
  Transaction_ID: string;
  Account_No: string;
  Employee_ID: string;
  Timestamp: string;
  Transaction_Type: TransactionType;
  Amount: number;
  After_Balance: number;
  Remark: string;
}

/**
 * Online Transaction entity
 * ERD: PK Transaction_ID, FK Source_Acc, FK Destination_Acc, Timestamp, Amount, Status, Remark
 */
export interface OnlineTransaction {
  Transaction_ID: string;
  Source_Acc: string;
  Destination_Acc: string;
  Timestamp: string;
  Amount: number;
  Status: 'Success' | 'Failed';
  Remark: string;
}

// ============================================================================
// 8. ERD Tables: Approval Requests (2-Level Manager Verification System)
// ============================================================================

/**
 * Customer Approval Request entity
 * ERD: PK Request_ID, FK Customer_ID, FK Request_By, FK Request_To, Request_Type, Request_Data, Request_Timestamp, Approval_Timestamp, Status
 */
export interface ApprovalRequestCustomer {
  Request_ID: string;
  Customer_ID: string;
  Request_By: string; // Employee_ID (Agent)
  Request_To: string; // Employee_ID (Branch Manager)
  Request_Type: 'new_customer_registration' | 'update_customer_data' | 'deactivate_customer';
  Request_Data: string; // Serialized JSON or summary
  Request_Timestamp: string;
  Approval_Timestamp: string | null;
  Status: ApprovalStatus;
  Notes?: string;
}

/**
 * Account Approval Request entity
 * ERD: PK Request_ID, FK Account_No, FK Request_By, FK Request_To, Request_Type, Request_Data, Request_Timestamp, Approval_Timestamp, Status
 */
export interface ApprovalRequestAccount {
  Request_ID: string;
  Account_No: string;
  Request_By: string;
  Request_To: string;
  Request_Type: 'open_saving_account' | 'edit_saving_account' | 'deactivate_account' | 'reassign_agent';
  Request_Data: string;
  Request_Timestamp: string;
  Approval_Timestamp: string | null;
  Status: ApprovalStatus;
  Notes?: string;
}

/**
 * Fixed Deposit Approval Request entity
 * ERD: PK Request_ID, FK Request_By, FK Request_To, FK FD_ID, Request_Type, Request_Data, Request_Timestamp, Approval_Timestamp, Status
 */
export interface ApprovalRequestFD {
  Request_ID: string;
  FD_ID: string;
  Request_By: string;
  Request_To: string;
  Request_Type: 'open_FD' | 'withdraw_FD' | 'renew_FD';
  Request_Data: string;
  Request_Timestamp: string;
  Approval_Timestamp: string | null;
  Status: ApprovalStatus;
  Notes?: string;
}

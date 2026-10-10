import { SavingsAccount } from '@/types';
import { mockSavingsAccounts } from '@/data/mockData';

// In-memory savings account repository
let accountsState: SavingsAccount[] = [...mockSavingsAccounts];

// Retrieve savings accounts, optionally filtered by branch
export function getSavingsAccounts(branchId?: string): SavingsAccount[] {
  if (branchId && branchId !== 'All') {
    return accountsState.filter((a) => a.branchId === branchId);
  }
  return [...accountsState];
}

// Open a new savings account
export function createSavingsAccount(
  data: Omit<SavingsAccount, 'accountNumber' | 'cumulativeInterest' | 'openedDate'>
): { success: boolean; account: SavingsAccount } {
  const newAccount: SavingsAccount = {
    ...data,
    accountNumber: `ACC-${Math.floor(100000 + Math.random() * 900000)}`,
    cumulativeInterest: 0,
    openedDate: new Date().toISOString().split('T')[0],
  };
  accountsState = [newAccount, ...accountsState];
  return { success: true, account: newAccount };
}

// Modify savings account details
export function updateSavingsAccount(account: SavingsAccount): { success: boolean; message: string } {
  accountsState = accountsState.map((a) => (a.accountNumber === account.accountNumber ? account : a));
  return { success: true, message: 'Account updated successfully.' };
}

// Transfer or alter account ownership (e.g., individual to joint, or changing primary holder)
export function transferAccountOwnership(
  accountNumber: string,
  newPrimaryCustomerId: string,
  newPrimaryCustomerName: string,
  ownershipType: 'Individual' | 'Joint',
  jointCustomerIds: string[],
  reason: string
): { success: boolean; message: string } {
  accountsState = accountsState.map((a) => {
    if (a.accountNumber === accountNumber) {
      return {
        ...a,
        primaryCustomerId: newPrimaryCustomerId,
        primaryCustomerName: newPrimaryCustomerName,
        ownershipType,
        jointCustomerIds: ownershipType === 'Joint' ? jointCustomerIds : [],
      };
    }
    return a;
  });
  return {
    success: true,
    message: `Ownership successfully updated for ${accountNumber}. Reason recorded: ${reason}`,
  };
}

// Toggle account active/dormant status
export function toggleAccountStatus(accountNumber: string): { success: boolean; newStatus: string } {
  let newStatus = 'Active';
  accountsState = accountsState.map((a) => {
    if (a.accountNumber === accountNumber) {
      newStatus = a.status === 'Active' ? 'Dormant' : 'Active';
      return { ...a, status: newStatus as 'Active' | 'Dormant' };
    }
    return a;
  });
  return { success: true, newStatus };
}

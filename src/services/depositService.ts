import { FixedDeposit } from '@/types';
import { mockFixedDeposits } from '@/data/mockData';

// In-memory fixed deposits repository
let fixedDepositsState: FixedDeposit[] = [...mockFixedDeposits];

// Retrieve fixed deposits, optionally filtered by branch
export function getFixedDeposits(branchId?: string): FixedDeposit[] {
  if (branchId && branchId !== 'All') {
    return fixedDepositsState.filter((fd) => fd.branchId === branchId);
  }
  return [...fixedDepositsState];
}

// Open a new fixed deposit linked to a customer savings account
export function createFixedDeposit(
  data: Omit<FixedDeposit, 'id' | 'monthlyInterestPayout' | 'status' | 'startDate' | 'maturityDate'>
): { success: boolean; fixedDeposit: FixedDeposit } {
  // Calculate monthly interest payout = (Principal * (Rate / 100)) / 12
  const monthlyPayout = Math.round((data.principalAmount * (data.interestRate / 100)) / 12);
  const startDate = new Date().toISOString().split('T')[0];
  const maturityDateObj = new Date();
  maturityDateObj.setMonth(maturityDateObj.getMonth() + data.termMonths);
  const maturityDate = maturityDateObj.toISOString().split('T')[0];

  const newDeposit: FixedDeposit = {
    ...data,
    id: `FD-${Math.floor(1000 + Math.random() * 9000)}`,
    monthlyInterestPayout: monthlyPayout,
    autoRenew: data.autoRenew,
    status: 'Active',
    startDate,
    maturityDate,
  };

  fixedDepositsState = [newDeposit, ...fixedDepositsState];
  return { success: true, fixedDeposit: newDeposit };
}

// Toggle auto-renewal flag for a fixed deposit
export function toggleFDRenewal(depositId: string): { success: boolean; autoRenew: boolean } {
  let updatedRenew = false;
  fixedDepositsState = fixedDepositsState.map((fd) => {
    if (fd.id === depositId) {
      updatedRenew = !fd.autoRenew;
      return { ...fd, autoRenew: updatedRenew };
    }
    return fd;
  });
  return { success: true, autoRenew: updatedRenew };
}

// Premature closure of a fixed deposit
export function closeFixedDeposit(depositId: string): { success: boolean; message: string } {
  fixedDepositsState = fixedDepositsState.map((fd) => {
    if (fd.id === depositId) {
      return { ...fd, status: 'Closed' as const };
    }
    return fd;
  });
  return { success: true, message: 'Fixed deposit closed successfully. Principal transferred to linked savings account.' };
}

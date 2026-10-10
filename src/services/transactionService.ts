import { Transaction } from '@/types';
import { mockTransactions } from '@/data/mockData';

// In-memory transaction repository
let transactionsState: Transaction[] = [...mockTransactions];

// Retrieve transactions, optionally filtered by branch
export function getTransactions(branchId?: string): Transaction[] {
  if (branchId && branchId !== 'All') {
    return transactionsState.filter((t) => t.branchId === branchId);
  }
  return [...transactionsState];
}

// Process a counter or field transaction (deposit or withdrawal)
export function processTransaction(
  accountNumber: string,
  customerName: string,
  branchId: string,
  type: 'Deposit' | 'Withdrawal',
  amount: number,
  currentBalance: number,
  minimumBalanceRequired: number,
  remark: string,
  processedBy: string,
  channel: 'Counter' | 'Field Agent' = 'Counter'
): { success: boolean; message: string; transaction?: Transaction; newBalance?: number } {
  if (amount <= 0) {
    return { success: false, message: 'Transaction amount must be greater than zero.' };
  }

  // Validate withdrawal against minimum balance requirement
  if (type === 'Withdrawal') {
    if (currentBalance - amount < minimumBalanceRequired) {
      return {
        success: false,
        message: `Insufficient funds. Account must maintain a minimum balance of Rs. ${minimumBalanceRequired.toLocaleString()}.`,
      };
    }
  }

  const newBalance = type === 'Deposit' ? currentBalance + amount : currentBalance - amount;
  const now = new Date();
  const timestamp = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  const newTx: Transaction = {
    id: `TXN-${Math.floor(1000 + Math.random() * 9000)}`,
    accountNumber,
    customerName,
    branchId,
    type,
    amount,
    balanceAfter: newBalance,
    processedBy,
    channel,
    timestamp,
    remark: remark || `${type} transaction via ${channel}`,
  };

  transactionsState = [newTx, ...transactionsState];
  return {
    success: true,
    message: `${type} of Rs. ${amount.toLocaleString()} completed successfully.`,
    transaction: newTx,
    newBalance,
  };
}

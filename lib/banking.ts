// Shared API entry point. Each request is routed to its owning domain inside one SQL transaction.
import { getDb } from './db';
import type { Staff } from './types';
import { BusinessError, requiredText } from './validation';
import { first } from './banking/shared';
import type { Input } from './banking/shared';
import { createCustomer, updateCustomer, customerStatus } from './banking/customers';
import { createAccount, updateAccount, closeAccount, accountStatus, createFixedDeposit, closeFixedDeposit } from './banking/accounts';
import { createTransaction } from './banking/transactions';
import { reviewApproval } from './banking/approvals';
import { saveBranch, saveStaff, reassignAgent } from './banking/administration';
import { updateRate, accrueInterest, runInterest } from './banking/interest';

import { processMaturities, processInactivity } from './banking/account-lifecycle';

export { getBootstrap } from './banking/bootstrap';

export async function performAction(sessionUser: Staff, input: Input): Promise<{message:string}> {
  const database = await getDb();
  try {
    return await database.transaction(async tx => {
      // Authorization is rechecked inside the same transaction as every write.
      const user = await first<Staff>(tx,'SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=$1 AND status=\'active\' FOR SHARE',[sessionUser.id]);
      const action = requiredText(input.action,'Action',50);
      switch (action) {
        case 'customer.create': return createCustomer(tx,user,input);
        case 'customer.update': return updateCustomer(tx,user,input);
        case 'customer.status': return customerStatus(tx,user,input);
        case 'account.create': return createAccount(tx,user,input);
        case 'account.update': return updateAccount(tx,user,input);
        case 'account.close': return closeAccount(tx,user,input);
        case 'account.status': return accountStatus(tx,user,input);
        case 'account.processInactivity': return processInactivity(tx,user,input);
        case 'transaction.create': return createTransaction(tx,user,input);
        case 'fd.create': return createFixedDeposit(tx,user,input);
        case 'fd.close': return closeFixedDeposit(tx,user,input);
        case 'approval.review': return reviewApproval(tx,user,input);
        case 'interest.run': return runInterest(tx,user,input);
        case 'interest.accrue': return accrueInterest(tx,user,input);
        case 'fd.processMaturities': return processMaturities(tx,user);
        case 'rate.update': return updateRate(tx,user,input);
        case 'branch.create': case 'branch.update': return saveBranch(tx,user,input,action);
        case 'staff.create': case 'staff.update': return saveStaff(tx,user,input,action);
        case 'agent.reassign': return reassignAgent(tx,user,input);
        default: throw new BusinessError('Unknown action.');
      }
    });
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    const code = (error as {code?:string}).code;
    if (code === '23505') throw new BusinessError('This record already exists or a matching request is already pending.',409);
    if (code === '23503') throw new BusinessError('A linked record no longer exists. Refresh and try again.');
    if (code === '23514') throw new BusinessError('This change would violate a database business rule.');
    throw error;
  }
}

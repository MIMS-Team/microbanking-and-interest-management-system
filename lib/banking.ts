import { requestCorrection } from './banking/corrections';
import { fenceJob } from '../scripts/job-claims.mjs';
// Shared API entry point. Each request is routed to its owning domain inside one SQL transaction.
import { getDb } from './db';
import type { Staff } from './types';
import { BusinessError, requiredText } from './validation';
import { requirePermission, actionPermission } from './permissions';
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

export async function performAction(sessionUser: Staff, input: Input, jobClaim?:Parameters<typeof fenceJob>[1]): Promise<{message:string}> {
  const database = await getDb();
  try {
    return await database.transaction(async tx => {
      if(jobClaim) await fenceJob(tx,jobClaim);
      const action = requiredText(input.action,'Action',50);
      // Serialize staff reductions before taking actor/approval/target locks.
      if(action==='staff.update' || action==='approval.review' && (await tx.query<{type:string}>('SELECT type FROM approvals WHERE id=$1',[input.id])).rows[0]?.type.startsWith('staff.')) {
        const guard=await tx.query("SELECT name FROM database_guards WHERE name='active-administrators' FOR UPDATE");
        if(guard.rows.length!==1) throw new BusinessError('Administrator database guard is missing; apply the reviewed migrations.',409);
      }
      // Authorization is rechecked inside the same transaction as every write.
      const user = await first<Staff>(tx,'SELECT id,full_name,email,role,branch_id,status FROM staff WHERE id=$1 AND status=\'active\' FOR SHARE',[sessionUser.id]);
      await requirePermission(tx,user.id,actionPermission[action]??'unknown');
      const result=await (async()=>{switch (action) {
        case 'customer.create': return createCustomer(tx,user,input);
        case 'customer.update': return updateCustomer(tx,user,input);
        case 'customer.status': return customerStatus(tx,user,input);
        case 'account.create': return createAccount(tx,user,input);
        case 'account.update': return updateAccount(tx,user,input);
        case 'account.close': return closeAccount(tx,user,input);
        case 'account.status': return accountStatus(tx,user,input);
        case 'account.processInactivity': return processInactivity(tx,user,input);
        case 'transaction.reverse': return requestCorrection(tx,user,input);
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
      }})();
      if(jobClaim) await fenceJob(tx,jobClaim);
      return result;
    });
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    const code = (error as {code?:string}).code;
    if (code === 'ER_DUP_ENTRY') throw new BusinessError('This record already exists or a matching request is already pending.',409);
    if (code === 'ER_NO_REFERENCED_ROW_2') throw new BusinessError('A linked record no longer exists. Refresh and try again.');
    if (code === 'ER_CHECK_CONSTRAINT_VIOLATED' || code === 'ER_SIGNAL_EXCEPTION') throw new BusinessError('This change would violate a database business rule.');
    throw error;
  }
}

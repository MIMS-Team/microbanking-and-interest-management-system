// Person 5: approval authorization and routing. Domain modules apply their own changes.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, optionalText, positiveId } from '../validation';
import { first, requireRole, requireBranch, audit } from './shared';
import type { Input, ApprovalRow } from './shared';
import { applyCustomerApproval } from './customers';
import { applyAccountApproval } from './accounts';
import { applyBranchChange, applyStaffChange } from './administration';

export async function reviewApproval(tx: Queryable, user: Staff, input: Input) {
  const approval = await first<ApprovalRow>(tx,
    'SELECT * FROM approvals WHERE id=$1 FOR UPDATE', [positiveId(input.id)]);
  const organizationChange = approval.type.startsWith('branch.') || approval.type.startsWith('staff.');
  requireRole(user, organizationChange ? ['higher_manager'] : ['manager', 'higher_manager']);
  if (approval.branch_id !== null) requireBranch(user, approval.branch_id);
  if (approval.requested_by === user.id) throw new BusinessError('You cannot approve your own request.', 403);
  if (approval.status !== 'pending') throw new BusinessError('This request has already been reviewed.', 409);

  const decision = requiredText(input.decision, 'Decision');
  if (!['approved', 'rejected'].includes(decision)) throw new BusinessError('Choose approve or reject.');
  const notes = optionalText(input.notes, 500);
  if (decision === 'rejected' && !notes) throw new BusinessError('Give a reason for rejecting this request.');

  if (decision === 'approved') {
    await applyApproval(tx, user, approval);
  } else {
    // A rejected creation is retained as evidence; no cash has been posted yet.
    const tables: Record<string, string> = {
      'customer.create': 'customers',
      'account.create': 'savings_accounts',
      'fd.create': 'fixed_deposits',
    };
    const table = tables[approval.type];
    if (table) await tx.query(`UPDATE ${table} SET status='rejected' WHERE id=$1 AND status='pending'`, [approval.entity_id]);
  }

  await tx.query(`UPDATE approvals SET status=$1,reviewed_by=$2,notes=$3,reviewed_at=CURRENT_TIMESTAMP
    WHERE id=$4`, [decision, user.id, notes, approval.id]);
  await audit(tx, user, `approval.${decision}`, 'approval', approval.id, approval.branch_id, {type: approval.type, notes});
  return {message: `Request ${decision}.`};
}

export async function applyApproval(tx: Queryable, user: Staff, approval: ApprovalRow): Promise<void> {
  // Approval authorization stays here; each domain applies its own SQL changes.
  if (approval.type.startsWith('customer.')) return applyCustomerApproval(tx, approval);
  if (approval.type.startsWith('account.') || approval.type.startsWith('fd.')) return applyAccountApproval(tx, user, approval);
  switch (approval.type) {
    case 'branch.create': case 'branch.update': return applyBranchChange(tx, approval);
    case 'staff.create': case 'staff.update': return applyStaffChange(tx, user, approval);
    default: throw new BusinessError('Unsupported approval request.');
  }
}

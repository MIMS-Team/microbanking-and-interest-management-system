import { consumeApprovalCode } from '../auth/approvals';
// Person 5: approval authorization and routing. Domain modules apply their own changes.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, optionalText, positiveId } from '../validation';
import { first, requireRole, requireBranch, audit } from './shared';
import type { Input, ApprovalRow } from './shared';
import { applyCustomerApproval } from './customers';
import { applyAccountApproval } from './accounts';
import { applyBranchChange, applyStaffChange, applyAgentReassignment } from './administration';

export async function reviewApproval(tx: Queryable, user: Staff, input: Input) {
  const approval = await first<ApprovalRow>(tx,
    'SELECT * FROM approvals WHERE id=$1 FOR UPDATE', [positiveId(input.id)]);
  const organizationChange = approval.type.startsWith('branch.') || approval.type.startsWith('staff.') || approval.type==='agent.reassign';
  requireRole(user, organizationChange ? ['higher_manager'] : ['manager', 'higher_manager']);
  if (approval.branch_id !== null) requireBranch(user, approval.branch_id);
  if (approval.requested_by === user.id) throw new BusinessError('You cannot approve your own request.', 403);
  if (approval.status !== 'pending') throw new BusinessError('This request has already been reviewed.', 409);
  if (approval.intended_approver_id!==null && approval.intended_approver_id!==user.id) throw new BusinessError('Only the assigned reviewer can decide this request.',403);
  if (approval.expires_at && new Date(approval.expires_at+'Z').getTime()<=Date.now()) throw new BusinessError('This request has expired.',409);
  const tables:Record<string,string>={customer:'customers',account:'savings_accounts',fd:'fixed_deposits',staff:'staff',branch:'branches',agent:'staff'};
  const table=tables[approval.type.split('.')[0]];
  if (!table) throw new BusinessError('Invalid approval target.');
  if (approval.entity_id!==null) {
    const target=await first<{version:number}>(tx,`SELECT version FROM ${table} WHERE id=$1 FOR UPDATE`,[approval.entity_id]);
    if(input.decision==='approved' && target.version!==approval.target_version) throw new BusinessError('This record changed after submission. Submit a fresh request.',409);
  }

  const decision = requiredText(input.decision, 'Decision');
  if (!['approved', 'rejected'].includes(decision)) throw new BusinessError('Choose approve or reject.');
  const notes = optionalText(input.notes, 500);
  if (decision === 'rejected' && !notes) throw new BusinessError('Give a reason for rejecting this request.');

  if (decision === 'approved') {
    if(approval.payload.hr_challenge_required) throw new BusinessError('Confirm this employee request through its assigned HR approval challenge.',409);
    if (approval.type.startsWith('staff.')) await consumeApprovalCode(tx,user,approval.id,input);
    await applyApproval(tx, user, approval);
    if (approval.entity_id!==null) await tx.query(`UPDATE ${table} SET version=version+1 WHERE id=$1`,[approval.entity_id]);
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
    case 'agent.reassign': await applyAgentReassignment(tx,user,approval.payload,approval.id); return;
    default: throw new BusinessError('Unsupported approval request.');
  }
}

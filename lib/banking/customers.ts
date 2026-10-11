// Person 2: customer requests and the SQL applied after manager approval.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, nic, dateOfBirth, email, phone } from '../validation';
import { first, requireRole, requireAgent, queue, reference, requireActiveAssignment } from './shared';
import type { Input, CustomerRow, ApprovalRow } from './shared';

export function customerDetails(input: Input): Input {
  const fullName = requiredText(input.full_name, 'Full name');
  const address = requiredText(input.address, 'Address', 500);
  if (fullName.length < 3) throw new BusinessError('Full name must contain at least 3 characters.');
  if (address.length < 5) throw new BusinessError('Address must contain at least 5 characters.');
  return {full_name:fullName,nic:nic(input.nic),date_of_birth:dateOfBirth(input.date_of_birth),
    address,mobile:phone(input.mobile,true),landline:phone(input.landline),email:email(input.email)};
}

// Give a useful error before queuing an edit. The MySQL UNIQUE key remains the
// final authority when two transactions try to register the same NIC at once.
async function requireUniqueNic(tx: Queryable, value: unknown, exceptId = 0) {
  const duplicate = await tx.query('SELECT id FROM customers WHERE nic=? AND id<>? LIMIT 1', [value, exceptId]);
  if (duplicate.rows.length) throw new BusinessError('A customer with this NIC already exists.', 409);
}

async function requireNoOpenAccounts(tx: Queryable, id: number) {
  const linked = await tx.query(`SELECT a.id FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id
    WHERE ca.customer_id=? AND a.status IN ('active','inactive','pending')`, [id]);
  if (linked.rows.length) throw new BusinessError('Close this customer’s open savings accounts before deactivating the customer.');
}

export async function createCustomer(tx: Queryable, user: Staff, input: Input) {
  requireRole(user,['agent']);
  const values = customerDetails(input);
  const branch = user.branch_id;
  if (branch === null) throw new BusinessError('An assigned branch is required to register customers.',403);
  if (input.branch_id !== undefined && positiveId(input.branch_id) !== branch) throw new BusinessError('Register customers in your assigned branch.',403);
  if (input.agent_id !== undefined && positiveId(input.agent_id) !== user.id) throw new BusinessError('Customers must be assigned to the registering agent.',403);
  await requireActiveAssignment(tx, branch, user.id);
  await requireUniqueNic(tx, values.nic);
  const created = await first<{id:number}>(tx,`INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,landline,email,branch_id,agent_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,[reference('CUS'),values.full_name,values.nic,values.date_of_birth,values.address,values.mobile,values.landline,values.email,branch,user.id]);
  await queue(tx,user,'customer.create',created.id,branch,String(values.full_name),`Register ${values.full_name}`,{id:created.id});
  return {message:'Customer registration submitted for manager approval.'};
}

export async function updateCustomer(tx: Queryable,user: Staff,input: Input) {
  requireRole(user,['agent']);
  const current = await first<CustomerRow>(tx,'SELECT * FROM customers WHERE id=? FOR UPDATE',[positiveId(input.id)]);
  requireAgent(user,current);
  await requireActiveAssignment(tx,current.branch_id,current.agent_id);
  if (current.status !== 'active') throw new BusinessError('Reactivate this customer before editing their details.');
  const values = customerDetails(input);
  await requireUniqueNic(tx,values.nic,current.id);
  await queue(tx,user,'customer.update',current.id,current.branch_id,current.full_name,`Update details for ${current.full_name}`,values);
  return {message:'Customer changes submitted for approval. Current details remain visible until approved.'};
}

export async function customerStatus(tx: Queryable,user: Staff,input: Input) {
  requireRole(user,['agent']);
  const current = await first<CustomerRow>(tx,'SELECT * FROM customers WHERE id=? FOR UPDATE',[positiveId(input.id)]);
  requireAgent(user,current);
  await requireActiveAssignment(tx,current.branch_id,current.agent_id);
  const status = requiredText(input.status,'Status');
  if (!['active','inactive'].includes(status) || !['active','inactive'].includes(current.status) || status===current.status) throw new BusinessError('Choose a different active or inactive status.');
  const reason = requiredText(input.reason,'Reason',300);
  if (reason.length < 5) throw new BusinessError('Reason must contain at least 5 characters.');
  if (status === 'inactive') await requireNoOpenAccounts(tx,current.id);
  await queue(tx,user,'customer.status',current.id,current.branch_id,current.full_name,`${status==='active'?'Reactivate':'Deactivate'} ${current.full_name}`,{status,reason});
  return {message:'Customer status change submitted for approval.'};
}

export async function applyCustomerApproval(tx: Queryable, approval: ApprovalRow): Promise<void> {
  const id = approval.entity_id;
  const proposed = approval.payload;
  const current=await first<CustomerRow & Input>(tx,"SELECT *,DATE_FORMAT(date_of_birth,'%Y-%m-%d') AS date_of_birth FROM customers WHERE id=? FOR UPDATE",[id]);
  if (current.branch_id !== approval.branch_id) throw new BusinessError('The customer branch no longer matches this request.',409);
  await requireActiveAssignment(tx,current.branch_id,current.agent_id);
  if(approval.type==='customer.create') customerDetails(current);
  switch (approval.type) {
    case 'customer.create': {
      await first(tx, `UPDATE customers SET status='active',updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='pending'`, [id]);
      break;
    }
    case 'customer.update': {
      const values = customerDetails(proposed);
      await requireUniqueNic(tx,values.nic,id);
      await first(tx, `UPDATE customers SET full_name=?,nic=?,date_of_birth=?,address=?,mobile=?,
        landline=?,email=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'`,
        [values.full_name, values.nic, values.date_of_birth, values.address, values.mobile, values.landline, values.email, id]);
      break;
    }
    case 'customer.status': {
      if (!['active','inactive'].includes(String(proposed.status)) || current.status === proposed.status) {
        throw new BusinessError('Choose a different active or inactive status.');
      }
      requiredText(proposed.reason,'Reason',300);
      if (proposed.status === 'inactive') {
        await requireNoOpenAccounts(tx,id);
      }
      await first(tx, `UPDATE customers SET status=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status IN ('active','inactive')`, [proposed.status, id]);
      break;
    }
    default: throw new BusinessError('Unsupported approval request.');
  }
}

// Person 2: customer requests and the SQL applied after manager approval.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, nic, dateOfBirth, email, phone } from '../validation';
import { first, requireRole, requireAgent, queue, reference, requireActiveAssignment } from './shared';
import type { Input, CustomerRow, ApprovalRow } from './shared';

export function customerDetails(input: Input): Input {
  return {full_name:requiredText(input.full_name,'Full name'),nic:nic(input.nic),date_of_birth:dateOfBirth(input.date_of_birth),
    address:requiredText(input.address,'Address',500),mobile:phone(input.mobile,true),landline:phone(input.landline),email:email(input.email)};
}

export async function createCustomer(tx: Queryable, user: Staff, input: Input) {
  requireRole(user,['agent']);
  const values = customerDetails(input);
  const branch = user.branch_id!;
  if (input.branch_id && positiveId(input.branch_id) !== branch) throw new BusinessError('Register customers in your assigned branch.',403);
  if (input.agent_id && positiveId(input.agent_id) !== user.id) throw new BusinessError('Customers must be assigned to the registering agent.',403);
  await first(tx,'SELECT id FROM branches WHERE id=$1 AND status=\'active\'',[branch]);
  const created = await first<{id:number}>(tx,`INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,landline,email,branch_id,agent_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[reference('CUS'),values.full_name,values.nic,values.date_of_birth,values.address,values.mobile,values.landline,values.email,branch,user.id]);
  await queue(tx,user,'customer.create',created.id,branch,String(values.full_name),`Register ${values.full_name}`,{id:created.id});
  return {message:'Customer registration submitted for manager approval.'};
}

export async function updateCustomer(tx: Queryable,user: Staff,input: Input) {
  const current = await first<CustomerRow>(tx,'SELECT * FROM customers WHERE id=$1 FOR UPDATE',[positiveId(input.id)]);
  requireAgent(user,current);
  if (current.status !== 'active') throw new BusinessError('Reactivate this customer before editing their details.');
  const values = customerDetails(input);
  await queue(tx,user,'customer.update',current.id,current.branch_id,current.full_name,`Update details for ${current.full_name}`,values);
  return {message:'Customer changes submitted for approval. Current details remain visible until approved.'};
}

export async function customerStatus(tx: Queryable,user: Staff,input: Input) {
  const current = await first<CustomerRow>(tx,'SELECT * FROM customers WHERE id=$1 FOR UPDATE',[positiveId(input.id)]);
  requireAgent(user,current);
  const status = requiredText(input.status,'Status');
  if (!['active','inactive'].includes(status) || !['active','inactive'].includes(current.status) || status===current.status) throw new BusinessError('Choose a different active or inactive status.');
  await queue(tx,user,'customer.status',current.id,current.branch_id,current.full_name,`${status==='active'?'Reactivate':'Deactivate'} ${current.full_name}`,{status,reason:requiredText(input.reason,'Reason',300)});
  return {message:'Customer status change submitted for approval.'};
}

export async function applyCustomerApproval(tx: Queryable, approval: ApprovalRow): Promise<void> {
  const id = approval.entity_id;
  const proposed = approval.payload;
  const current=await first<CustomerRow & Input>(tx,"SELECT *,DATE_FORMAT(date_of_birth,'%Y-%m-%d') AS date_of_birth FROM customers WHERE id=$1 FOR UPDATE",[id]);
  await requireActiveAssignment(tx,current.branch_id,current.agent_id);
  if(approval.type==='customer.create') customerDetails(current);
  switch (approval.type) {
    case 'customer.create': {
      await first(tx, `UPDATE customers SET status='active',updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND status='pending'`, [id]);
      break;
    }
    case 'customer.update': {
      const values = customerDetails(proposed);
      await first(tx, `UPDATE customers SET full_name=$1,nic=$2,date_of_birth=$3,address=$4,mobile=$5,
        landline=$6,email=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8 AND status='active'`,
        [values.full_name, values.nic, values.date_of_birth, values.address, values.mobile, values.landline, values.email, id]);
      break;
    }
    case 'customer.status': {
      // This lock serializes a status decision with creating or editing ownership.
      await first(tx, 'SELECT id FROM customers WHERE id=$1 FOR UPDATE', [id]);
      if (proposed.status === 'inactive') {
        const linked = await tx.query(`SELECT a.id FROM customer_accounts ca JOIN savings_accounts a ON a.id=ca.account_id
          WHERE ca.customer_id=$1 AND a.status IN ('active','inactive','pending')`, [id]);
        if (linked.rows.length) throw new BusinessError('Close this customer’s open savings accounts before deactivating the customer.');
      }
      await first(tx, `UPDATE customers SET status=$1,updated_at=CURRENT_TIMESTAMP
        WHERE id=$2 AND status IN ('active','inactive')`, [proposed.status, id]);
      break;
    }
    default: throw new BusinessError('Unsupported approval request.');
  }
}

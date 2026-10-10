// Person 3: savings, joint ownership and fixed deposit requests and approvals.
import type { Queryable } from '../db';
import type { Staff } from '../types';
import { BusinessError, requiredText, positiveId, money } from '../validation';
import { first, requireRole, requireAgent, queue, account, requireActive, reference, requireActiveOwners, requireNoFixedDeposit, businessDates } from './shared';
import type { Input, CustomerRow, RateRow, DepositRow, ApprovalRow } from './shared';
import { postEntry, operation } from './ledger';
import { settleSavingsOnClosure, settleFixedDeposit } from './interest';

export async function createAccount(tx: Queryable,user: Staff,input: Input) {
  requireRole(user,['agent']);
  const rateId = input.rate_id ? positiveId(input.rate_id) : 1;
  const rate = await first<RateRow>(tx,'SELECT * FROM rates WHERE id=$1 AND product=\'savings\'',[rateId]);
  const people = await validateOwners(tx, input.owner_ids, user.branch_id!, user.id, rate);
  const owners = people.map(person => person.id);
  const opening = money(input.opening_balance,'Opening balance');
  if (Number(opening)<Number(rate.minimum_balance)) throw new BusinessError(`Opening balance must be at least LKR ${rate.minimum_balance}.`);
  const created = await first<{id:number}>(tx,`INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,minimum_balance)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[reference('SA'),user.branch_id,user.id,rate.id,rate.minimum_balance]);
  for (const owner of owners) await tx.query('INSERT INTO customer_accounts(customer_id,account_id) VALUES($1,$2)',[owner,created.id]);
  await queue(tx,user,'account.create',created.id,user.branch_id,people.map(p=>p.full_name).join(', '),`Open ${owners.length>1?'joint':'savings'} account`,{opening_balance:opening});
  return {message:'Savings account submitted for approval. Opening cash is posted only when approved.'};
}

export async function validateOwners(tx: Queryable, input: unknown, branchId: number, agentId: number, rate: RateRow): Promise<CustomerRow[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 4) {
    throw new BusinessError('Choose between one and four account owners.');
  }
  const ids = [...new Set(input.map(value => positiveId(value, 'Owner')))];
  const people = (await tx.query<CustomerRow>(
    'SELECT * FROM customers WHERE id=ANY($1::integer[]) ORDER BY id FOR SHARE', [ids],
  )).rows;
  if (people.length !== ids.length) throw new BusinessError('One or more account owners do not exist.');
  for (const person of people) {
    if (person.branch_id !== branchId || person.agent_id !== agentId) {
      throw new BusinessError('Every owner must belong to the account’s branch and assigned agent.');
    }
    if (person.status !== 'active') throw new BusinessError('Every account owner must be an active approved customer.');
  }
  const ages = await first<{eligible: boolean}>(tx, `SELECT bool_and(
    EXTRACT(YEAR FROM age((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date,date_of_birth)) BETWEEN $2 AND $3
  ) AS eligible FROM customers WHERE id=ANY($1::integer[])`, [ids, rate.min_age, rate.max_age]);
  if (!ages.eligible) throw new BusinessError('An owner does not meet this savings product’s age limits.');
  return people;
}

export async function updateAccount(tx: Queryable, user: Staff, input: Input) {
  const current = await account(tx, input.id, true);
  requireAgent(user, current);
  requireActive(current);
  const rate = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id=$1', [current.rate_id]);
  const owners = await validateOwners(tx, input.owner_ids, current.branch_id, current.agent_id, rate);
  await queue(tx, user, 'account.update', current.id, current.branch_id,
    owners.map(person => person.full_name).join(', '), `Update owners of ${current.account_number}`,
    {owner_ids: owners.map(person => person.id), owner_names: owners.map(person => person.full_name)});
  return {message: 'Account ownership changes submitted for manager approval.'};
}

export async function closeAccount(tx: Queryable,user: Staff,input: Input) {
  const current = await account(tx,input.id,true); requireAgent(user,current);
  if (!['active', 'inactive'].includes(current.status)) throw new BusinessError('Only an open savings account can be closed.');
  await queue(tx,user,'account.close',current.id,current.branch_id,'',`Close savings account ${current.account_number}`,{reason:requiredText(input.reason,'Reason',300)});
  return {message:'Account closure submitted for approval. Approval pays out its remaining balance.'};
}

export async function accountStatus(tx: Queryable,user: Staff,input: Input) {
  const current = await account(tx,input.id,true); requireAgent(user,current);
  const status = requiredText(input.status,'Status');
  if (!['active','inactive'].includes(status) || !['active','inactive'].includes(current.status) || status===current.status) throw new BusinessError('Choose a different active or inactive status.');
  await queue(tx,user,'account.status',current.id,current.branch_id,'',`${status==='active'?'Reactivate':'Deactivate'} savings account ${current.account_number}`,{status,reason:requiredText(input.reason,'Reason',300)});
  return {message:'Account status change submitted for approval.'};
}

export async function createFixedDeposit(tx: Queryable,user: Staff,input: Input) {
  const source = await account(tx,input.source_account_id,true); requireAgent(user,source); requireActive(source);
  const principal = money(input.principal,'Principal');
  const rate = await first<RateRow>(tx,'SELECT * FROM rates WHERE id=$1 AND product=\'fixed\'',[positiveId(input.rate_id)]);
  if (Number(principal)<Number(rate.minimum_balance)) throw new BusinessError(`The minimum fixed deposit is LKR ${rate.minimum_balance}.`);
  const available = await first<{allowed:boolean}>(tx,'SELECT balance-$1::numeric>=minimum_balance AS allowed FROM savings_accounts WHERE id=$2',[principal,source.id]);
  if (!available.allowed) throw new BusinessError('Insufficient savings funds after preserving the minimum balance.');
  const fd = await first<{id:number}>(tx,`INSERT INTO fixed_deposits(fd_number,source_account_id,rate_id,principal,annual_rate,term_months,auto_renew,maturity_date)
    VALUES($1,$2,$3,$4,$5,$6::integer,$7,(CURRENT_DATE+($6::integer||' months')::interval)::date) RETURNING id`,
    [reference('FD'),source.id,rate.id,principal,rate.annual_rate,rate.term_months,input.auto_renew===true]);
  await queue(tx,user,'fd.create',fd.id,source.branch_id,'',`Open ${rate.term_months}-month fixed deposit of LKR ${principal}`,{principal,source_account_id:source.id});
  return {message:'Fixed deposit submitted for approval. Principal is debited from savings on approval.'};
}

export async function closeFixedDeposit(tx: Queryable,user: Staff,input: Input) {
  const fd = await first<DepositRow>(tx,'SELECT * FROM fixed_deposits WHERE id=$1 FOR UPDATE',[positiveId(input.id)]);
  const source = await account(tx,fd.source_account_id); requireAgent(user,source);
  if (fd.status!=='active') throw new BusinessError('Only an active fixed deposit can be closed.');
  await queue(tx,user,'fd.close',fd.id,source.branch_id,'',`Close fixed deposit and return LKR ${fd.principal} principal`,{reason:requiredText(input.reason,'Reason',300)});
  return {message:'Fixed deposit closure submitted for approval.'};
}

export async function applyAccountApproval(tx: Queryable, user: Staff, approval: ApprovalRow): Promise<void> {
  const id = approval.entity_id;
  const proposed = approval.payload;
  switch (approval.type) {
    case 'account.create': {
      const current = await account(tx, id, true);
      if (current.status !== 'pending') throw new BusinessError('This account is no longer awaiting approval.');
      await requireActiveOwners(tx, id);
      await tx.query(`UPDATE savings_accounts SET status='active',opened_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
      const op = await operation(tx, user, 'deposit', 'Approved account opening cash deposit', `approval-${approval.id}`);
      await postEntry(tx, op.id, id, money(proposed.opening_balance), 'deposit');
      break;
    }
    case 'account.update': {
      const current = await account(tx, id, true);
      requireActive(current);
      const rate = await first<RateRow>(tx, 'SELECT * FROM rates WHERE id=$1', [current.rate_id]);
      const owners = await validateOwners(tx, proposed.owner_ids, current.branch_id, current.agent_id, rate);
      // Replace only the junction rows. Balance, product and ledger stay attached
      // to the account, so joint ownership never duplicates the money.
      await tx.query('DELETE FROM customer_accounts WHERE account_id=$1', [id]);
      for (const owner of owners) {
        await tx.query('INSERT INTO customer_accounts(customer_id,account_id) VALUES($1,$2)', [owner.id, id]);
      }
      break;
    }
    case 'account.close': {
      const current = await account(tx, id, true);
      if (!['active', 'inactive'].includes(current.status)) throw new BusinessError('Only an open savings account can be closed.');
      await requireNoFixedDeposit(tx, id);
      // Settle completed days before paying out the account. This includes any
      // monthly interest not yet posted by the month-end maintenance job.
      await settleSavingsOnClosure(tx, user, current);
      const balance = await first<{balance: string}>(tx, 'SELECT balance FROM savings_accounts WHERE id=$1', [id]);
      if (Number(balance.balance) > 0) {
        const op = await operation(tx, user, 'account_close', 'Approved account closure: cash paid to owner', `approval-${approval.id}`);
        await postEntry(tx, op.id, id, `-${balance.balance}`, 'account_close');
      }
      await tx.query(`UPDATE savings_accounts SET status='closed',closed_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
      break;
    }
    case 'account.status': {
      const current = await account(tx, id, true);
      if (!['active', 'inactive'].includes(current.status)) throw new BusinessError('This account cannot change status.');
      if (proposed.status === 'inactive') await requireNoFixedDeposit(tx, id);
      else await requireActiveOwners(tx, id);
      await tx.query('UPDATE savings_accounts SET status=$1 WHERE id=$2', [proposed.status, id]);
      break;
    }
    case 'fd.create': {
      const snapshot = await first<DepositRow>(tx, 'SELECT * FROM fixed_deposits WHERE id=$1', [id]);
      const source = await account(tx, snapshot.source_account_id, true);
      const fd = await first<DepositRow>(tx, 'SELECT * FROM fixed_deposits WHERE id=$1 FOR UPDATE', [id]);
      requireActive(source);
      if (fd.status !== 'pending') throw new BusinessError('This fixed deposit is no longer awaiting approval.');
      const available = await first<{allowed: boolean}>(tx, `SELECT balance-$1::numeric>=minimum_balance AS allowed
        FROM savings_accounts WHERE id=$2`, [fd.principal, source.id]);
      if (!available.allowed) throw new BusinessError('Savings funds changed: principal would violate the minimum balance.');
      const op = await operation(tx, user, 'fd_open', 'Approved fixed deposit funding', `approval-${approval.id}`);
      await postEntry(tx, op.id, source.id, `-${fd.principal}`, 'fd_open');
      await tx.query(`UPDATE fixed_deposits SET status='active',opened_at=CURRENT_TIMESTAMP,
        maturity_date=((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Colombo')::date+(term_months||' months')::interval)::date
        WHERE id=$1`, [id]);
      break;
    }
    case 'fd.close': {
      const snapshot = await first<DepositRow>(tx, 'SELECT * FROM fixed_deposits WHERE id=$1', [id]);
      const source = await account(tx, snapshot.source_account_id, true);
      const fd = await first<DepositRow>(tx, 'SELECT * FROM fixed_deposits WHERE id=$1 FOR UPDATE', [id]);
      if (fd.status !== 'active') throw new BusinessError('This fixed deposit is no longer active.');
      if (!['active', 'inactive'].includes(source.status)) throw new BusinessError('Its linked savings account must remain open.');
      const dates = await businessDates(tx);
      // Premature closure returns principal with earned interest through the last
      // completed day. No penalty is invented where the SRS provides no amount.
      await settleFixedDeposit(tx, user, fd, dates.today);
      const op = await operation(tx, user, 'fd_close', 'Approved fixed deposit closure: principal returned', `approval-${approval.id}`);
      await postEntry(tx, op.id, source.id, fd.principal, 'fd_close');
      await tx.query(`UPDATE fixed_deposits SET status='closed',auto_renew=false,closed_at=CURRENT_TIMESTAMP,
        payout_date=$1::date WHERE id=$2`, [dates.today, id]);
      break;
    }
    default: throw new BusinessError('Unsupported approval request.');
  }
}

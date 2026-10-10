'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus } from 'lucide-react';
import type { ModuleProps } from '@/lib/types';
import { date, formValues, money } from '@/lib/format';
import { Badge, DataTable, Field, FormModal, Notice, Panel, SectionHeading } from './ui';

type TransactionType = 'deposit' | 'withdrawal' | 'transfer';

export function Transactions({ data, onAction }: ModuleProps) {
  const [kind, setKind] = useState<TransactionType | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const canPost = data.user.role === 'agent';
  const activeAccounts = data.accounts.filter(account => account.status === 'active');
  const assignedAccounts = activeAccounts.filter(account => account.agent_id === data.user.id);

  function open(type: TransactionType) {
    setKind(type);
    setSourceId('');
    // Keep this key until the form closes. Retrying a request cannot move money twice.
    setIdempotencyKey(crypto.randomUUID());
  }

  async function submit(form: HTMLFormElement) {
    const values = formValues(form);
    await onAction({
      action: 'transaction.create',
      type: kind,
      account_id: Number(values.account_id),
      destination_account_id: kind === 'transfer' ? Number(values.destination_account_id) : undefined,
      amount: values.amount,
      description: values.description,
      verified_customer_id:kind==='deposit'?undefined:Number(values.verified_customer_id),
      verification_method:kind==='deposit'?undefined:values.verification_method,
      idempotency_key: idempotencyKey,
    });
  }

  return (
    <>
      <SectionHeading
        title="Transactions"
        description="Record deposits, withdrawals and transfers with a traceable ledger entry."
        action={canPost && (
          <button className="button button-primary" onClick={() => open('deposit')}>
            <Plus size={18} />New transaction
          </button>
        )}
      />
      {canPost ? (
        <div className="quick-actions">
          <button onClick={() => open('deposit')}>
            <span className="action-icon green"><ArrowDownLeft size={23} /></span>
            <span><strong>Cash deposit</strong><small>Add funds to a savings account</small></span>
            <ArrowUpRight size={18} />
          </button>
          <button onClick={() => open('withdrawal')}>
            <span className="action-icon amber"><ArrowUpRight size={23} /></span>
            <span><strong>Cash withdrawal</strong><small>Verify the owner and disburse funds</small></span>
            <ArrowUpRight size={18} />
          </button>
          <button onClick={() => open('transfer')}>
            <span className="action-icon blue"><ArrowLeftRight size={23} /></span>
            <span><strong>Account transfer</strong><small>Move funds between savings accounts</small></span>
            <ArrowUpRight size={18} />
          </button>
        </div>
      ) : <Notice>Assigned agents post transactions. Your role can inspect the ledger below.</Notice>}

      <Panel title="Transaction ledger" subtitle="Successful postings appear here after the database commits them">
        <DataTable
          rows={data.transactions}
          search={transaction => `${transaction.reference} ${transaction.account_number} ${transaction.customer_name} ${transaction.description}`}
          filters={[{ key: 'type', label: 'types', value: transaction => transaction.type }]}
          exportName="btrust-transactions.csv"
          columns={[
            { key: 'reference', label: 'Reference / Date', render: transaction => <div className="stack"><strong className="mono">{transaction.reference}</strong><small>{date(transaction.created_at)}</small></div> },
            { key: 'account', label: 'Account / Customer', render: transaction => <div className="stack"><span className="mono">{transaction.account_number}</span><small>{transaction.customer_name}</small></div> },
            { key: 'type', label: 'Type', render: transaction => <Badge value={transaction.type} /> },
            { key: 'amount', label: 'Amount', className: 'align-right', render: transaction => <strong>{money(transaction.amount)}</strong> },
            { key: 'balance', label: 'Balance after', className: 'align-right', render: transaction => money(transaction.balance_after) },
            { key: 'description', label: 'Description', render: transaction => <span className="truncate" title={transaction.description}>{transaction.description}</span> },
          ]}
        />
      </Panel>

      {kind && (
        <FormModal
          title={kind === 'deposit' ? 'Record a cash deposit' : kind === 'withdrawal' ? 'Record a cash withdrawal' : 'Transfer between accounts'}
          description="Verify the account and amount before posting. Successful transactions cannot be edited."
          onClose={() => setKind(null)}
          submitLabel={kind === 'transfer' ? 'Post transfer' : 'Post transaction'}
          onSubmit={submit}
        >
          <Field label={`${kind === 'transfer' ? 'Source account' : 'Savings account'} *`} help="Only active accounts assigned to you are listed." wide>
            <select name="account_id" required value={sourceId} onChange={event => setSourceId(event.target.value)}>
              <option value="">Select an account</option>
              {assignedAccounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.account_number} · {account.owner_names || account.customer_name} · {money(account.balance)}
                </option>
              ))}
            </select>
          </Field>
          {kind === 'transfer' && (
            <Field label="Destination account *" wide>
              <select name="destination_account_id" required>
                <option value="">Select destination</option>
                {activeAccounts.filter(account => account.id !== Number(sourceId)).map(account => (
                  <option key={account.id} value={account.id}>{account.account_number} · {account.owner_names || account.customer_name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Amount (LKR) *" wide>
            <input type="number" name="amount" min="0.01" step="0.01" required placeholder="0.00" />
          </Field>
          {kind!=='deposit' && <>
            <Field label="Verified account owner *">
              <select name="verified_customer_id" required defaultValue="">
                <option value="" disabled>Select the customer present</option>
                {data.customers.filter(customer=>assignedAccounts.find(a=>String(a.id)===sourceId)?.owner_ids?.includes(customer.id)).map(customer=><option key={customer.id} value={customer.id}>{customer.full_name}</option>)}
              </select>
            </Field>
            <Field label="Identity document checked *">
              <select name="verification_method" required defaultValue="">
                <option value="" disabled>Select verification method</option>
                <option value="nic-in-person">NIC checked in person</option>
                <option value="passport-in-person">Passport checked in person</option>
              </select>
            </Field>
          </>}
          <Field label="Description / reference *" wide>
            <textarea name="description" required minLength={3} maxLength={250} rows={2} placeholder="Purpose of this transaction" />
          </Field>
          {kind !== 'deposit' && (
            <label className="checkbox-row field-wide">
              <input type="checkbox" name="owner_verified" required />
              <span>I have verified the account owner’s identity and physical presence.</span>
            </label>
          )}
          <div className="field-wide">
            <Notice>
              {kind === 'deposit'
                ? 'The deposited amount will be added to the account balance.'
                : 'The source account must retain its minimum balance. The transfer or withdrawal is saved in one transaction.'}
            </Notice>
          </div>
        </FormModal>
      )}
    </>
  );
}

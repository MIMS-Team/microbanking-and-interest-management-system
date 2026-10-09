'use client';

import { useState } from 'react';
import { CalendarClock, CircleDollarSign, Pencil } from 'lucide-react';
import type { ModuleProps, Rate } from '@/lib/types';
import { businessDate, date, formValues, money, number } from '@/lib/format';
import { DataTable, Field, FormModal, Notice, Panel, SectionHeading } from './ui';

type MaintenanceTask = 'monthly' | 'daily' | 'maturity' | 'inactivity';

export function Interest({ data, onAction }: ModuleProps) {
  const [task, setTask] = useState<MaintenanceTask | null>(null);
  const [editing, setEditing] = useState<Rate | null>(null);
  const canRun = ['manager', 'higher_manager', 'admin'].includes(data.user.role);
  const canSetRates = data.user.role === 'admin';
  const today = businessDate();
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const lastMonth = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
  const completedMonth = lastMonth.toISOString().slice(0, 7);

  async function process(form: HTMLFormElement) {
    const values = formValues(form);
    const action = {
      monthly: 'interest.run', daily: 'interest.accrue',
      maturity: 'fd.processMaturities', inactivity: 'account.processInactivity',
    }[task!];
    await onAction({ action, ...values });
  }

  return (
    <>
      <SectionHeading title="Interest Management" description="Maintain product rates and process savings and fixed deposit interest." action={canRun && (
        <button className="button button-primary" onClick={() => setTask('monthly')}><CalendarClock size={18} />Run monthly interest</button>
      )} />
      <div className="split-layout">
        <Panel title="Current product rates" subtitle="Annual rates and minimum balances">
          <div className="rate-list">{data.rates.map(rate => (
            <div key={rate.id}>
              <span className="metric-icon blue"><CircleDollarSign size={21} /></span>
              <div><strong>{rate.name}</strong><small>{rate.product === 'savings' ? `Ages ${rate.min_age}–${rate.max_age}` : `${rate.term_months}-month term`} · Minimum {money(rate.minimum_balance)}</small></div>
              <strong className="rate-value">{Number(rate.annual_rate).toFixed(2)}<span>%</span></strong>
              {canSetRates && <button className="icon-button" aria-label={`Edit ${rate.name} rate`} onClick={() => setEditing(rate)}><Pencil size={16} /></button>}
            </div>
          ))}</div>
        </Panel>
        <Panel title="Interest and account processing" subtitle={data.user.role === 'manager' ? 'Applies to your branch' : 'Applies across accessible branches'}>
          <div className="panel-content">
            <div className="process-step"><span>1</span><div><strong>Accumulate daily savings interest</strong><p>Each completed day uses its lowest balance and the rate effective that day. Daily interest is retained until monthly posting.</p></div></div>
            <div className="process-step"><span>2</span><div><strong>Post a completed month</strong><p>Credit savings interest and eligible fixed deposit interest to the linked savings accounts. Repeating a run cannot duplicate credits.</p></div></div>
            <div className="process-step"><span>3</span><div><strong>Process maturity and inactivity</strong><p>Pay out or renew matured deposits. Mark accounts inactive after the chosen number of days without customer transactions.</p></div></div>
            {canRun && <div className="maintenance-actions">
              <button className="button button-secondary" onClick={() => setTask('daily')}>Accrue daily interest</button>
              <button className="button button-secondary" onClick={() => setTask('maturity')}>Process FD maturities</button>
              <button className="button button-secondary" onClick={() => setTask('inactivity')}>Review inactivity</button>
            </div>}
          </div>
        </Panel>
      </div>
      <Panel title="Interest run history" subtitle="Monthly savings and fixed deposit postings">
        <DataTable rows={data.interestRuns} search={run => run.period} exportName="btrust-interest-runs.csv" columns={[
          { key: 'period', label: 'Period', render: run => <strong>{run.period}</strong> },
          { key: 'accounts', label: 'Accounts credited', render: run => number(run.account_count) },
          { key: 'amount', label: 'Total interest', className: 'align-right', render: run => money(run.total_interest) },
          { key: 'date', label: 'Processed on', render: run => date(run.created_at) },
        ]} />
      </Panel>
      {task && <FormModal title={{ monthly: 'Process monthly interest', daily: 'Accrue daily savings interest', maturity: 'Process fixed deposit maturities', inactivity: 'Review account inactivity' }[task]} onClose={() => setTask(null)} submitLabel="Run processing" onSubmit={process}>
        {task === 'monthly' && <Field label="Completed month *" wide><input type="month" name="period" required max={completedMonth} defaultValue={completedMonth} /></Field>}
        {task === 'daily' && <Field label="Accrue through *" wide><input type="date" name="through_date" required min="2000-01-01" max={yesterday.toISOString().slice(0, 10)} defaultValue={yesterday.toISOString().slice(0, 10)} /></Field>}
        {task === 'inactivity' && <Field label="Days without customer transactions *" wide><input type="number" name="days" required min="30" max="3650" step="1" defaultValue="180" /></Field>}
        <div className="field-wide"><Notice>{
          task === 'monthly' ? 'Interest is posted only for a completed month. Existing credits are preserved on repeated runs.' :
          task === 'daily' ? 'This records daily accruals without adding them to spendable savings balances.' :
          task === 'maturity' ? 'Matured deposits return principal to savings or begin a new term when auto-renewal is enabled. Unposted interest is settled.' :
          'Accounts with an active or pending fixed deposit are excluded. Interest postings do not count as customer activity.'
        }</Notice></div>
      </FormModal>}
      {editing && <FormModal title="Update product rate" description={editing.name} onClose={() => setEditing(null)} submitLabel="Update rate" onSubmit={async form => {
        await onAction({ action: 'rate.update', id: editing.id, ...formValues(form) });
      }}>
        <Field label="Annual rate (%) *"><input name="annual_rate" type="number" required min="0" max="100" step="0.001" defaultValue={editing.annual_rate} /></Field>
        <Field label="Minimum balance / principal (LKR) *"><input name="minimum_balance" type="number" required min="0" step="0.01" defaultValue={editing.minimum_balance} /></Field>
        <div className="field-wide"><Notice>Savings rate changes take effect tomorrow. Existing accounts retain their agreed minimum balance, and existing fixed deposits retain their agreed annual rate.</Notice></div>
      </FormModal>}
    </>
  );
}

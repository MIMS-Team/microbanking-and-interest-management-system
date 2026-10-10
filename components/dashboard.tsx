'use client';

import { ArrowDownLeft, ArrowRight, ArrowUpRight, Building2, Clock3, Landmark, Users, WalletCards } from 'lucide-react';
import type { Bootstrap, ModuleName } from '@/lib/types';
import { date, initials, label, money, number } from '@/lib/format';
import { Badge, EmptyState, Metric, Panel, SectionHeading } from './ui';

export function Dashboard({ data, navigate }: { data: Bootstrap; navigate: (module: ModuleName) => void }) {
  const pending = data.approvals.filter(approval => approval.status === 'pending');
  const totalDeposits = Number(data.metrics.savings_balance) + Number(data.metrics.fixed_deposit_balance);
  const savingsShare = totalDeposits ? Number(data.metrics.savings_balance) / totalDeposits * 100 : 0;
  return (
    <>
      <SectionHeading
        title={`Welcome back, ${data.user.full_name.split(' ')[0]}`}
        description="Your branch, your customers and the day’s banking activity at a glance."
        action={<span className="date-pill"><CalendarDate />{date(new Date().toISOString())}</span>}
      />
      <div className="welcome-banner">
        <div><span className="eyebrow">B-TRUST BANK · OPERATIONS OVERVIEW</span><h2>Better banking starts with a clear view.</h2><p>Keep customer relationships and everyday operations moving forward.</p></div>
        <span className="banner-bank"><Landmark size={66} strokeWidth={1.2} /></span>
      </div>
      <div className="metrics-grid">
        <Metric title="Total customers" value={number(data.metrics.total_customers)} subtitle="Registered in your accessible branches" icon={<Users size={20} />} />
        <Metric title="Savings balance" value={money(data.metrics.savings_balance)} subtitle={`${data.metrics.active_accounts} active savings accounts`} icon={<WalletCards size={20} />} accent="green" />
        <Metric title="Fixed deposit principal" value={money(data.metrics.fixed_deposit_balance)} subtitle="Principal in active term deposits" icon={<Landmark size={20} />} accent="purple" />
        <Metric title="Pending approvals" value={number(data.metrics.pending_approvals)} subtitle="Requests waiting for review" icon={<Clock3 size={20} />} accent="amber" />
      </div>
      <div className="dashboard-grid">
        <Panel title="Recent transactions" subtitle={`${data.metrics.today_transactions} transactions recorded today`} action={<button className="text-button" onClick={() => navigate('Transactions')}>View ledger<ArrowRight size={15} /></button>}>
          <div className="activity-list">
            {data.transactions.slice(0, 5).map(transaction => (
              <div key={transaction.id}>
                <span className={`activity-icon ${['withdrawal', 'transfer_out', 'fd_open'].includes(transaction.type) ? 'amber' : 'green'}`}>
                  {['withdrawal', 'transfer_out', 'fd_open'].includes(transaction.type) ? <ArrowUpRight size={19} /> : <ArrowDownLeft size={19} />}
                </span>
                <div><strong>{transaction.customer_name}</strong><small>{label(transaction.type)} · {transaction.account_number}</small></div>
                <div className="align-right"><strong>{money(transaction.amount)}</strong><small>{date(transaction.created_at)}</small></div>
              </div>
            ))}
            {!data.transactions.length && <EmptyState title="No transactions yet" description="Posted deposits, withdrawals and transfers will appear here." />}
          </div>
        </Panel>
        <Panel title="Deposit portfolio" subtitle="Balances from the current account register">
          <div className="portfolio-card">
            <small>Total savings and FD principal</small><strong>{money(totalDeposits)}</strong>
            <div className="portfolio-bar" role="img" aria-label={`Savings ${savingsShare.toFixed(1)} percent, fixed deposits ${(100 - savingsShare).toFixed(1)} percent`}><span style={{ width: `${savingsShare}%` }} /></div>
            <div className="portfolio-legend"><span><i />Savings accounts</span><strong>{money(data.metrics.savings_balance)}</strong></div>
            <div className="portfolio-legend"><span><i className="purple-dot" />Fixed deposits</span><strong>{money(data.metrics.fixed_deposit_balance)}</strong></div>
            <button className="button button-secondary full-width" onClick={() => navigate('Savings Accounts')}>View account register<ArrowRight size={16} /></button>
          </div>
        </Panel>
        <Panel title="Approval attention" subtitle="Latest requests awaiting a decision" action={<button className="text-button" onClick={() => navigate('Approvals')}>View all<ArrowRight size={15} /></button>}>
          <div className="activity-list">
            {pending.slice(0, 4).map(approval => (
              <div key={approval.id}><span className="activity-icon amber"><Clock3 size={19} /></span><div><strong>{label(approval.type)}</strong><small>{approval.summary}</small></div><Badge value="pending" /></div>
            ))}
            {!pending.length && <EmptyState title="All caught up" description="There are no pending requests in your accessible branches." />}
          </div>
        </Panel>
        <Panel title="Your workspace" subtitle="Your access and branch context">
          <div className="workspace-card"><span className="avatar avatar-large">{initials(data.user.full_name)}</span><div><h3>{data.user.full_name}</h3><p>{label(data.user.role)}</p></div></div>
          <div className="workspace-details"><div><Building2 size={17} /><span>{data.user.branch_name || 'All branches'}</span></div><div><Users size={17} /><span>{data.staff.length} staff in accessible branches</span></div><button className="text-button" onClick={() => navigate('Customers')}>Go to customer directory<ArrowRight size={16} /></button></div>
        </Panel>
      </div>
    </>
  );
}

function CalendarDate() { return <span aria-hidden="true">◷</span>; }

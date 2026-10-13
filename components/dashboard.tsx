'use client';

import { ArrowDownLeft, ArrowRight, ArrowUpRight, Calendar, Clock3, Landmark, Users, WalletCards } from 'lucide-react';
import type { Bootstrap, ModuleName } from '@/lib/types';
import { addMoney, date, label, money, number } from '@/lib/format';
import { Badge, EmptyState, Metric, Panel, SectionHeading } from './ui';

export function Dashboard({ data, navigate }: { data: Bootstrap; navigate: (module: ModuleName) => void }) {
  const pending = data.approvals.filter(approval => approval.status === 'pending');
  const totalDeposits = Number(data.metrics.savings_balance) + Number(data.metrics.fixed_deposit_balance);
  const savingsShare = totalDeposits ? Number(data.metrics.savings_balance) / totalDeposits * 100 : 0;
  const fixedDepositShare = totalDeposits ? 100 - savingsShare : 0;
  // This chart describes the loaded ledger sample, not an invented historical trend.
  const days = new Map<string, number>();
  for (const transaction of data.transactions) {
    const day = date(transaction.created_at);
    days.set(day, (days.get(day) || 0) + 1);
  }
  const activity = Array.from(days).reverse().slice(-7);
  const peak = Math.max(1, ...activity.map(([, count]) => count));
  const mayReview = data.permissions?.includes('approval.review') === true;
  return <>
    <SectionHeading title="Overview" description={`Welcome back, ${data.user.full_name.split(' ')[0]}. Here’s your banking workspace today.`}
      action={<><span className="date-pill"><Calendar size={15} />{date(new Date().toISOString())}</span><button className="button button-primary" onClick={() => navigate('Customers')}><Users size={16} />View customers</button></>} />
    <div className="metrics-grid">
      <Metric title="Total customers" value={number(data.metrics.total_customers)} subtitle="In your accessible branches" icon={<Users size={19} />} />
      <Metric title="Savings balance" value={money(data.metrics.savings_balance)} subtitle={`${data.metrics.active_accounts} active savings accounts`} icon={<WalletCards size={19} />} accent="green" />
      <Metric title="Fixed deposits" value={money(data.metrics.fixed_deposit_balance)} subtitle="Principal in active term deposits" icon={<Landmark size={19} />} accent="purple" />
      <Metric title="Pending approvals" value={number(data.metrics.pending_approvals)} subtitle="Requests waiting for a decision" icon={<Clock3 size={19} />} accent="amber" />
    </div>
    <div className="overview-grid">
      <div className="overview-wide">
        <Panel title="Ledger activity" subtitle="Daily transaction counts in the current ledger sample" action={<span className="badge">{data.transactions.length} loaded entries</span>}>
          <div className="chart-summary"><strong>{number(data.metrics.today_transactions)}</strong><div><span>transactions today</span><small>Across your accessible branches</small></div></div>
          {activity.length ? <div className="activity-chart" role="img" aria-label={activity.map(([day,count]) => `${day}: ${count} transactions`).join('; ')}>
            <div className="chart-columns">{activity.map(([day,count]) => <div className="chart-column" key={day}><span>{count}</span><i style={{height: `${Math.max(8,count / peak * 160)}px`}} /><small>{day}</small></div>)}</div>
          </div> : <EmptyState title="Your ledger starts here" description="Transaction activity will appear after deposits, withdrawals or transfers are posted." />}
          <button className="card-footer-link" onClick={() => navigate('Transactions')}><span>Explore deposits, withdrawals and transfers</span><span>Open ledger<ArrowRight size={16} /></span></button>
        </Panel>
      </div>
      <Panel title="Deposit portfolio" subtitle="Current savings and fixed deposit principal">
        <div className="portfolio-card">
          <small>Total deposits</small><strong>{money(addMoney(data.metrics.savings_balance,data.metrics.fixed_deposit_balance))}</strong>
          <div className="portfolio-ring" role="img" aria-label={totalDeposits ? `Savings ${savingsShare.toFixed(1)} percent; fixed deposits ${fixedDepositShare.toFixed(1)} percent` : 'No deposits yet'} style={{background: totalDeposits ? `conic-gradient(var(--chart-blue) 0% ${savingsShare}%, var(--chart-lilac) ${savingsShare}% 100%)` : 'var(--border)'}}><div><strong>{totalDeposits ? savingsShare.toFixed(0)+'%' : '—'}</strong><span>{totalDeposits ? 'in savings' : 'No deposits'}</span></div></div>
          <div className="portfolio-legend"><span><i />Savings</span><strong>{money(data.metrics.savings_balance)}</strong></div>
          <div className="portfolio-legend"><span><i className="purple-dot" />Fixed deposits</span><strong>{money(data.metrics.fixed_deposit_balance)}</strong></div>
        </div>
        <button className="card-footer-link" onClick={() => navigate('Savings Accounts')}>View account register<ArrowRight size={16} /></button>
      </Panel>
      <div className="overview-wide">
        <Panel title="Recent transactions" subtitle="Latest entries in your accessible ledger" action={<button className="text-button" onClick={() => navigate('Transactions')}>View all<ArrowRight size={15} /></button>}>
          <div className="activity-list">
            {data.transactions.slice(0, 5).map(transaction => <div key={transaction.id}>
              <span className={`activity-icon ${['withdrawal','transfer_out','fd_open'].includes(transaction.type) ? 'amber' : 'green'}`}>{['withdrawal','transfer_out','fd_open'].includes(transaction.type) ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}</span>
              <div className="activity-person"><strong>{transaction.customer_name}</strong><small>{label(transaction.type)} · {transaction.account_number}</small></div>
              <div className="align-right"><strong>{money(transaction.amount)}</strong><small>{date(transaction.created_at)}</small></div>
            </div>)}
            {!data.transactions.length && <EmptyState title="No transactions yet" description="Posted deposits, withdrawals and transfers will appear here." />}
          </div>
        </Panel>
      </div>
      <Panel title="Approval attention" subtitle="Loaded requests awaiting a decision" action={mayReview && <button className="text-button" onClick={() => navigate('Approvals')}>Review<ArrowRight size={15} /></button>}>
        <div className="activity-list approval-list">
          {pending.slice(0, 4).map(approval => <div key={approval.id}><span className="activity-icon amber"><Clock3 size={18} /></span><div className="activity-person"><strong>{label(approval.type)}</strong><small>{approval.summary}</small></div><Badge value="pending" /></div>)}
          {!pending.length && <EmptyState title="All caught up" description="No pending requests in the current approval sample." />}
        </div>
      </Panel>
    </div>
  </>;
}

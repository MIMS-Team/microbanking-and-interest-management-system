/** The browser's view of SQL query results. Money remains a decimal string. */
export type Role = 'agent' | 'manager' | 'higher_manager' | 'admin';
export type Money = string | number;
export interface Staff { id: number; full_name: string; email: string; role: Role; branch_id: number | null; branch_name?: string; status: string; }
export interface Branch { id: number; name: string; code: string; address: string; phone: string; email?: string; status?: string; }
export interface Customer { id: number; customer_number: string; full_name: string; nic: string; date_of_birth: string; address: string; mobile: string; landline: string; email: string; branch_id: number; branch_name: string; agent_id: number; agent_name: string; status: string; created_at: string; account_count: number; total_balance: Money; }
export interface Account { id: number; account_number: string; customer_id?: number; customer_name: string; owner_ids: number[]; owner_names?: string; branch_name: string; branch_id: number; agent_id: number; rate_id: number; minimum_balance: Money; balance: Money; annual_rate: Money; status: string; opened_at: string; }
export interface FixedDeposit { id: number; fd_number: string; customer_id: number; customer_name: string; source_account_id: number; principal: Money; annual_rate: Money; term_months: number; opened_at: string; maturity_date: string; maturity_amount: Money; status: string; auto_renew: boolean; }
export interface Transaction { id: number; reference: string; account_id: number; account_number: string; customer_name: string; type: string; amount: Money; signed_amount: Money; balance_after: Money; description: string; created_at: string; }
export interface Approval { id: number; type: string; entity_id: number; branch_id: number | null; customer_name?: string; summary: string; status: string; requested_by: number; requested_by_name: string; created_at: string; reviewed_by_name?: string; notes?: string; payload?: Record<string, unknown>; }
export interface Rate { id: number; product: string; name: string; term_months: number | null; annual_rate: Money; minimum_balance: Money; min_age: number; max_age: number; }
export interface InterestRun { id: number; period: string; account_count: number; total_interest: Money; created_at: string; }
export interface AuditEntry { id: number; action: string; entity_type: string; entity_id: number; actor_name: string; created_at: string; details?: unknown; }
export interface Metrics { total_customers: number; active_accounts: number; savings_balance: Money; fixed_deposit_balance: Money; pending_approvals: number; today_transactions: number; }
export interface Bootstrap { user: Staff; branches: Branch[]; staff: Staff[]; customers: Customer[]; accounts: Account[]; fixedDeposits: FixedDeposit[]; transactions: Transaction[]; approvals: Approval[]; interestRuns: InterestRun[]; rates: Rate[]; metrics: Metrics; auditLog: AuditEntry[]; }
export type ActionPayload = { action: string; [key: string]: unknown };
export type RunAction = (payload: ActionPayload) => Promise<void>;
export interface ModuleProps { data: Bootstrap; onAction: RunAction; }
export type ModuleName = 'Dashboard' | 'Customers' | 'Savings Accounts' | 'Fixed Deposits' | 'Transactions' | 'Approvals' | 'Interest' | 'Reports' | 'Branches & Staff';

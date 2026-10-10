// Explicit, versioned adoption of inspected legacy MySQL columns and balances.
export async function upgradeColumns(c,openingBalanceActorId) {
  const columns = {
    otp_challenges: {is_pending:'TINYINT(1) NOT NULL DEFAULT 0'},
    staff: {version:'INT NOT NULL DEFAULT 0', must_change_password:'BOOLEAN NOT NULL DEFAULT FALSE', temporary_password_expires_at:'DATETIME NULL'},
    branches: {version:'INT NOT NULL DEFAULT 0'},
    customers: {version:'INT NOT NULL DEFAULT 0'},
    rates: {minimum_deposit:'DECIMAL(14,2) NOT NULL DEFAULT 0', available:'BOOLEAN NOT NULL DEFAULT TRUE', effective_from:'DATE NULL', effective_to:'DATE NULL'},
    savings_accounts: {version:'INT NOT NULL DEFAULT 0', inactive_at:'DATETIME NULL', status_reason:'VARCHAR(500) NULL'},
    fixed_deposits: {version:'INT NOT NULL DEFAULT 0', status_reason:'VARCHAR(500) NULL', active_source_id:"INT GENERATED ALWAYS AS (CASE WHEN status='active' THEN source_account_id ELSE NULL END) STORED"},
    customer_accounts: {owner_slot:'TINYINT NULL'},
    approvals: {customer_id:'INT NULL', account_id:'INT NULL', fixed_deposit_id:'INT NULL', employee_id:'INT NULL', target_branch_id:'INT NULL', target_version:'INT NULL', intended_approver_id:'INT NULL', authority:"VARCHAR(20) NOT NULL DEFAULT 'manager'", expires_at:'DATETIME NULL'},
    money_operations: {verified_customer_id:'INT NULL', verification_method:'VARCHAR(40) NULL'},
    employee_sessions: {revocation_reason:'VARCHAR(40) NULL'},
    interest_runs: {scope_id:'INT GENERATED ALWAYS AS (COALESCE(branch_id,0)) STORED'},
    interest_credits: {savings_scope:'INT GENERATED ALWAYS AS (CASE WHEN fixed_deposit_id IS NULL THEN account_id ELSE NULL END) STORED'},
  };
  for (const [table, definitions] of Object.entries(columns)) {
    const [present] = await c.query('SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
    for (const [name,definition] of Object.entries(definitions)) {
      if (!present.some(col=>col.COLUMN_NAME===name)) await c.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
    }
  }
  // Older authentication-only installations required a branch for every role.
  // The role/branch CHECK below keeps agents/managers assigned while allowing
  // institution-wide administrators and higher managers to have no branch.
  await c.query('ALTER TABLE staff MODIFY branch_id INT NULL');
  // Preserve legacy FD product values under their correct meaning.
  await c.query("UPDATE rates SET minimum_deposit=minimum_balance WHERE product='fixed' AND minimum_deposit=0");
  await c.query(`UPDATE customer_accounts ca JOIN (
    SELECT customer_id,account_id,ROW_NUMBER() OVER(PARTITION BY account_id ORDER BY customer_id) AS slot
    FROM customer_accounts) ranked ON ranked.customer_id=ca.customer_id AND ranked.account_id=ca.account_id
    SET ca.owner_slot=ranked.slot WHERE ca.owner_slot IS NULL`);
  const [[invalid]] = await c.query(`SELECT COUNT(*) AS n FROM customer_accounts WHERE owner_slot NOT BETWEEN 1 AND 4`);
  if (Number(invalid.n)) throw new Error('Existing account has more than four owners; explicit reviewed repair required.');
  // Old insert-only triggers are replaced by unique constraints and locked services.
  await c.query('DROP TRIGGER IF EXISTS trg_max_four_joint_owners');
  await c.query('DROP TRIGGER IF EXISTS trg_one_live_fd_per_account');
  // Conflicting legacy hashes must not silently change a credential.
  const [[conflict]] = await c.query('SELECT COUNT(*) AS n FROM staff s JOIN staff_authentication a ON a.employee_id=s.id WHERE BINARY s.password_hash<>BINARY a.password_hash');
  if (Number(conflict.n)) throw new Error('Conflicting legacy credential hashes: reconcile explicitly before migration.');
  for(const [prefix,table,column] of [['customer','customers','customer_id'],['account','savings_accounts','account_id'],['fd','fixed_deposits','fixed_deposit_id'],['staff','staff','employee_id'],['branch','branches','target_branch_id'],['agent','staff','employee_id']]) {
    await c.query(`UPDATE approvals a JOIN ${table} t ON t.id=a.entity_id SET a.${column}=a.entity_id,a.target_version=t.version WHERE a.type LIKE ?`,[prefix+'.%']);
  }
  await c.query("UPDATE approvals SET authority='higher_manager' WHERE type LIKE 'staff.%' OR type LIKE 'branch.%' OR type='agent.reassign'");
  const [balances]=await c.query(`SELECT a.id,a.balance,COALESCE(SUM(l.amount),0) AS movements,COUNT(l.id) AS entries FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(SUM(l.amount),0)`);
  if(balances.some(a=>Number(a.entries)>0)) throw new Error('Existing ledger does not reconcile. Explicit reviewed financial repair required.');
  if(balances.length) {
    const [[actor]]=await c.query("SELECT id FROM staff WHERE id=? AND status='active' AND role='higher_manager'",[openingBalanceActorId]);
    if(!actor) throw new Error('Legacy balances lack a ledger. Supply an explicitly reviewed openingBalanceActorId; no historical movements will be fabricated.');
    await c.beginTransaction();
    try {
      for(const a of balances) {
        const [op]=await c.query(`INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES(?,?,?,?, 'migration_opening','Imported balance baseline; earlier movements unavailable')`,['MIGRATION-'+a.id,actor.id,'migration-opening-'+a.id,String(a.balance)]);
        await c.query("INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after) VALUES(?,?,'migration_opening',?,0,?)",[op.insertId,a.id,a.balance,a.balance]);
        await c.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES(?,'migration.opening_balance','account',?,JSON_OBJECT('balance',?,'prior_history','unavailable'))",[actor.id,a.id,a.balance]);
      }
      await c.commit();
    } catch(error) {await c.rollback();throw error;}
  }
}

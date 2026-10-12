/** One calendar-month payout definition is shared by reports and account views. */
export function fdPeriods(scope=''){
  return `WITH RECURSIVE periods AS (
    SELECT f.id,CAST(DATE_FORMAT(f.opened_at+INTERVAL 330 MINUTE,'%Y-%m-01') AS DATE) AS starts,f.maturity_date
    FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id WHERE f.status='active' ${scope}
    UNION ALL SELECT id,DATE_ADD(starts,INTERVAL 1 MONTH),maturity_date FROM periods WHERE DATE_ADD(starts,INTERVAL 1 MONTH)<maturity_date)`;
}
export const nextFdPayout=`DATE_FORMAT(COALESCE((SELECT MIN(LEAST(DATE_ADD(p.starts,INTERVAL 1 MONTH),p.maturity_date)) FROM periods p WHERE p.id=f.id
  AND NOT EXISTS(SELECT 1 FROM interest_credits ic WHERE ic.fixed_deposit_id=f.id AND ic.period=DATE_FORMAT(p.starts,'%Y-%m'))),f.maturity_date),'%Y-%m-%d')`;

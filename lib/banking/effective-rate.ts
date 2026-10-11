import type { Queryable } from '../db';
import { BusinessError } from '../validation';

// UTC business instant. Callers choose the Colombo boundary; never use the
// editable product display value to price a contract or historical accrual.
export async function effectiveRate(tx: Queryable, rateId: number, at?: string): Promise<string> {
  const rows=(await tx.query<{annual_rate:string}>(`SELECT annual_rate FROM rate_history
    WHERE rate_id=$1 AND effective_at<=COALESCE($2,UTC_TIMESTAMP(3))
    ORDER BY effective_at DESC LIMIT 1`,[rateId,at??null])).rows;
  if(!rows.length) throw new BusinessError('Historical interest rates are missing; import approved rate history before pricing or accrual.',409);
  return rows[0].annual_rate;
}

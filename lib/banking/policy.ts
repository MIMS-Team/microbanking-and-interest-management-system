import type { Queryable } from '../db';
import { BusinessError } from '../validation';
import { first } from './shared';

export async function requireBusinessHours(tx: Queryable, branch: number) {
  const {allowed}=await first<{allowed:number}>(tx,`SELECT EXISTS(
    SELECT 1 FROM branch_hours h WHERE h.branch_id=$1
      AND h.weekday=WEEKDAY(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)
      AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)>=h.opens
      AND TIME(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)<h.closes
      AND NOT EXISTS(SELECT 1 FROM branch_holidays d WHERE d.branch_id=$1
        AND d.holiday=DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE))) AS allowed`,[branch]);
  if (!allowed) throw new BusinessError('The branch is closed or its business calendar has not been configured.',409);
}

export function requireInterestPolicy() {
  if (process.env.INTEREST_POLICY!=='daily-minimum-actual365-monthly-fd' || process.env.INACTIVE_INTEREST_POLICY!=='full-rate') {
    throw new BusinessError('Select approved interest conventions and inactive-account interest policy before processing.',409);
  }
}

export function moneyUnits(value: string): bigint {
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
}

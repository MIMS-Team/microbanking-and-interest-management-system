import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import pool from '@/lib/mysql';
import { financialQueryable } from '@/lib/banking/financial-db';
import { runInterest } from '@/lib/banking/interest';
import { errorResponse, HttpError } from '@/lib/http';
import type { Staff } from '@/lib/types';

export const runtime = 'nodejs';

function assertSchedulerAuthorization(request: Request): void {
  const expected = process.env.SCHEDULER_KEY ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(authorization);
  const supplied = match?.[1] ?? '';
  if (
    expected.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    throw new HttpError(403, 'A valid scheduler key is required.');
  }
}

export async function POST(request: Request) {
  try {
    assertSchedulerAuthorization(request);
    const userId = Number(process.env.SCHEDULER_USER_ID ?? 3);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new HttpError(500, 'Configure a valid scheduler user ID.');
    }

    const [users] = await pool.execute<Array<RowDataPacket & Staff>>(
      `SELECT id, full_name, email, role, branch_id, status
       FROM staff
       WHERE id = ? AND status = 'active' AND role IN ('admin', 'higher_manager')`,
      [userId],
    );
    const user = users[0];
    if (!user) {
      throw new HttpError(403, 'Configure an active administrator or higher manager as the scheduler user.');
    }

    const [periodRows] = await pool.execute<Array<RowDataPacket & { period: string; first_period: string | null }>>(
      `SELECT DATE_FORMAT(
         DATE_SUB(
           DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')),
           INTERVAL DAYOFMONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30')) DAY
         ),
         '%Y-%m'
       ) AS period,
       DATE_FORMAT(
         MIN(DATE(CONVERT_TZ(opened_at, '+00:00', '+05:30'))),
         '%Y-%m'
       ) AS first_period
       FROM savings_accounts`,
    );
    const period = periodRows[0]?.period;
    if (!period) throw new Error('Could not determine the last completed Colombo calendar month.');

    const connection = await pool.getConnection();
    const results: string[] = [];
    try {
      const earliestAccountPeriod = periodRows[0].first_period;
      if (!earliestAccountPeriod) {
        return NextResponse.json({ message: 'No savings accounts are eligible for interest.', periods: [] });
      }
      const firstPeriod = earliestAccountPeriod < '2000-01' ? '2000-01' : earliestAccountPeriod;
      const [firstYear, firstMonth] = firstPeriod.split('-').map(Number);
      const [lastYear, lastMonth] = period.split('-').map(Number);
      let year = firstYear;
      let month = firstMonth;
      while (year < lastYear || (year === lastYear && month <= lastMonth)) {
        const currentPeriod = `${year}-${String(month).padStart(2, '0')}`;
        await connection.beginTransaction();
        try {
          const result = await runInterest(financialQueryable(connection), user, { period: currentPeriod });
          await connection.commit();
          results.push(`${currentPeriod}: ${result.message}`);
        } catch (error) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            console.error('Failed to roll back the scheduled interest run.', rollbackError);
          }
          throw error;
        }
        month += 1;
        if (month === 13) {
          year += 1;
          month = 1;
        }
      }
      return NextResponse.json({ message: 'Scheduled interest processing completed.', periods: results });
    } finally {
      connection.release();
    }
  } catch (error) {
    return errorResponse(error);
  }
}

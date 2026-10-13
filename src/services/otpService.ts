"use server";

import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import sql, { withSqlTransaction } from '@/src/lib/db';
import { sendOtpEmail } from './emailService';

export type OtpPurpose =
  | 'BC'
  | 'BU'
  | 'BT'
  | 'EC'
  | 'EU'
  | 'ET';

function getOtpSenderRole(purpose: OtpPurpose): 'BM' | 'HRM' {
  return purpose === 'BC' || purpose === 'BU' || purpose === 'BT' ? 'BM' : 'HRM';
}

export async function createOtp(
  purpose: OtpPurpose,
  details: string,
  requestingEmployeeId?: number,
): Promise<{
  success: boolean;
  message: string;
  otpId?: number;
  employeeId?: number;
}> {
  const otpRole = getOtpSenderRole(purpose);
  const senderRows = await sql`
    SELECT s.id, s.full_name, s.email
    FROM staff_otp_roles r
    JOIN staff s ON s.id = r.staff_id
    WHERE r.otp_role = ${otpRole}
      AND s.status = 'active'
    ORDER BY s.id
    LIMIT 1
  `;

  if (senderRows.length === 0) {
    return {
      success: false,
      message: `No active OTP sender found for role ${otpRole}.`,
    };
  }

  const sender = senderRows[0];
  let requestingEmployee: {
    name: string;
    email: string;
    phone: string;
    employeeId: number;
  } | undefined;

  if (requestingEmployeeId !== undefined) {
    const requesterRows = await sql`
      SELECT id, full_name, email, phone
      FROM staff
      WHERE id = ${requestingEmployeeId}
      LIMIT 1
    `;
    if (requesterRows[0]) {
      requestingEmployee = {
        employeeId: Number(requesterRows[0].id),
        name: String(requesterRows[0].full_name),
        email: String(requesterRows[0].email),
        phone: typeof requesterRows[0].phone === 'string' ? requesterRows[0].phone : 'N/A',
      };
    }
  }

  const otpCode = String(randomInt(100000, 1000000));
  const otpHash = await bcrypt.hash(otpCode, 10);
  const challengeId = randomBytes(32).toString('hex');
  const otpRows = await withSqlTransaction(async (transactionSql) => {
    await transactionSql`
      UPDATE otp_challenges
      SET consumed_at = CURRENT_TIMESTAMP, is_pending = false
      WHERE employee_id = ${Number(sender.id)}
        AND purpose = ${purpose}
        AND consumed_at IS NULL
    `;
    return transactionSql`
      INSERT INTO otp_challenges
        (id, employee_id, purpose, code_hash, max_attempts, expires_at, metadata, is_pending)
      VALUES
        (${challengeId}, ${Number(sender.id)}, ${purpose}, ${otpHash}, 5,
         DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE),
         ${JSON.stringify({ details, requestingEmployee })}, true)
    `;
  });
  const otpId = Number(otpRows[0]?.insertId);
  if (!Number.isSafeInteger(otpId) || otpId < 1) {
    throw new Error('The OTP challenge was created without a valid identifier.');
  }

  const emailResult = await sendOtpEmail(
    String(sender.email),
    String(sender.full_name),
    otpCode,
    purpose,
    details,
    requestingEmployee,
  );
  if (!emailResult.success) {
    await sql`
      UPDATE otp_challenges
      SET consumed_at = CURRENT_TIMESTAMP, is_pending = false
      WHERE legacy_otp_id = ${otpId} AND consumed_at IS NULL
    `;
    return { success: false, message: emailResult.message };
  }

  return {
    success: true,
    message: `OTP sent successfully to the ${otpRole} email address.`,
    otpId,
    employeeId: Number(sender.id),
  };
}

export async function validateOtp(
  otpCode: string,
  otpId: number,
  employeeId: number,
  purpose: OtpPurpose,
): Promise<boolean> {
  return withSqlTransaction(async (transactionSql) => {
    const rows = await transactionSql`
      SELECT id, code_hash, attempts, max_attempts
      FROM otp_challenges
      WHERE legacy_otp_id = ${otpId}
        AND employee_id = ${employeeId}
        AND purpose = ${purpose}
        AND consumed_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
      FOR UPDATE
    `;
    const challenge = rows[0];
    if (!challenge) return false;

    const valid = await bcrypt.compare(otpCode, String(challenge.code_hash));
    if (!valid) {
      await transactionSql`
        UPDATE otp_challenges
        SET attempts = attempts + 1,
            consumed_at = CASE
              WHEN attempts + 1 >= max_attempts THEN CURRENT_TIMESTAMP
              ELSE consumed_at
            END,
            is_pending = CASE WHEN attempts + 1 >= max_attempts THEN false ELSE is_pending END
        WHERE id = ${String(challenge.id)} AND consumed_at IS NULL
      `;
      return false;
    }

    const updated = await transactionSql`
      UPDATE otp_challenges
      SET consumed_at = CURRENT_TIMESTAMP, is_pending = false
      WHERE id = ${String(challenge.id)} AND consumed_at IS NULL
    `;
    return Number(updated[0]?.affectedRows ?? 0) === 1;
  });
}

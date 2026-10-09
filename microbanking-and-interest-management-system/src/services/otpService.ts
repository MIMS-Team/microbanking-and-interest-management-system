"use server";

import sql from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendOtpEmail } from "./emailService";

// OTP purpose codes
export type OtpPurpose =
  | 'BC'          //create branch
  | 'BU'          //update branch
  | 'BT';         // toggle branch status

// Get the OTP sender role using the purpose
function getOtpSenderRole(purpose: OtpPurpose): string | null {
  switch (purpose) {
    case 'BC':
    case 'BU':
    case 'BT':
      return 'HRM';
    default:
      return null;
  }
}

// Generate and store an OTP
export async function createOtp(
  purpose: OtpPurpose,
  details: string,
  requestingEmployeeId?: number
): Promise<{
  success: boolean;
  message: string;
  otpId?: number;
  employeeId?: number;
}> {
  try {
    // Find the role responsible for this OTP
    const otpRole = getOtpSenderRole(purpose);

    if (!otpRole) {
      return {
        success: false,
        message: "Invalid OTP purpose.",
      };
    }

    // Find the employee assigned to receive the OTP
    const senderResult = await sql`
      SELECT os.employee_id, e.name, e.email
      FROM otpsenders os
      JOIN employee e USING (employee_id)
      WHERE os.otprole = ${otpRole}
        AND e.is_active = true
      LIMIT 1
    `;

    if (senderResult.length === 0) {
      return {
        success: false,
        message: `No active OTP sender found for role ${otpRole}.`,
      };
    }

    const sender = senderResult[0];

    // Query requesting employee details if employee ID was provided
    let requestingEmployee: {
      name: string;
      email: string;
      phone: string;
      employeeId: number;
    } | undefined = undefined;

    if (requestingEmployeeId) {
      const requesterResult = await sql`
        SELECT employee_id, name, email, mobile_no
        FROM employee
        WHERE employee_id = ${Number(requestingEmployeeId)}
        LIMIT 1
      `;
      if (requesterResult.length > 0) {
        requestingEmployee = {
          employeeId: Number(requesterResult[0].employee_id),
          name: requesterResult[0].name,
          email: requesterResult[0].email,
          phone: requesterResult[0].mobile_no || 'N/A',
        };
      }
    }

    await sql`
      UPDATE otpe
      SET is_success = true
      WHERE employee_id = ${Number(sender.employee_id)}
        AND purpose = ${purpose}
        AND is_success = false
    `;

    // Generate a 6-digit OTP
    const otpCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Hash the OTP before storing it
    const otpHash = await bcrypt.hash(otpCode, 10);

    // Store the OTP in the database
    const otpResult = await sql`
      INSERT INTO otpe
        (employee_id, otp_hash, purpose, is_success)
      VALUES
        (${Number(sender.employee_id)}, ${otpHash}, ${purpose}, false)
      RETURNING otp_id
    `;

    const otpId = Number(otpResult[0].otp_id);

    // Send the OTP to the selected employee along with requester info and operation details
    const emailResult = await sendOtpEmail(
      sender.email,
      sender.name,
      otpCode,
      purpose,
      details,
      requestingEmployee
    );

    // Remove OTP if email sending fails
    if (!emailResult.success) {
      await sql`
        DELETE FROM otpe
        WHERE otp_id = ${otpId}
      `;

      return {
        success: false,
        message: emailResult.message,
      };
    }

    return {
      success: true,
      message: `OTP sent successfully to the ${otpRole} email address.`,
      otpId,
      employeeId: Number(sender.employee_id),
    };
  } catch (error) {
    console.error("OTP creation error:", error);

    return {
      success: false,
      message: "Failed to generate OTP.",
    };
  }
}

// Validate an OTP
export async function validateOtp(
  otpCode: string,
  otpId: number,
  employeeId: number,
  purpose: OtpPurpose
): Promise<boolean> {
  try {
    // Find the OTP belonging to the specified employee
    const result = await sql`
      SELECT otp_id, employee_id, otp_hash, purpose, is_success, expires_at
      FROM otpe
      WHERE otp_id = ${otpId}
        AND employee_id = ${employeeId}
        AND purpose = ${purpose}
        AND is_success = false
        AND expires_at > CURRENT_TIMESTAMP
    `;

    if (result.length === 0) {
      return false;
    }

    const otpRecord = result[0];

    // Compare entered OTP with stored hash
    const isValid = await bcrypt.compare(
      otpCode,
      otpRecord.otp_hash
    );

    if (!isValid) {
      return false;
    }

    // Mark OTP as used
    await sql`
      UPDATE otpe
      SET is_success = true
      WHERE otp_id = ${otpId}
        AND employee_id = ${employeeId}
    `;

    return true;
  } catch (error) {
    console.error("OTP validation error:", error);
    return false;
  }
}
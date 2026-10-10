"use server";

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { EmployeeRecord } from '@/types';
import sql from '@/lib/db';
import { validateOtp } from '@/services/otpService';


function mapEmployee(row: Record<string, unknown>): EmployeeRecord {
  const openedDateValue = row.opened_date;
  const createdAt =
    openedDateValue instanceof Date
      ? openedDateValue.toISOString().split('T')[0]
      : typeof openedDateValue === 'string'
        ? openedDateValue.split('T')[0]
        : '';

  return {
    id: String(row.employee_id ?? ''),
    username: String(row.username ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.mobile_no ?? ''),
    roleId: String(row.role_id ?? ''),
    role: String(row.role_title ?? ''),
    secondaryOtpRoles: [
      ...(row.has_bm_otp_role === true ? ['BM' as const] : []),
      ...(row.has_hrm_otp_role === true ? ['HRM' as const] : []),
    ],
    branchId: String(row.branch_id ?? ''),
    branchName: String(row.branch_name ?? ''),
    status: row.is_active === true ? 'Active' : 'Suspended',
    createdAt,
  };
}

export async function getEmployees(
  page: number,
  pageSize: number,
  search = '',
  roleId = '',
  searchColumn = 'name',
  status = ''
): Promise<{ employees: EmployeeRecord[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const searchTerm = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;
  const hasRole = roleId.length > 0;
  const isOtpRole = roleId.startsWith('otp:');
  const otpRole = isOtpRole ? roleId.slice(4) : '';

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT e.employee_id, e.branch_id, b.name AS branch_name, e.name,
        e.username, e.email, e.mobile_no, e.role_id, r.title AS role_title,
        e.is_active, e.opened_date,
        EXISTS (
          SELECT 1 FROM otpsenders os
          WHERE os.employee_id = e.employee_id AND os.otprole = 'BM'
        ) AS has_bm_otp_role,
        EXISTS (
          SELECT 1 FROM otpsenders os
          WHERE os.employee_id = e.employee_id AND os.otprole = 'HRM'
        ) AS has_hrm_otp_role
      FROM employee e
      JOIN branch b ON b.branch_id = e.branch_id
      JOIN role r ON r.role_id = e.role_id
      WHERE (
        ${!hasSearch}
        OR (${searchColumn === 'name'} AND e.name ILIKE ${searchTerm})
        OR (${searchColumn === 'employee_id'} AND e.employee_id::text ILIKE ${searchTerm})
      )
      AND (
        ${!hasRole}
        OR (${!isOtpRole} AND e.role_id = ${roleId})
        OR (
          ${isOtpRole}
          AND EXISTS (
            SELECT 1 FROM otpsenders role_sender
            WHERE role_sender.employee_id = e.employee_id
              AND role_sender.otprole = ${otpRole}
          )
        )
      )
      AND (
        ${status === ''}
        OR (${status === 'Active'} AND e.is_active = true)
        OR (${status === 'Suspended'} AND e.is_active = false)
      )
      ORDER BY e.employee_id
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM employee e
      WHERE (
        ${!hasSearch}
        OR (${searchColumn === 'name'} AND e.name ILIKE ${searchTerm})
        OR (${searchColumn === 'employee_id'} AND e.employee_id::text ILIKE ${searchTerm})
      )
      AND (
        ${!hasRole}
        OR (${!isOtpRole} AND e.role_id = ${roleId})
        OR (
          ${isOtpRole}
          AND EXISTS (
            SELECT 1 FROM otpsenders role_sender
            WHERE role_sender.employee_id = e.employee_id
              AND role_sender.otprole = ${otpRole}
          )
        )
      )
      AND (
        ${status === ''}
        OR (${status === 'Active'} AND e.is_active = true)
        OR (${status === 'Suspended'} AND e.is_active = false)
      )
    `,
  ]);

  return {
    employees: rows.map((row) => mapEmployee(row as Record<string, unknown>)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function getMissingEmployeeCoverage(
  employeeId: number,
  targetRoleId: string | null,
  requestedOtpRoles: Array<'BM' | 'HRM'> | null,
  deactivate = false
): Promise<string[] | null> {
  const employeeRows = await sql`
    SELECT e.is_active, r.title AS role_title,
      EXISTS (
        SELECT 1 FROM otpsenders os
        WHERE os.employee_id = e.employee_id AND os.otprole = 'BM'
      ) AS has_bm_otp_role,
      EXISTS (
        SELECT 1 FROM otpsenders os
        WHERE os.employee_id = e.employee_id AND os.otprole = 'HRM'
      ) AS has_hrm_otp_role
    FROM employee e
    JOIN role r ON r.role_id = e.role_id
    WHERE e.employee_id = ${employeeId}
  `;
  if (employeeRows.length === 0) return null;

  const current = employeeRows[0];
  const targetRoleRows = targetRoleId
    ? await sql`SELECT title FROM role WHERE role_id = ${targetRoleId}`
    : [];
  if (targetRoleId && targetRoleRows.length === 0) return null;

  const remainsActive = current.is_active === true && !deactivate;
  const losesAdmin = remainsActive &&
    current.role_title === 'Admin' &&
    targetRoleId !== null &&
    targetRoleRows[0]?.title !== 'Admin';
  const losesBm = remainsActive &&
    current.has_bm_otp_role === true &&
    requestedOtpRoles !== null &&
    !requestedOtpRoles.includes('BM');
  const losesHrm = remainsActive &&
    current.has_hrm_otp_role === true &&
    requestedOtpRoles !== null &&
    !requestedOtpRoles.includes('HRM');
  const losesAnyOnDeactivation = current.is_active === true && deactivate;

  if (!losesAdmin && !losesBm && !losesHrm && !losesAnyOnDeactivation) {
    return [];
  }

  const replacementRows = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM employee e
        JOIN role r ON r.role_id = e.role_id
        WHERE r.title = 'Admin'
          AND e.is_active = true
          AND e.employee_id <> ${employeeId}
      ) AS has_admin_replacement,
      EXISTS (
        SELECT 1 FROM otpsenders os
        JOIN employee e ON e.employee_id = os.employee_id
        WHERE os.otprole = 'BM'
          AND e.is_active = true
          AND e.employee_id <> ${employeeId}
      ) AS has_bm_replacement,
      EXISTS (
        SELECT 1 FROM otpsenders os
        JOIN employee e ON e.employee_id = os.employee_id
        WHERE os.otprole = 'HRM'
          AND e.is_active = true
          AND e.employee_id <> ${employeeId}
      ) AS has_hrm_replacement
  `;
  const replacements = replacementRows[0];
  const missing: string[] = [];
  if (
    (losesAdmin || (losesAnyOnDeactivation && current.role_title === 'Admin')) &&
    !replacements.has_admin_replacement
  ) {
    missing.push('Admin');
  }
  if ((losesBm || (losesAnyOnDeactivation && current.has_bm_otp_role === true)) &&
      !replacements.has_bm_replacement) {
    missing.push('BM');
  }
  if ((losesHrm || (losesAnyOnDeactivation && current.has_hrm_otp_role === true)) &&
      !replacements.has_hrm_replacement) {
    missing.push('HRM');
  }
  return missing;
}

export async function createEmployee(
  data: {
    branchId: number;
    name: string;
    username: string;
    email: string;
    phone: string;
    roleId: string;
    secondaryOtpRoles: Array<'BM' | 'HRM'>;
  },
  otpCode: string,
  otpId: number,
  otpEmployeeId: number
): Promise<
  { employee: EmployeeRecord; temporaryPassword: string } | null | 'invalid-secondary-role'
> {
  const roleRows = await sql`SELECT title FROM role WHERE role_id = ${data.roleId}`;
  const isHigherManagement = roleRows[0]?.title === 'Higher Management';
  if (roleRows.length === 0 || (!isHigherManagement && data.secondaryOtpRoles.length > 0)) {
    return 'invalid-secondary-role';
  }

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'EC');
  if (!otpValid) {
    return null;
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const employeeRows = data.secondaryOtpRoles.length > 0
    ? await sql`
    WITH created_employee AS (
      INSERT INTO employee
        (branch_id, name, username, password, email, mobile_no, role_id, is_active, opened_date)
      VALUES
        (${data.branchId}, ${data.name}, ${data.username}, ${passwordHash},
         ${data.email}, ${data.phone}, ${data.roleId}, true, CURRENT_DATE)
      RETURNING employee_id, branch_id, name, username, email, mobile_no,
        role_id, is_active, opened_date
    ),
    assigned_sender_role AS (
      INSERT INTO otpsenders (employee_id, otprole)
      SELECT employee_id, sender_role.otprole
      FROM created_employee
      CROSS JOIN (
        SELECT 'BM'::char(3) AS otprole WHERE ${data.secondaryOtpRoles.includes('BM')}
        UNION ALL
        SELECT 'HRM'::char(3) AS otprole WHERE ${data.secondaryOtpRoles.includes('HRM')}
      ) sender_role
      RETURNING employee_id
    )
    SELECT e.employee_id, e.branch_id, b.name AS branch_name, e.name,
      e.username, e.email, e.mobile_no, e.role_id, r.title AS role_title,
      e.is_active, e.opened_date,
      ${data.secondaryOtpRoles.includes('BM')} AS has_bm_otp_role,
      ${data.secondaryOtpRoles.includes('HRM')} AS has_hrm_otp_role
    FROM created_employee e
    JOIN branch b ON b.branch_id = e.branch_id
    JOIN role r ON r.role_id = e.role_id
  `
    : await sql`
    WITH created_employee AS (
      INSERT INTO employee
        (branch_id, name, username, password, email, mobile_no, role_id, is_active, opened_date)
      VALUES
        (${data.branchId}, ${data.name}, ${data.username}, ${passwordHash},
         ${data.email}, ${data.phone}, ${data.roleId}, true, CURRENT_DATE)
      RETURNING employee_id, branch_id, name, username, email, mobile_no,
        role_id, is_active, opened_date
    )
    SELECT e.employee_id, e.branch_id, b.name AS branch_name, e.name,
      e.username, e.email, e.mobile_no, e.role_id, r.title AS role_title,
      e.is_active, e.opened_date,
      false AS has_bm_otp_role, false AS has_hrm_otp_role
    FROM created_employee e
    JOIN branch b ON b.branch_id = e.branch_id
    JOIN role r ON r.role_id = e.role_id
  `;

  return {
    employee: mapEmployee(employeeRows[0] as Record<string, unknown>),
    temporaryPassword,
  };
}

export async function updateEmployee(
  employeeId: number,
  data: {
    branchId: number;
    name: string;
    username: string;
    email: string;
    phone: string;
    roleId: string;
    secondaryOtpRoles: Array<'BM' | 'HRM'>;
  },
  otpCode: string,
  otpId: number,
  otpEmployeeId: number
): Promise<boolean | null | 'invalid-otp' | 'invalid-secondary-role' | 'missing-otp-role-replacement'> {
  const roleRows = await sql`SELECT title FROM role WHERE role_id = ${data.roleId}`;
  const isHigherManagement = roleRows[0]?.title === 'Higher Management';
  if (roleRows.length === 0 || (!isHigherManagement && data.secondaryOtpRoles.length > 0)) {
    return 'invalid-secondary-role';
  }

  const missingCoverage = await getMissingEmployeeCoverage(
    employeeId,
    data.roleId,
    data.secondaryOtpRoles
  );
  if (missingCoverage === null) return null;
  if (missingCoverage.length > 0) return 'missing-otp-role-replacement';

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'EU');
  if (!otpValid) {
    return 'invalid-otp';
  }

  const currentEmployeeRows = await sql`
    SELECT e.is_active, r.title AS role_title, os.otprole
    FROM employee e
    JOIN role r ON r.role_id = e.role_id
    LEFT JOIN otpsenders os
      ON os.employee_id = e.employee_id
      AND os.otprole IN ('BM', 'HRM')
    WHERE e.employee_id = ${employeeId}
  `;
  if (currentEmployeeRows.length === 0) return null;
  const hasExistingAssignments = currentEmployeeRows.some((row) => row.otprole === 'BM' || row.otprole === 'HRM');
  const hasRequestedAssignments = data.secondaryOtpRoles.length > 0;
  const losesAdmin =
    currentEmployeeRows[0].is_active === true &&
    currentEmployeeRows[0].role_title === 'Admin' &&
    roleRows[0].title !== 'Admin';

  if (!hasExistingAssignments && !hasRequestedAssignments && !losesAdmin) {
    const result = await sql`
      UPDATE employee
      SET branch_id = ${data.branchId},
        name = ${data.name},
        username = ${data.username},
        email = ${data.email},
        mobile_no = ${data.phone},
        role_id = ${data.roleId}
      WHERE employee_id = ${employeeId}
      RETURNING employee_id
    `;
    return result.length > 0;
  }

  const result = await sql`
    WITH previous_employee AS (
      SELECT e.employee_id, e.is_active, current_role.title AS role_title
      FROM employee e
      JOIN role current_role ON current_role.role_id = e.role_id
      WHERE e.employee_id = ${employeeId}
    ),
    requested_sender_roles AS (
      SELECT 'BM'::char(3) AS otprole WHERE ${data.secondaryOtpRoles.includes('BM')}
      UNION ALL
      SELECT 'HRM'::char(3) AS otprole WHERE ${data.secondaryOtpRoles.includes('HRM')}
    ),
    replacement_check AS (
      SELECT EXISTS (
        SELECT 1
        FROM otpsenders outgoing
        JOIN previous_employee previous
          ON previous.employee_id = outgoing.employee_id
        WHERE outgoing.otprole IN ('BM', 'HRM')
          AND NOT EXISTS (
            SELECT 1 FROM requested_sender_roles requested
            WHERE requested.otprole = outgoing.otprole
          )
          AND NOT EXISTS (
            SELECT 1
            FROM otpsenders replacement
            JOIN employee replacement_employee
              ON replacement_employee.employee_id = replacement.employee_id
            WHERE replacement.otprole = outgoing.otprole
              AND replacement.employee_id <> outgoing.employee_id
              AND replacement_employee.is_active = true
          )
      ) OR EXISTS (
        SELECT 1
        FROM previous_employee previous
        JOIN role target_role ON target_role.role_id = ${data.roleId}
        WHERE previous.is_active = true
          AND previous.role_title = 'Admin'
          AND target_role.title <> 'Admin'
          AND NOT EXISTS (
            SELECT 1 FROM employee replacement
            JOIN role replacement_role ON replacement_role.role_id = replacement.role_id
            WHERE replacement_role.title = 'Admin'
              AND replacement.is_active = true
              AND replacement.employee_id <> previous.employee_id
          )
      ) AS replacement_missing
    ),
    updated_employee AS (
      UPDATE employee e
      SET branch_id = ${data.branchId},
        name = ${data.name},
        username = ${data.username},
        email = ${data.email},
        mobile_no = ${data.phone},
        role_id = ${data.roleId}
      FROM previous_employee previous
      CROSS JOIN replacement_check check_result
      WHERE e.employee_id = previous.employee_id
        AND check_result.replacement_missing = false
      RETURNING e.employee_id
    ),
    removed_sender_roles AS (
      DELETE FROM otpsenders os
      USING updated_employee updated
      WHERE os.employee_id = updated.employee_id
        AND os.otprole IN ('BM', 'HRM')
        AND NOT EXISTS (
          SELECT 1 FROM requested_sender_roles requested
          WHERE requested.otprole = os.otprole
        )
      RETURNING os.employee_id
    ),
    assigned_sender_roles AS (
      INSERT INTO otpsenders (employee_id, otprole)
      SELECT updated.employee_id, requested.otprole
      FROM updated_employee updated
      CROSS JOIN requested_sender_roles requested
      CROSS JOIN (SELECT COUNT(*) FROM removed_sender_roles) removed
      WHERE NOT EXISTS (
        SELECT 1 FROM otpsenders existing
        WHERE existing.employee_id = updated.employee_id
          AND existing.otprole = requested.otprole
      )
      RETURNING employee_id
    )
    SELECT
      (SELECT replacement_missing FROM replacement_check) AS replacement_missing,
      (SELECT employee_id FROM updated_employee) AS employee_id
  `;
  if (result[0]?.replacement_missing) {
    return 'missing-otp-role-replacement';
  }
  if (!result[0]?.employee_id) {
    return null;
  }
  return result.length > 0;
}

export async function toggleEmployeeStatus(
  employeeId: number,
  otpCode: string,
  otpId: number,
  otpEmployeeId: number
): Promise<boolean | null | 'invalid-otp' | 'missing-otp-role-replacement'> {
  const missingCoverage = await getMissingEmployeeCoverage(employeeId, null, null, true);
  if (missingCoverage === null) return null;
  if (missingCoverage.length > 0) return 'missing-otp-role-replacement';

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'ET');
  if (!otpValid) {
    return 'invalid-otp';
  }

  const result = await sql`
    UPDATE employee
    SET is_active = NOT is_active
    WHERE employee_id = ${employeeId}
    RETURNING is_active
  `;
  return result.length > 0 ? Boolean(result[0].is_active) : null;
}

export type EmployeePasswordReset = {
  recipientEmail: string;
  recipientName: string;
  temporaryPassword: string;
  requestingEmployee: {
    employeeId: number;
    name: string;
    email: string;
  };
};

export async function renewEmployeePassword(
  employeeId: number,
  requestingEmployeeId: number
): Promise<EmployeePasswordReset | null> {
  const employees = await sql`
    SELECT recipient.email AS recipient_email, recipient.name AS recipient_name,
      requester.employee_id AS requester_id, requester.name AS requester_name,
      requester.email AS requester_email
    FROM employee recipient
    JOIN employee requester
      ON requester.employee_id = ${requestingEmployeeId}
    WHERE recipient.employee_id = ${employeeId}
  `;
  if (employees.length === 0) {
    return null;
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const updatedEmployees = await sql`
    UPDATE employee
    SET password = ${passwordHash}
    WHERE employee_id = ${employeeId}
    RETURNING employee_id
  `;
  if (updatedEmployees.length === 0) {
    return null;
  }

  return {
    recipientEmail: String(employees[0].recipient_email),
    recipientName: String(employees[0].recipient_name),
    temporaryPassword,
    requestingEmployee: {
      employeeId: Number(employees[0].requester_id),
      name: String(employees[0].requester_name),
      email: String(employees[0].requester_email),
    },
  };
}

export async function changeEmployeePassword(
  employeeId: number,
  currentPassword: string,
  newPassword: string
): Promise<'invalid-current-password' | 'employee-not-found' | 'success'> {
  const employees = await sql`
    SELECT password
    FROM employee
    WHERE employee_id = ${employeeId}
  `;
  if (employees.length === 0) {
    return 'employee-not-found';
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    String(employees[0].password)
  );
  if (!isCurrentPasswordValid) {
    return 'invalid-current-password';
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updatedEmployees = await sql`
    UPDATE employee
    SET password = ${passwordHash}
    WHERE employee_id = ${employeeId}
    RETURNING employee_id
  `;
  return updatedEmployees.length > 0 ? 'success' : 'employee-not-found';
}

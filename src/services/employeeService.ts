"use server";

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { EmployeeRecord } from '@/types';
import sql, { withSqlTransaction } from '@/src/lib/db';
import { validateOtp } from '@/services/otpService';

function databaseBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function otpRolesForStaffRole(
  businessRole: unknown,
  requestedRoles: Array<'BM' | 'HRM'>,
): Array<'BM' | 'HRM'> {
  const roles = new Set(requestedRoles);
  if (businessRole === 'manager') roles.add('BM');
  if (businessRole === 'higher_manager') roles.add('HRM');
  return [...roles];
}

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
      ...(databaseBoolean(row.has_bm_otp_role) ? ['BM' as const] : []),
      ...(databaseBoolean(row.has_hrm_otp_role) ? ['HRM' as const] : []),
    ],
    branchId: String(row.branch_id ?? ''),
    branchName: String(row.branch_name ?? ''),
    status: databaseBoolean(row.is_active) ? 'Active' : 'Suspended',
    createdAt,
  };
}

export async function getEmployees(
  page: number,
  pageSize: number,
  search = '',
  roleId = '',
  searchColumn = 'name',
  status = '',
  branchId = '',
): Promise<{ employees: EmployeeRecord[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const searchTerm = `%${search.trim()}%`;
  const hasSearch = search.trim().length > 0;
  const hasRole = roleId.length > 0;
  const isOtpRole = roleId.startsWith('otp:');
  const otpRole = isOtpRole ? roleId.slice(4) : '';

  // Apply identical filters to the page and count queries so totals include every matching employee.
  const [rows, countRows] = await Promise.all([
    sql`
      SELECT e.id AS employee_id, e.branch_id, b.name AS branch_name, e.full_name AS name,
        e.username, e.email, e.phone AS mobile_no, e.permission_role AS role_id,
        CASE r.business_role
          WHEN 'higher_manager' THEN 'Higher Management'
          WHEN 'manager' THEN 'Branch Manager'
          WHEN 'agent' THEN 'Field Agent'
          ELSE 'Admin'
        END AS role_title,
        (e.status = 'active') AS is_active, e.created_at AS opened_date,
        EXISTS (
          SELECT 1 FROM staff_otp_roles os
          WHERE os.staff_id = e.id AND os.otp_role = 'BM'
        ) AS has_bm_otp_role,
        EXISTS (
          SELECT 1 FROM staff_otp_roles os
          WHERE os.staff_id = e.id AND os.otp_role = 'HRM'
        ) AS has_hrm_otp_role
      FROM staff e
      LEFT JOIN branches b ON b.id = e.branch_id
      LEFT JOIN role_catalog r ON r.code = e.permission_role
      WHERE (
        ${!hasSearch}
        OR (${searchColumn === 'name'} AND LOWER(e.full_name) LIKE LOWER(${searchTerm}))
        OR (${searchColumn === 'employee_id'} AND CAST(e.id AS CHAR) LIKE ${searchTerm})
      )
      AND (
        ${!hasRole}
        OR (${!isOtpRole} AND e.permission_role = ${roleId})
        OR (
          ${isOtpRole}
          AND EXISTS (
            SELECT 1 FROM staff_otp_roles role_sender
            WHERE role_sender.staff_id = e.id
              AND role_sender.otp_role = ${otpRole}
          )
        )
      )
      AND (
        ${status === ''}
        OR (${status === 'Active'} AND e.status = 'active')
        OR (${status === 'Suspended'} AND e.status = 'inactive')
      )
      AND (${branchId === ''} OR e.branch_id = ${branchId})
      ORDER BY e.id
      LIMIT ${pageSize} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*) AS total
      FROM staff e
      LEFT JOIN branches b ON b.id = e.branch_id
      WHERE (
        ${!hasSearch}
        OR (${searchColumn === 'name'} AND LOWER(e.full_name) LIKE LOWER(${searchTerm}))
        OR (${searchColumn === 'employee_id'} AND CAST(e.id AS CHAR) LIKE ${searchTerm})
      )
      AND (
        ${!hasRole}
        OR (${!isOtpRole} AND e.permission_role = ${roleId})
        OR (
          ${isOtpRole}
          AND EXISTS (
            SELECT 1 FROM staff_otp_roles role_sender
            WHERE role_sender.staff_id = e.id
              AND role_sender.otp_role = ${otpRole}
          )
        )
      )
      AND (
        ${status === ''}
        OR (${status === 'Active'} AND e.status = 'active')
        OR (${status === 'Suspended'} AND e.status = 'inactive')
      )
      AND (${branchId === ''} OR e.branch_id = ${branchId})
    `,
  ]);

  return {
    employees: rows.map((row: Record<string, unknown>) => mapEmployee(row)),
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
    SELECT e.status, e.role, e.permission_role,
      EXISTS (
        SELECT 1 FROM staff_otp_roles os
        WHERE os.staff_id = e.id AND os.otp_role = 'BM'
      ) AS has_bm_otp_role,
      EXISTS (
        SELECT 1 FROM staff_otp_roles os
        WHERE os.staff_id = e.id AND os.otp_role = 'HRM'
      ) AS has_hrm_otp_role
    FROM staff e
    WHERE e.id = ${employeeId}
  `;
  if (employeeRows.length === 0) return null;

  const current = employeeRows[0];
  const targetRoleRows = targetRoleId
    ? await sql`SELECT business_role FROM role_catalog WHERE code = ${targetRoleId}`
    : [];
  if (targetRoleId && targetRoleRows.length === 0) return null;
  const effectiveRequestedOtpRoles = targetRoleId && requestedOtpRoles !== null
    ? otpRolesForStaffRole(targetRoleRows[0].business_role, requestedOtpRoles)
    : requestedOtpRoles;

  const remainsActive = current.status === 'active' && !deactivate;
  const losesAdmin = remainsActive &&
    current.role === 'admin' &&
    targetRoleId !== null &&
    targetRoleRows[0]?.business_role !== 'admin';
  const losesBm = remainsActive &&
    databaseBoolean(current.has_bm_otp_role) &&
    effectiveRequestedOtpRoles !== null &&
    !effectiveRequestedOtpRoles.includes('BM');
  const losesHrm = remainsActive &&
    databaseBoolean(current.has_hrm_otp_role) &&
    effectiveRequestedOtpRoles !== null &&
    !effectiveRequestedOtpRoles.includes('HRM');
  const losesAnyOnDeactivation = current.status === 'active' && deactivate;

  if (!losesAdmin && !losesBm && !losesHrm && !losesAnyOnDeactivation) {
    return [];
  }

  const replacementRows = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM staff e
        WHERE e.role = 'admin'
          AND e.status = 'active'
          AND e.id <> ${employeeId}
      ) AS has_admin_replacement,
      EXISTS (
        SELECT 1 FROM staff_otp_roles os
        JOIN staff e ON e.id = os.staff_id
        WHERE os.otp_role = 'BM'
          AND e.status = 'active'
          AND e.id <> ${employeeId}
      ) AS has_bm_replacement,
      EXISTS (
        SELECT 1 FROM staff_otp_roles os
        JOIN staff e ON e.id = os.staff_id
        WHERE os.otp_role = 'HRM'
          AND e.status = 'active'
          AND e.id <> ${employeeId}
      ) AS has_hrm_replacement
  `;
  const replacements = replacementRows[0];
  const missing: string[] = [];
  if (
    (losesAdmin || (losesAnyOnDeactivation && current.role === 'admin')) &&
    !replacements.has_admin_replacement
  ) {
    missing.push('Admin');
  }
  if ((losesBm || (losesAnyOnDeactivation && databaseBoolean(current.has_bm_otp_role))) &&
      !replacements.has_bm_replacement) {
    missing.push('BM');
  }
  if ((losesHrm || (losesAnyOnDeactivation && databaseBoolean(current.has_hrm_otp_role))) &&
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
  const roleRows = await sql`
    SELECT business_role
    FROM role_catalog
    WHERE code = ${data.roleId} AND active = true
  `;
  const isHigherManagement = roleRows[0]?.business_role === 'higher_manager';
  if (roleRows.length === 0 || (!isHigherManagement && data.secondaryOtpRoles.length > 0)) {
    return 'invalid-secondary-role';
  }
  const otpRoles = otpRolesForStaffRole(roleRows[0].business_role, data.secondaryOtpRoles);

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'EC');
  if (!otpValid) {
    return null;
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const employeeRows = await withSqlTransaction(async (transactionSql) => {
    const insertRows = await transactionSql`
      INSERT INTO staff
        (branch_id, full_name, username, password_hash, email, phone, role, permission_role, status)
      VALUES
        (${data.branchId}, ${data.name}, ${data.username}, ${passwordHash},
         ${data.email}, ${data.phone}, ${roleRows[0].business_role}, ${data.roleId}, 'active')
    `;
    const newEmployeeId = Number(insertRows[0]?.insertId);
    if (!Number.isSafeInteger(newEmployeeId) || newEmployeeId < 1) {
      throw new Error('The new employee was created without a valid identifier.');
    }

    await transactionSql`
      INSERT INTO staff_authentication (employee_id, password_hash)
      VALUES (${newEmployeeId}, ${passwordHash})
    `;

    for (const otpRole of otpRoles) {
      await transactionSql`
        INSERT INTO staff_otp_roles (staff_id, otp_role)
        VALUES (${newEmployeeId}, ${otpRole})
      `;
    }

    return transactionSql`
      SELECT e.id AS employee_id, e.branch_id, b.name AS branch_name, e.full_name AS name,
        e.username, e.email, e.phone AS mobile_no, e.permission_role AS role_id,
        CASE r.business_role
          WHEN 'higher_manager' THEN 'Higher Management'
          WHEN 'manager' THEN 'Branch Manager'
          WHEN 'agent' THEN 'Field Agent'
          ELSE 'Admin'
        END AS role_title,
        (e.status = 'active') AS is_active, e.created_at AS opened_date,
        EXISTS (
          SELECT 1 FROM staff_otp_roles os
          WHERE os.staff_id = e.id AND os.otp_role = 'BM'
        ) AS has_bm_otp_role,
        EXISTS (
          SELECT 1 FROM staff_otp_roles os
          WHERE os.staff_id = e.id AND os.otp_role = 'HRM'
        ) AS has_hrm_otp_role
      FROM staff e
      LEFT JOIN branches b ON b.id = e.branch_id
      JOIN role_catalog r ON r.code = e.permission_role
      WHERE e.id = ${newEmployeeId}
    `;
  });

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
): Promise<boolean | null | 'invalid-otp' | 'invalid-secondary-role' | 'missing-otp-role-replacement' | 'missing-ceo-replacement'> {
  const roleRows = await sql`
    SELECT business_role
    FROM role_catalog
    WHERE code = ${data.roleId} AND active = true
  `;
  const businessRole = roleRows[0]?.business_role;
  const isHigherManagement = businessRole === 'higher_manager';
  if (roleRows.length === 0 || (!isHigherManagement && data.secondaryOtpRoles.length > 0)) {
    return 'invalid-secondary-role';
  }
  const otpRoles = otpRolesForStaffRole(businessRole, data.secondaryOtpRoles);

  const missingCoverage = await getMissingEmployeeCoverage(
    employeeId,
    data.roleId,
    otpRoles
  );
  if (missingCoverage === null) return null;
  if (missingCoverage.includes('CEO')) return 'missing-ceo-replacement';
  if (missingCoverage.length > 0) return 'missing-otp-role-replacement';

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'EU');
  if (!otpValid) {
    return 'invalid-otp';
  }

  return withSqlTransaction(async (transactionSql) => {
    const currentRows = await transactionSql`
      SELECT e.status, e.role, os.otp_role
      FROM staff e
      LEFT JOIN staff_otp_roles os
        ON os.staff_id = e.id AND os.otp_role IN ('BM', 'HRM')
      WHERE e.id = ${employeeId}
      FOR UPDATE
    `;
    if (currentRows.length === 0) return null;

    const current = currentRows[0];
    const currentOtpRoles = currentRows
      .map((row) => row.otprole)
      .filter((role): role is 'BM' | 'HRM' => role === 'BM' || role === 'HRM');
    const removedOtpRoles = currentOtpRoles.filter((role) => !otpRoles.includes(role));
    const active = current.status === 'active';
    const losesAdmin = active && current.role === 'admin' && businessRole !== 'admin';

    for (const otpRole of removedOtpRoles) {
      const replacementRows = await transactionSql`
        SELECT EXISTS (
          SELECT 1
          FROM staff_otp_roles os
          JOIN staff e ON e.id = os.staff_id
          WHERE os.otp_role = ${otpRole}
            AND e.status = 'active'
            AND e.id <> ${employeeId}
        ) AS has_replacement
      `;
      if (!databaseBoolean(replacementRows[0]?.has_replacement)) {
        return 'missing-otp-role-replacement';
      }
    }

    if (losesAdmin) {
      const replacementRows = await transactionSql`
        SELECT EXISTS (
          SELECT 1
          FROM staff e
          WHERE e.role = 'admin'
            AND e.status = 'active'
            AND e.id <> ${employeeId}
        ) AS has_replacement
      `;
      if (!databaseBoolean(replacementRows[0]?.has_replacement)) {
        return 'missing-otp-role-replacement';
      }
    }
    await transactionSql`
      UPDATE staff
      SET branch_id = ${data.branchId},
        full_name = ${data.name},
        username = ${data.username},
        email = ${data.email},
        phone = ${data.phone},
        role = ${businessRole},
        permission_role = ${data.roleId}
      WHERE id = ${employeeId}
    `;
    if (removedOtpRoles.length > 0) {
      await transactionSql`
        DELETE FROM staff_otp_roles
        WHERE staff_id = ${employeeId}
          AND otp_role IN (${removedOtpRoles})
      `;
    }
    for (const otpRole of otpRoles) {
      if (!currentOtpRoles.includes(otpRole)) {
        await transactionSql`
          INSERT INTO staff_otp_roles (staff_id, otp_role)
          VALUES (${employeeId}, ${otpRole})
        `;
      }
    }
    return true;
  });
}

export async function toggleEmployeeStatus(
  employeeId: number,
  otpCode: string,
  otpId: number,
  otpEmployeeId: number
): Promise<boolean | null | 'invalid-otp' | 'missing-otp-role-replacement' | 'missing-ceo-replacement'> {
  const missingCoverage = await getMissingEmployeeCoverage(employeeId, null, null, true);
  if (missingCoverage === null) return null;
  if (missingCoverage.includes('CEO')) return 'missing-ceo-replacement';
  if (missingCoverage.length > 0) return 'missing-otp-role-replacement';

  const otpValid = await validateOtp(otpCode, otpId, otpEmployeeId, 'ET');
  if (!otpValid) {
    return 'invalid-otp';
  }

  return withSqlTransaction(async (transactionSql) => {
    const currentRows = await transactionSql`
      SELECT e.status, e.role
      FROM staff e
      WHERE e.id = ${employeeId}
      FOR UPDATE
    `;
    const current = currentRows[0];
    if (!current) return null;

    await transactionSql`
      UPDATE staff
      SET status = IF(status = 'active', 'inactive', 'active')
      WHERE id = ${employeeId}
    `;
    const updatedRows = await transactionSql`
      SELECT (status = 'active') AS is_active FROM staff WHERE id = ${employeeId}
    `;
    return updatedRows[0] ? databaseBoolean(updatedRows[0].is_active) : null;
  });
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
    SELECT recipient.email AS recipient_email, recipient.full_name AS recipient_name,
      requester.id AS requester_id, requester.full_name AS requester_name,
      requester.email AS requester_email
    FROM staff recipient
    JOIN staff requester
      ON requester.id = ${requestingEmployeeId}
    WHERE recipient.id = ${employeeId}
  `;
  if (employees.length === 0) {
    return null;
  }

  const temporaryPassword = randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const updatedEmployees = await sql`
    UPDATE staff
    SET password_hash = ${passwordHash}
    WHERE id = ${employeeId}
  `;
  if (Number(updatedEmployees[0]?.affectedRows ?? 0) === 0) {
    return null;
  }
  await sql`
    INSERT INTO staff_authentication (employee_id, password_hash)
    VALUES (${employeeId}, ${passwordHash})
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
  `;

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
    SELECT password_hash
    FROM staff
    WHERE id = ${employeeId}
  `;
  if (employees.length === 0) {
    return 'employee-not-found';
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    String(employees[0].password_hash)
  );
  if (!isCurrentPasswordValid) {
    return 'invalid-current-password';
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const updatedEmployees = await sql`
    UPDATE staff
    SET password_hash = ${passwordHash}
    WHERE id = ${employeeId}
  `;
  if (Number(updatedEmployees[0]?.affectedRows ?? 0) === 0) return 'employee-not-found';
  await sql`
    INSERT INTO staff_authentication (employee_id, password_hash)
    VALUES (${employeeId}, ${passwordHash})
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
  `;
  return 'success';
}

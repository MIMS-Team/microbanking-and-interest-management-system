import { NextRequest, NextResponse } from 'next/server';
import {
  createEmployee,
  changeEmployeePassword,
  getMissingEmployeeCoverage,
  getEmployees,
  renewEmployeePassword,
  toggleEmployeeStatus,
  updateEmployee,
} from '@/services/employeeService';
import { sendEmployeePasswordResetEmail } from '@/services/passwordEmailService';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isSecondaryOtpRoles(value: unknown): value is Array<'BM' | 'HRM'> {
  return (
    Array.isArray(value) &&
    value.every((role) => role === 'BM' || role === 'HRM') &&
    new Set(value).size === value.length
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

type EmployeeInputData = {
  branchId: number;
  name: string;
  username: string;
  email: string;
  phone: string;
  roleId: string;
};

function isValidEmployeeData(
  data: Record<string, unknown>
): data is Record<string, unknown> & EmployeeInputData {
  return (
    typeof data.name === 'string' &&
    data.name.trim().length > 0 &&
    data.name.length <= 100 &&
    typeof data.username === 'string' &&
    data.username.trim().length > 0 &&
    data.username.length <= 50 &&
    typeof data.email === 'string' &&
    data.email.trim().length > 0 &&
    data.email.length <= 100 &&
    typeof data.phone === 'string' &&
    data.phone.length <= 20 &&
    typeof data.roleId === 'string' &&
    data.roleId.length === 1 &&
    isPositiveInteger(data.branchId)
  );
}

// GET /api/employees — retrieve a paginated employee list
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 5);
  const search = params.get('search') ?? '';
  const roleId = params.get('roleId') ?? '';
  const searchColumn = params.get('searchColumn') ?? 'name';
  const status = params.get('status') ?? '';

  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !['name', 'employee_id'].includes(searchColumn) ||
    !['', 'Active', 'Suspended'].includes(status) ||
    (roleId !== '' && !/^[A-Za-z0-9]$/.test(roleId) && !['otp:BM', 'otp:HRM'].includes(roleId))
  ) {
    return NextResponse.json({ message: 'Invalid pagination values.' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getEmployees(page, pageSize, search, roleId, searchColumn, status)
    );
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({ message: 'Failed to fetch employees.' }, { status: 500 });
  }
}

// POST /api/employees — create an employee after HRM OTP authorization
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ message: 'Employee details are required.' }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    const { otpCode, otpId, otpEmployeeId } = data;

    if (
      !isValidEmployeeData(data) ||
      !isSecondaryOtpRoles(data.secondaryOtpRoles) ||
      typeof otpCode !== 'string' ||
      !otpCode.trim() ||
      !isPositiveInteger(otpId) ||
      !isPositiveInteger(otpEmployeeId)
    ) {
      return NextResponse.json(
        { message: 'Valid employee details and HRM OTP authorization are required.' },
        { status: 400 }
      );
    }

    const result = await createEmployee(
      {
        branchId: data.branchId,
        name: data.name.trim(),
        username: data.username.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        roleId: data.roleId,
        secondaryOtpRoles: data.secondaryOtpRoles,
      },
      otpCode.trim(),
      otpId,
      otpEmployeeId
    );

    if (result === 'invalid-secondary-role') {
      return NextResponse.json(
        { message: 'Only Higher Management employees can be assigned BM or HRM OTP sender roles.' },
        { status: 400 }
      );
    }
    if (!result) {
      return NextResponse.json({ message: 'Invalid or expired HRM OTP.' }, { status: 403 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: 'That username or email address is already in use.' },
        { status: 409 }
      );
    }
    console.error('Error creating employee:', error);
    return NextResponse.json({ message: 'Failed to create employee.' }, { status: 500 });
  }
}

// PUT /api/employees — update employee profile details
export async function PUT(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ message: 'Employee details are required.' }, { status: 400 });
    }
    const data = body as Record<string, unknown>;
    const { otpCode, otpId, otpEmployeeId } = data;

    if (
      !isPositiveInteger(data.employeeId) ||
      !isValidEmployeeData(data) ||
      !isSecondaryOtpRoles(data.secondaryOtpRoles) ||
      typeof otpCode !== 'string' ||
      !otpCode.trim() ||
      !isPositiveInteger(otpId) ||
      !isPositiveInteger(otpEmployeeId)
    ) {
      return NextResponse.json(
        { message: 'Valid employee details and HRM OTP authorization are required.' },
        { status: 400 }
      );
    }

    const updated = await updateEmployee(data.employeeId, {
      branchId: data.branchId,
      name: data.name.trim(),
      username: data.username.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      roleId: data.roleId,
      secondaryOtpRoles: data.secondaryOtpRoles,
    }, otpCode.trim(), otpId, otpEmployeeId);

    if (updated === 'invalid-secondary-role') {
      return NextResponse.json(
        { message: 'Only Higher Management employees can be assigned BM or HRM OTP sender roles.' },
        { status: 400 }
      );
    }
    if (updated === 'invalid-otp') {
      return NextResponse.json({ message: 'Invalid or expired HRM OTP.' }, { status: 403 });
    }
    if (updated === 'missing-otp-role-replacement') {
      return NextResponse.json(
        { message: 'Assign another active employee to cover every Admin, BM, or HRM responsibility being removed before saving these changes.' },
        { status: 409 }
      );
    }
    if (updated === null) {
      return NextResponse.json({ message: 'Employee not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { message: 'That username or email address is already in use.' },
        { status: 409 }
      );
    }
    console.error('Error updating employee:', error);
    return NextResponse.json({ message: 'Failed to update employee.' }, { status: 500 });
  }
}

// PATCH /api/employees — toggle status or reset an employee password
export async function PATCH(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ message: 'An employee action is required.' }, { status: 400 });
    }
    const {
      employeeId,
      action,
      otpCode,
      otpId,
      otpEmployeeId,
      requestingEmployeeId,
      currentPassword,
      newPassword,
    } = body as Record<string, unknown>;

    if (!isPositiveInteger(employeeId)) {
      return NextResponse.json({ message: 'A valid employee ID is required.' }, { status: 400 });
    }

    if (action === 'change-password') {
      if (
        typeof currentPassword !== 'string' ||
        currentPassword.length === 0 ||
        typeof newPassword !== 'string' ||
        newPassword.length < 6
      ) {
        return NextResponse.json(
          { message: 'Current password and a new password of at least 6 characters are required.' },
          { status: 400 }
        );
      }
      if (currentPassword === newPassword) {
        return NextResponse.json(
          { message: 'The new password must be different from the current password.' },
          { status: 400 }
        );
      }

      const result = await changeEmployeePassword(employeeId, currentPassword, newPassword);
      if (result === 'employee-not-found') {
        return NextResponse.json({ message: 'Employee not found.' }, { status: 404 });
      }
      if (result === 'invalid-current-password') {
        return NextResponse.json({ message: 'The current password is incorrect.' }, { status: 403 });
      }

      return NextResponse.json({ success: true, message: 'Password updated successfully.' });
    }

    if (action === 'check-role-change-coverage') {
      const { roleId, secondaryOtpRoles } = body as Record<string, unknown>;
      if (
        typeof roleId !== 'string' ||
        roleId.length !== 1 ||
        !isSecondaryOtpRoles(secondaryOtpRoles)
      ) {
        return NextResponse.json({ message: 'Valid employee roles are required.' }, { status: 400 });
      }
      const missing = await getMissingEmployeeCoverage(employeeId, roleId, secondaryOtpRoles);
      if (missing === null) {
        return NextResponse.json({ message: 'Employee or selected role was not found.' }, { status: 404 });
      }
      if (missing.length > 0) {
        return NextResponse.json(
          { message: `Assign another active ${missing.join(' and ')} employee before removing these responsibilities.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'check-status-change-coverage') {
      const missing = await getMissingEmployeeCoverage(employeeId, null, null, true);
      if (missing === null) {
        return NextResponse.json({ message: 'Employee not found.' }, { status: 404 });
      }
      if (missing.length > 0) {
        return NextResponse.json(
          { message: `Assign another active ${missing.join(' and ')} employee before suspending this account.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'toggle-status') {
      if (
        typeof otpCode !== 'string' ||
        !otpCode.trim() ||
        !isPositiveInteger(otpId) ||
        !isPositiveInteger(otpEmployeeId)
      ) {
        return NextResponse.json(
          { message: 'A valid HRM OTP authorization is required to change employee status.' },
          { status: 400 }
        );
      }
      const isActive = await toggleEmployeeStatus(employeeId, otpCode.trim(), otpId, otpEmployeeId);
      if (isActive === 'invalid-otp') {
        return NextResponse.json({ message: 'Invalid or expired HRM OTP.' }, { status: 403 });
      }
      if (isActive === 'missing-otp-role-replacement') {
        return NextResponse.json(
          { message: 'Another active employee must cover the Admin, BM, or HRM responsibilities before suspension.' },
          { status: 409 }
        );
      }
      if (isActive === null) {
        return NextResponse.json({ message: 'Employee not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true, isActive });
    }

    if (action === 'reset-password') {
      if (!isPositiveInteger(requestingEmployeeId)) {
        return NextResponse.json(
          { message: 'A valid requesting employee ID is required.' },
          { status: 400 }
        );
      }

      const reset = await renewEmployeePassword(employeeId, requestingEmployeeId);
      if (!reset) {
        return NextResponse.json({ message: 'Employee not found.' }, { status: 404 });
      }

      const emailResult = await sendEmployeePasswordResetEmail({
        recipientEmail: reset.recipientEmail,
        recipientName: reset.recipientName,
        temporaryPassword: reset.temporaryPassword,
        requestingEmployee: reset.requestingEmployee,
      });
      if (!emailResult.success) {
        return NextResponse.json(
          { message: 'The password was reset, but the email could not be sent. Contact system administration.' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `A new password was emailed to ${reset.recipientName} at ${reset.recipientEmail}.`,
      });
    }

    return NextResponse.json({ message: 'Unsupported employee action.' }, { status: 400 });
  } catch (error) {
    console.error('Error processing employee action:', error);
    return NextResponse.json({ message: 'Failed to process employee action.' }, { status: 500 });
  }
}

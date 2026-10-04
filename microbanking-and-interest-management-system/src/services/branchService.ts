import { Branch } from '@/types';
import { mockBranches } from '@/data/mockData';

// In-memory branch records repository
let branchesState: Branch[] = [...mockBranches];

// Valid OTP codes for administrative authorization
const validOtpCodes = new Set(['849201', '731904', '123456']);

// Retrieve all bank branches
export function getBranches(): Branch[] {
  return [...branchesState];
}

// Add a new branch requiring Higher Management OTP authorization
export function createBranchWithOtp(
  data: Omit<Branch, 'id' | 'openedDate'>,
  otpCode: string
): { success: boolean; message: string; branch?: Branch } {
  if (!validOtpCodes.has(otpCode.trim())) {
    return {
      success: false,
      message: 'Invalid or expired Higher Management OTP. Authorization rejected.',
    };
  }

  const newBranch: Branch = {
    ...data,
    id: `BR${String(branchesState.length + 1).padStart(3, '0')}`,
    openedDate: new Date().toISOString().split('T')[0],
  };

  branchesState = [...branchesState, newBranch];
  return {
    success: true,
    message: `Branch "${newBranch.name}" created successfully under code ${newBranch.code}.`,
    branch: newBranch,
  };
}

// Update branch parameters with OTP authorization
export function updateBranchWithOtp(
  branch: Branch,
  otpCode: string
): { success: boolean; message: string } {
  if (!validOtpCodes.has(otpCode.trim())) {
    return {
      success: false,
      message: 'Invalid Higher Management OTP. Unauthorized branch modification.',
    };
  }

  branchesState = branchesState.map((b) => (b.id === branch.id ? branch : b));
  return {
    success: true,
    message: `Branch "${branch.name}" parameters updated successfully.`,
  };
}

// Toggle branch operational status with OTP authorization
export function toggleBranchStatusWithOtp(
  branchId: string,
  otpCode: string
): { success: boolean; message: string } {
  if (!validOtpCodes.has(otpCode.trim())) {
    return {
      success: false,
      message: 'OTP validation failed. Cannot alter branch operational status.',
    };
  }

  let updatedName = '';
  branchesState = branchesState.map((b) => {
    if (b.id === branchId) {
      updatedName = b.name;
      return { ...b, status: b.status === 'Active' ? 'Inactive' : 'Active' };
    }
    return b;
  });

  return {
    success: true,
    message: `Operational status updated for branch ${updatedName}.`,
  };
}

// Executive performance metrics across all bank branches
export function getBranchMetrics() {
  return [
    {
      id: 'BR001',
      name: 'Colombo Central Main',
      deposits: 'Rs. 48.5M',
      customers: 6240,
      activeAccounts: 4890,
      growthRate: '+14.2%',
      status: 'Optimal',
    },
    {
      id: 'BR002',
      name: 'Kandy Metro Branch',
      deposits: 'Rs. 18.2M',
      customers: 3120,
      activeAccounts: 2280,
      growthRate: '+9.8%',
      status: 'Good',
    },
    {
      id: 'BR003',
      name: 'Galle Fort Coastal',
      deposits: 'Rs. 11.4M',
      customers: 2150,
      activeAccounts: 1450,
      growthRate: '+7.4%',
      status: 'Normal',
    },
    {
      id: 'BR004',
      name: 'Jaffna Northern Hub',
      deposits: 'Rs. 6.1M',
      customers: 1335,
      activeAccounts: 692,
      growthRate: '+5.1%',
      status: 'Expanding',
    },
  ];
}

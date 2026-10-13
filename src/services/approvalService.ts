import { ApprovalRequest } from '@/types';
import { mockApprovals } from '@/data/mockData';

// In-memory approval requests repository
let approvalsState: ApprovalRequest[] = [...mockApprovals];

// Retrieve approval requests, optionally filtered by branch
export function getApprovalRequests(branchId?: string): ApprovalRequest[] {
  if (branchId && branchId !== 'All') {
    return approvalsState.filter((r) => r.branchId === branchId);
  }
  return [...approvalsState];
}

// Approve an operational request
export function approveRequest(requestId: string): { success: boolean; message: string } {
  approvalsState = approvalsState.map((r) =>
    r.id === requestId ? { ...r, status: 'Approved' as const } : r
  );
  return { success: true, message: `Request ${requestId} approved successfully.` };
}

// Reject an operational request with specified reason
export function rejectRequest(
  requestId: string,
  reason: string
): { success: boolean; message: string } {
  approvalsState = approvalsState.map((r) =>
    r.id === requestId
      ? { ...r, status: 'Rejected' as const, rejectionReason: reason || 'Documentation incomplete' }
      : r
  );
  return { success: true, message: `Request ${requestId} rejected. Reason logged.` };
}

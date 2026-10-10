import { Customer } from '@/types';
import { mockCustomers } from '@/data/mockData';

// In-memory customer repository (ready to be replaced with backend API calls)
let customersState: Customer[] = [...mockCustomers];

// Retrieve customers, optionally filtered by branch
export function getCustomers(branchId?: string): Customer[] {
  if (branchId && branchId !== 'All') {
    return customersState.filter((c) => c.assignedBranchId === branchId);
  }
  return [...customersState];
}

// Register a new customer
export function createCustomer(
  data: Omit<Customer, 'id' | 'registeredDate'>
): { success: boolean; customer: Customer } {
  const newCustomer: Customer = {
    ...data,
    id: `CUST${String(customersState.length + 1).padStart(3, '0')}`,
    registeredDate: new Date().toISOString().split('T')[0],
  };
  customersState = [newCustomer, ...customersState];
  return { success: true, customer: newCustomer };
}

// Update existing customer record
export function updateCustomer(customer: Customer): { success: boolean; message: string } {
  customersState = customersState.map((c) => (c.id === customer.id ? customer : c));
  return { success: true, message: 'Customer details updated successfully.' };
}

// Toggle customer status between Active and Inactive
export function toggleCustomerStatus(customerId: string): { success: boolean; newStatus: string } {
  let newStatus = 'Active';
  customersState = customersState.map((c) => {
    if (c.id === customerId) {
      newStatus = c.status === 'Active' ? 'Inactive' : 'Active';
      return { ...c, status: newStatus as 'Active' | 'Inactive' };
    }
    return c;
  });
  return { success: true, newStatus };
}

// Issue temporary credentials for customer portal access
export function renewCustomerPassword(customerId: string): {
  success: boolean;
  temporaryPassword: string;
  message: string;
} {
  const customer = customersState.find((c) => c.id === customerId);
  const tempPass = `BTP-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    success: true,
    temporaryPassword: tempPass,
    message: `Temporary password sent via SMS to ${customer?.phone || 'customer phone'}.`,
  };
}

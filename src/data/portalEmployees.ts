export interface PortalEmployee {
  employeeId: number;
  branchId: number;
  name: string;
  email: string;
  roleId: string;
}

export const portalEmployees = {
  admin: {
    employeeId: 1,
    branchId: 0,
    name: 'Asela Bandara',
    email: 'asela.bandara@btrust.lk',
    roleId: 'A',
  },
  higherManagement: {
    employeeId: 2,
    branchId: 0,
    name: 'Duminda Ratnayake',
    email: 'duminda.ratnayake@btrust.lk',
    roleId: 'H',
  },
  branchManagement: {
    employeeId: 5,
    branchId: 1,
    name: 'Kelum Pushpakumara',
    email: 'kelum.pushpakumara@btrust.lk',
    roleId: 'B',
  },
} satisfies Record<string, PortalEmployee>;

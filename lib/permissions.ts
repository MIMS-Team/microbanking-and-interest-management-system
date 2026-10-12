import type { Queryable } from './db';
import { BusinessError } from './validation';

export async function requirePermission(tx:Queryable, employeeId:number, permission:string):Promise<void> {
  const result=await tx.query(`SELECT s.id FROM staff s
    JOIN role_catalog r ON r.code=s.permission_role AND r.business_role=s.role AND r.active=TRUE
    JOIN role_permissions p ON p.role_code=r.code AND p.permission_code=$2
    JOIN permission_catalog c ON c.code=p.permission_code
    WHERE s.id=$1 AND s.status='active' FOR SHARE`,[employeeId,permission]);
  if(!result.rows.length) throw new BusinessError('This permission has not been granted to your employee role.',403);
}

export const actionPermission:Record<string,string>={
 'customer.create':'customer.manage','customer.update':'customer.manage','customer.status':'customer.manage',
 'account.create':'account.manage','account.update':'account.manage','account.close':'account.manage','account.status':'account.manage',
 'transaction.create':'transaction.post','transaction.reverse':'correction.request',
 'fd.create':'fd.manage','fd.close':'fd.manage','approval.review':'approval.review',
 'account.processInactivity':'interest.manage','interest.run':'interest.manage','interest.accrue':'interest.manage','fd.processMaturities':'interest.manage',
 'rate.update':'rate.manage','branch.create':'organization.manage','branch.update':'organization.manage','staff.create':'employees.manage','staff.update':'employees.manage','agent.reassign':'organization.manage',
};

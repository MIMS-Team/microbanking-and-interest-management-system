import { getActiveDbAdapterName, getSqlPool, getSqliteDb } from './db';
import type { RowDataPacket } from 'mysql2/promise';
export async function employeePermissions(id:number):Promise<string[]>{
  if(getActiveDbAdapterName()!=='sqlite'){
    const [rows]=await getSqlPool().query<RowDataPacket[]>(`SELECT p.permission_code FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.business_role=s.role AND r.active=1 JOIN role_permissions p ON p.role_code=r.code WHERE s.id=? AND s.status='active'`,[id]);return rows.map(r=>String(r.permission_code));
  }
  const row=getSqliteDb().prepare('SELECT role,status FROM staff WHERE id=?').get(id);if(row?.status!=='active')return [];
  const grants:Record<string,string[]>={admin:['auth.login','employees.read','employees.manage','organization.manage','rate.manage'],higher_manager:['auth.login','employees.read','employees.approve','financial.read','approval.review','reports.read','interest.manage','organization.manage'],manager:['auth.login','financial.read','approval.review','reports.read','interest.manage','organization.manage'],agent:['auth.login','financial.read','customer.manage','account.manage','fd.manage','transaction.post','correction.request']};
  return grants[String(row.role)]||[];
}

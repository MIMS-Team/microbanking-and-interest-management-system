"use server";

import { RoleOption } from '@/types';
import sql from '@/src/lib/db';

export async function getRoles(): Promise<{
  roles: RoleOption[];
  secondaryOtpRoles: Array<'BM' | 'HRM'>;
}> {
  const roleRows = await sql`
    SELECT code AS role_id,
      CASE business_role
        WHEN 'higher_manager' THEN 'Higher Management'
        WHEN 'manager' THEN 'Branch Manager'
        WHEN 'agent' THEN 'Field Agent'
        ELSE 'Admin'
      END AS title
    FROM role_catalog
    WHERE active = true
    ORDER BY display_name
  `;

  return {
    roles: roleRows.map((row: Record<string, unknown>) => ({
      id: String(row.role_id),
      title: String(row.title),
    })),
    // These are the only supplemental roles that can receive administrative OTPs.
    secondaryOtpRoles: ['BM', 'HRM'],
  };
}

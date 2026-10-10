"use server";

import { RoleOption } from '@/types';
import sql from '@/src/lib/db';

export async function getRoles(): Promise<{
  roles: RoleOption[];
  secondaryOtpRoles: Array<'BM' | 'HRM'>;
}> {
  const roleRows = await sql`
    SELECT role_id, title
    FROM role
    ORDER BY title
  `;

  return {
    roles: roleRows.map((row: Record<string, unknown>) => ({
      id: String(row.role_id),
      title: String(row.title),
    })),
    secondaryOtpRoles: ['BM', 'HRM'],
  };
}

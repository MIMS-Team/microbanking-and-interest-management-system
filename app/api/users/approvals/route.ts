import { hrPage } from '@/lib/server/hr-page';
import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { requireUser, jsonError, NO_CACHE_HEADERS, verifyCsrf } from '@/lib/server/api';
import { AuthError, employeeHasPermission, runInTransaction } from '@/lib/server/db';
import { lockAdministratorGuard } from '@/lib/server/employee-confirmation';

export const runtime='nodejs';
export async function GET(request:NextRequest){
  try{
    const {user}=await requireUser(request,['admin','higher_manager']);
    if(!await employeeHasPermission(user.id,'employees.read'))throw new AuthError('Employee read permission is required.',403);
    return NextResponse.json(await hrPage(user,new URL(request.url).searchParams),{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
export async function POST(request:NextRequest){
  try{
    verifyCsrf(request);const {user}=await requireUser(request,['higher_manager']);
    if(!await employeeHasPermission(user.id,'employees.approve'))throw new AuthError('Employee approval permission is required.',403);
    const {challengeId,reason}=await request.json();
    if(typeof challengeId!=='string'||typeof reason!=='string'||reason.trim().length<5||reason.length>300)throw new AuthError('A request and rejection reason (5–300 characters) are required.');
    const authorize=(r:Record<string,unknown>|undefined)=>{
      if(!r)throw new AuthError('Request not found.',404);
      const m=typeof r.metadata==='string'?JSON.parse(r.metadata):r.metadata;
      if(r.employee_id!==user.id||[m.createdByAdminId,m.requestedByAdminId].includes(user.id))throw new AuthError('Only the assigned independent reviewer may reject this request.',403);
      if(!['employee_creation','employee_deactivation'].includes(String(r.purpose))||r.consumed_at||new Date(String(r.expires_at)).getTime()<=Date.now())throw new AuthError('Request is no longer pending.',409);
      return m;
    };
    await runInTransaction(async conn=>{
      await lockAdministratorGuard(conn);
      const [[current]]=await conn.query<RowDataPacket[]>("SELECT s.id FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.active=1 AND r.business_role=s.role JOIN role_permissions p ON p.role_code=r.code AND p.permission_code='employees.approve' WHERE s.id=? AND s.status='active' FOR SHARE",[user.id]);
      if(!current)throw new AuthError('Reviewer authority changed.',403);
      const [[row]]=await conn.query<RowDataPacket[]>('SELECT * FROM otp_challenges WHERE id=? FOR UPDATE',[challengeId]);const m=authorize(row);
      if(m.approval_id){const [result]=await conn.query("UPDATE approvals SET status='rejected',reviewed_by=?,reviewed_at=UTC_TIMESTAMP(),notes=? WHERE id=? AND status='pending'",[user.id,reason.trim(),m.approval_id]);if((result as {affectedRows:number}).affectedRows!==1)throw new AuthError('Request has already been decided.',409);}
      await conn.query("UPDATE otp_challenges SET consumed_at=UTC_TIMESTAMP(),metadata=JSON_SET(metadata,'$.decision','rejected') WHERE id=?",[challengeId]);
      await conn.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES(?,'approval.rejected','staff',?,?)",[user.id,m.targetId||null,JSON.stringify({approval_id:m.approval_id,reason:reason.trim()})]);
    },db=>{const row=db.prepare('SELECT * FROM otp_challenges WHERE id=?').get(challengeId);const m=authorize(row);m.decision='rejected';db.prepare('UPDATE otp_challenges SET consumed_at=?,metadata=? WHERE id=?').run(new Date().toISOString(),JSON.stringify(m),challengeId);});
    return NextResponse.json({message:'Employee request rejected. No employee change was applied.'},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}

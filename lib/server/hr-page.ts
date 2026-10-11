import type {RowDataPacket} from 'mysql2/promise';
import {AuthError,getActiveDbAdapterName,getMySqlPool,getSqliteDb,parseDateSafe,type PublicEmployee} from './db';
export async function hrPage(user:PublicEmployee,params:URLSearchParams){
  const page=Number(params.get('page')||1),pageSize=20;
  if(!Number.isSafeInteger(page)||page<1||page>100000)throw new AuthError('Invalid HR history page.');
  const mysql=getActiveDbAdapterName()==='mysql';
  const requester=mysql?"CAST(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.createdByAdminId')),JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.requestedByAdminId'))) AS UNSIGNED)":"COALESCE(json_extract(o.metadata,'$.createdByAdminId'),json_extract(o.metadata,'$.requestedByAdminId'))";
  const scope=`o.purpose IN ('employee_creation','employee_deactivation') AND ${user.role==='admin'?requester:'o.employee_id'}=?`;
  const base=mysql?`SELECT o.id,o.employee_id,o.purpose,o.expires_at,o.consumed_at,o.metadata,o.attempts,o.max_attempts,p.id AS approval_id,p.status AS decision,p.target_version,s.full_name AS approver_name,t.full_name AS target_name,t.email AS target_email,t.role AS target_role,t.branch_id AS target_branch,t.version AS current_version
    FROM otp_challenges o JOIN staff s ON s.id=o.employee_id LEFT JOIN approvals p ON p.id=JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.approval_id')) LEFT JOIN staff t ON t.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(o.metadata,'$.targetId')) AS UNSIGNED)`:
    `SELECT o.*,s.full_name AS approver_name,t.full_name AS target_name,t.email AS target_email,t.role AS target_role,t.branch_id AS target_branch,t.version AS current_version FROM otp_challenges o JOIN staff s ON s.id=o.employee_id LEFT JOIN staff t ON t.id=json_extract(o.metadata,'$.targetId')`;
  const sql=base+` WHERE ${scope} ORDER BY o.created_at DESC,o.id DESC LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`;
  const rows=mysql?(await getMySqlPool().query<RowDataPacket[]>(sql,[user.id]))[0]:getSqliteDb().prepare(sql).all(user.id);
  const countSql=`SELECT COUNT(*) AS total FROM otp_challenges o WHERE ${scope}`;
  const count=mysql?(await getMySqlPool().query<RowDataPacket[]>(countSql,[user.id]))[0][0]:getSqliteDb().prepare(countSql).get(user.id)!;
  const requests=rows.map(row=>{
    const r=row as Record<string,unknown>,m=typeof r.metadata==='string'?JSON.parse(r.metadata):r.metadata||{};
    const stale=r.current_version!==undefined&&r.target_version!==undefined&&r.target_version!==null&&Number(r.current_version)!==Number(r.target_version);
    return {challengeId:r.id,approvalId:r.approval_id,approverId:Number(r.employee_id),approverName:r.approver_name,requestedBy:m.createdByAdminId??m.requestedByAdminId,purpose:r.purpose,targetId:m.targetId,
      proposal:{full_name:m.full_name??r.target_name,email:m.email??r.target_email,role:m.role??r.target_role,branch_id:m.branch_id??r.target_branch,...(m.targetId?{status:'inactive'}:{})},expiresAt:parseDateSafe(String(r.expires_at)).toISOString(),
      status:r.decision==='rejected'||m.decision==='rejected'?'rejected':r.consumed_at?'approved':parseDateSafe(String(r.expires_at)).getTime()<=Date.now()?'expired':Number(r.attempts)>=Number(r.max_attempts)?'locked':stale?'stale':'pending'};
  });
  return {requests,userId:user.id,page,pageSize,total:Number(count.total)};
}

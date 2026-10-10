import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// The existing HR OTP transport shares the canonical approval ledger. Only
// non-secret proposed fields are copied; password verifiers stay in OTP metadata.
export async function recordEmployeeApproval(conn: PoolConnection, challengeId: string): Promise<void> {
  const [rows]=await conn.execute<RowDataPacket[]>('SELECT * FROM otp_challenges WHERE id=? FOR UPDATE',[challengeId]);
  const challenge=rows[0];
  if(!challenge || !['employee_creation','employee_deactivation'].includes(challenge.purpose)) return;
  const metadata=typeof challenge.metadata==='string'?JSON.parse(challenge.metadata):challenge.metadata;
  if(!metadata || metadata.approval_id) return;
  const requester=metadata.createdByAdminId??metadata.requestedByAdminId;
  if(!requester) return; // Existing low-level fixture/legacy challenges have no request envelope.
  const target=challenge.purpose==='employee_deactivation'?metadata.targetId:null;
  let version=null,branch=metadata.branch_id??null;
  if(target) {
    const [staff]=await conn.execute<RowDataPacket[]>('SELECT version,branch_id FROM staff WHERE id=? FOR UPDATE',[target]);
    if(!staff[0]) throw new Error('Employee approval target no longer exists.');
    version=staff[0].version;branch=staff[0].branch_id;
  }
  const payload=target?{hr_challenge_required:true,status:'inactive',reason:'Administrator requested deactivation'}:
    {hr_challenge_required:true,full_name:metadata.full_name,email:metadata.email,role:metadata.role,branch_id:branch,status:'active'};
  const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO approvals
    (type,entity_id,employee_id,target_version,branch_id,requested_by,intended_approver_id,authority,summary,payload,expires_at)
    VALUES(?,?,?,?,?,?,?,'higher_manager',?,?,?)`,
    [target?'staff.update':'staff.create',target,target,version,branch,requester,challenge.employee_id,
      target?'Employee deactivation':'Employee creation',JSON.stringify(payload),challenge.expires_at]);
  await conn.execute("UPDATE otp_challenges SET metadata=JSON_SET(metadata,'$.approval_id',?) WHERE id=?",[insert.insertId,challengeId]);
}

export async function lockEmployeeApproval(conn:PoolConnection,challengeId:string):Promise<RowDataPacket|undefined> {
  const [rows]=await conn.execute<RowDataPacket[]>('SELECT * FROM otp_challenges WHERE id=? FOR UPDATE',[challengeId]);
  const challenge=rows[0];
  if(!challenge) return undefined;
  const metadata=typeof challenge.metadata==='string'?JSON.parse(challenge.metadata):challenge.metadata;
  if(!metadata?.approval_id) return undefined; // Already-issued legacy OTPs retain the existing authorization path.
  const [requests]=await conn.execute<RowDataPacket[]>('SELECT * FROM approvals WHERE id=? FOR UPDATE',[metadata.approval_id]);
  const request=requests[0];
  if(!request || request.status!=='pending') throw new Error('Employee approval has already been decided.');
  const [reviewers]=await conn.execute<RowDataPacket[]>("SELECT id FROM staff WHERE id=? AND role='higher_manager' AND status='active' FOR SHARE",[challenge.employee_id]);
  const [requesters]=await conn.execute<RowDataPacket[]>("SELECT id FROM staff WHERE id=? AND role='admin' AND status='active' FOR SHARE",[request.requested_by]);
  if(!reviewers.length || !requesters.length || request.requested_by===challenge.employee_id || request.intended_approver_id!==challenge.employee_id) throw new Error('Employee approval authority changed.');
  if(request.employee_id!==null) {
    const [targets]=await conn.execute<RowDataPacket[]>('SELECT version FROM staff WHERE id=? FOR UPDATE',[request.employee_id]);
    if(targets[0]?.version!==request.target_version) throw new Error('Employee changed after approval was requested.');
  }
  return request;
}

export async function completeEmployeeApproval(conn:PoolConnection,request:RowDataPacket|undefined,employeeId:number):Promise<void> {
  if(!request) return;
  await conn.execute("UPDATE approvals SET status='approved',entity_id=?,employee_id=?,reviewed_by=intended_approver_id,reviewed_at=CURRENT_TIMESTAMP,notes='Confirmed by assigned reviewer with OTP' WHERE id=?",[employeeId,employeeId,request.id]);
  await conn.execute("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,branch_id,details) VALUES(?,'approval.approved','staff',?,?,?)",[request.intended_approver_id,employeeId,request.branch_id,JSON.stringify({approval_id:request.id,type:request.type})]);
}

export async function assertNoAgentPortfolio(conn:PoolConnection,employeeId:number):Promise<void> {
  const [rows]=await conn.execute<RowDataPacket[]>(`SELECT
    EXISTS(SELECT 1 FROM customers WHERE agent_id=? AND status IN ('active','inactive','pending')) OR
    EXISTS(SELECT 1 FROM savings_accounts WHERE agent_id=? AND status IN ('active','inactive','pending')) AS assigned`,[employeeId,employeeId]);
  if(rows[0].assigned) throw new Error('Reassign customers and open accounts through approval before changing this employee assignment or status.');
}

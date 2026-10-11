import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { DatabaseSync } from 'node:sqlite';
import { AuthError, parseDateSafe, type PublicEmployee, type OtpChallengeRecord, type CreateEmployeeData } from './db';
import { otpMatches } from './otp-verifier';
import { lockEmployeeApproval } from './employee-approvals';

type Envelope=CreateEmployeeData & {targetId?:number;createdByAdminId?:number;requestedByAdminId?:number;intendedApproverId?:number;approval_id?:number};
type Person={id:number;role:string;status:string};
export type ConfirmationMeta={ip_address?:string|null;user_agent?:string|null};

export async function lockAdministratorGuard(conn:PoolConnection) {
  const [rows]=await conn.query<RowDataPacket[]>("SELECT name FROM database_guards WHERE name='active-administrators' FOR UPDATE");
  if(rows.length!==1) throw new AuthError('Administrator database guard is missing; apply the reviewed migrations.',409);
}

export async function confirmationAudit(conn:PoolConnection,employeeId:number,email:string,event:string,details:Record<string,unknown>,meta?:ConfirmationMeta) {
  await conn.execute('INSERT INTO authentication_audit(employee_id,email,event_type,details,ip_address,user_agent) VALUES(?,?,?,?,?,?)',
    [employeeId,email,event,JSON.stringify(details),meta?.ip_address??null,meta?.user_agent??null]);
}
export function sqliteConfirmationAudit(db:DatabaseSync,employeeId:number,email:string,event:string,details:Record<string,unknown>,meta?:ConfirmationMeta) {
  db.prepare('INSERT INTO authentication_audit(employee_id,email,event_type,details,ip_address,user_agent) VALUES(?,?,?,?,?,?)').run(
    employeeId,email,event,JSON.stringify(details),meta?.ip_address??null,meta?.user_agent??null);
}

function authorize(challenge:OtpChallengeRecord|undefined,purpose:string,actor:PublicEmployee,
  people:Person[], expectedTarget?:number):Envelope {
  if(!actor?.id) throw new AuthError('An authenticated approver is required.',401);
  if(!challenge || challenge.purpose!==purpose) throw new AuthError('Invalid employee approval challenge.',401);
  const payload=JSON.parse(challenge.metadata??'{}') as Envelope;
  const requesterId=payload.createdByAdminId??payload.requestedByAdminId;
  if(actor.id===requesterId) throw new AuthError(`Requester cannot approve their own ${purpose==='employee_creation'?'creation':'deactivation'} request.`,403,'SELF_APPROVAL_PROHIBITED');
  if(actor.id===payload.targetId) throw new AuthError('Self-deactivation approval is prohibited.',403,'SELF_DEACTIVATION_PROHIBITED');
  const reviewer=people.find(p=>p.id===actor.id),requester=people.find(p=>p.id===requesterId);
  if(!reviewer || reviewer.status!=='active' || !['higher_manager','admin'].includes(reviewer.role)) throw new AuthError('Approver is not authorized to approve this employee request.',403);
  if(actor.id!==challenge.employee_id || (payload.intendedApproverId && payload.intendedApproverId!==actor.id)) throw new AuthError('Only the assigned approver can confirm this request.',403,'WRONG_APPROVER');
  if(!requester || requester.status!=='active' || !['admin','higher_manager'].includes(requester.role)) throw new AuthError('Employee approval authority changed.',403);
  if(purpose==='employee_deactivation' && (!payload.targetId || (expectedTarget!==undefined && expectedTarget!==payload.targetId))) throw new AuthError('Deactivation URL target does not match the approval challenge.',403);
  if(challenge.is_pending || challenge.consumed_at) throw new AuthError('This approval is pending delivery or has already been confirmed.',401);
  if(parseDateSafe(challenge.expires_at).getTime()<=Date.now()) throw new AuthError('This approval code has expired.',401);
  if(challenge.attempts>=challenge.max_attempts) throw new AuthError('Maximum verification attempts exceeded.',401);
  return payload;
}

// Every HR confirmation: guard -> challenge -> approval -> staff (ascending id)
// -> branch -> mutation/session rows. Wrong-code denial is returned, then thrown
// by the public service AFTER commit so its authorized attempt is durable.
export async function validateMySqlConfirmation(conn:PoolConnection,id:string,purpose:string,rawOtp:string,
 actor:PublicEmployee,expectedTarget?:number,meta?:ConfirmationMeta) {
  if(!actor?.id) throw new AuthError('An authenticated approver is required.',401);
  await lockAdministratorGuard(conn);
  const [challenges]=await conn.execute<RowDataPacket[]>('SELECT * FROM otp_challenges WHERE id=? FOR UPDATE',[id]);
  const challenge=challenges[0] as OtpChallengeRecord|undefined;
  const metadata=challenge?.metadata ? (typeof challenge.metadata==='string'?JSON.parse(challenge.metadata):challenge.metadata) : {};
  if(challenge && typeof challenge.metadata!=='string') challenge.metadata=JSON.stringify(challenge.metadata);
  const request=await lockEmployeeApproval(conn,id);
  const [people]=await conn.query<RowDataPacket[]>('SELECT id,role,status FROM staff WHERE id IN (?) ORDER BY id FOR UPDATE',
    [[actor.id,metadata.createdByAdminId??metadata.requestedByAdminId??0,metadata.targetId??0]]);
  const payload=authorize(challenge,purpose,actor,people as Person[],expectedTarget);
  if(request && (request.type!==(purpose==='employee_creation'?'staff.create':'staff.update') ||
    request.requested_by!==(payload.createdByAdminId??payload.requestedByAdminId) ||
    (purpose==='employee_deactivation' && request.employee_id!==payload.targetId))) throw new AuthError('Challenge and approval target do not match.',403);
  if(request?.employee_id) {
    const [targets]=await conn.execute<RowDataPacket[]>('SELECT version FROM staff WHERE id=?',[request.employee_id]);
    if(targets[0]?.version!==request.target_version) throw new AuthError('Employee changed after approval was requested.',409);
  }
  const [requesterGrants]=await conn.query<RowDataPacket[]>(`SELECT s.id FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.active=1 AND r.business_role=s.role
    JOIN role_permissions p ON p.role_code=r.code AND p.permission_code='employees.manage' WHERE s.id=? FOR SHARE`,[payload.createdByAdminId??payload.requestedByAdminId]);
  if(!requesterGrants.length) throw new AuthError('Requester authority changed.',403);
  if(purpose==='employee_deactivation') {
    const [targets]=await conn.execute<RowDataPacket[]>('SELECT status,email FROM staff WHERE id=?',[payload.targetId!]);
    if(!targets[0] || targets[0].status!=='active') throw new AuthError('Target employee is no longer active.',409);
  }
  if(request?.expires_at && parseDateSafe(String(request.expires_at)).getTime()<=Date.now()) throw new AuthError('Approval request has expired.',401);
  if(request && purpose==='employee_creation') {
    const proposal=typeof request.payload==='string'?JSON.parse(request.payload):request.payload;
    for(const field of ['full_name','email','role','branch_id'] as const) {
      if(proposal[field]!==payload[field]) throw new AuthError('Challenge and approval proposal do not match.',403);
    }
  }
  const [grants]=await conn.query<RowDataPacket[]>(`SELECT s.id FROM staff s JOIN role_catalog r ON r.code=s.permission_role AND r.active=1 AND r.business_role=s.role
    JOIN role_permissions p ON p.role_code=r.code AND p.permission_code='employees.approve' WHERE s.id=? FOR SHARE`,[actor.id]);
  if(!grants.length) throw new AuthError('Employee approval permission is not granted.',403);
  if(!otpMatches(rawOtp,challenge!.code_hash)) {
    await conn.execute('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?',[id]);
    await confirmationAudit(conn,actor.id,'approver@system','wrong_otp',{purpose},meta);
    return {payload,request,valid:false};
  }
  return {payload,request,valid:true};
}

export function validateSqliteConfirmation(db:DatabaseSync,id:string,purpose:string,rawOtp:string,actor:PublicEmployee,expectedTarget?:number,meta?:ConfirmationMeta) {
  if(!actor?.id) throw new AuthError('An authenticated approver is required.',401);
  const challenge=db.prepare('SELECT * FROM otp_challenges WHERE id=?').get(id) as unknown as OtpChallengeRecord|undefined;
  const people=db.prepare('SELECT id,role,status FROM staff').all() as unknown as Person[];
  const payload=authorize(challenge,purpose,actor,people,expectedTarget);
  if(!otpMatches(rawOtp,challenge!.code_hash)) {
    db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?').run(id);
    sqliteConfirmationAudit(db,actor.id,'approver@system','wrong_otp',{purpose},meta);
    return {payload,valid:false};
  }
  return {payload,valid:true};
}

export async function protectLastAdministrator(conn:PoolConnection,id:number,nextRole:string,nextStatus:string) {
  const [rows]=await conn.execute<RowDataPacket[]>('SELECT role,status FROM staff WHERE id=? FOR UPDATE',[id]);
  if(rows[0]?.role==='admin' && rows[0].status==='active' && (nextRole!=='admin'||nextStatus!=='active')) {
    const [[count]]=await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'");
    if(Number(count.n)<=1) throw new AuthError('Cannot remove the last active Administrator.',409);
  }
}
export function protectSqliteAdministrator(db:DatabaseSync,id:number,nextRole:string,nextStatus:string) {
  const current=db.prepare('SELECT role,status FROM staff WHERE id=?').get(id) as {role:string;status:string}|undefined;
  const count=db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role='admin' AND status='active'").get() as {n:number};
  if(current?.role==='admin' && current.status==='active' && (nextRole!=='admin'||nextStatus!=='active') && count.n<=1) throw new AuthError('Cannot remove the last active Administrator.',409);
}

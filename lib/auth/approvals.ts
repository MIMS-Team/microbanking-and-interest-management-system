import { randomInt, randomUUID } from 'node:crypto';
import { getDb, type Queryable } from '../db';
import type { Staff } from '../types';
import { HttpError } from '../http';
import { hashOtp, otpMatches } from '../server/auth';
import { sendOtpEmail } from '../server/email';

function requireReviewer(user: Staff) {
  if(user.role!=='higher_manager'||user.status!=='active') throw new HttpError(403,'An active higher manager must approve employee changes.');
}
async function pendingRequest(tx:Queryable,user:Staff,id:number) {
  const {rows}=await tx.query(`SELECT a.id FROM approvals a JOIN staff s ON s.id=$2
    WHERE a.id=$1 AND a.type IN ('staff.create','staff.update') AND a.status='pending'
      AND a.requested_by<>s.id AND s.status='active' AND s.role='higher_manager'
      AND LOWER(s.email)=LOWER($3) AND (a.intended_approver_id IS NULL OR a.intended_approver_id=s.id) FOR SHARE`,[id,user.id,user.email]);
  if(!rows.length) throw new HttpError(400,'Choose a pending employee request submitted by another staff member.');
}
export async function issueApprovalCode(user:Staff,approvalId:number) {
  requireReviewer(user); const database=await getDb(); const id=randomUUID(); const code=String(randomInt(100000,1000000));
  const issued=await database.transaction(async tx=>{
    await pendingRequest(tx,user,approvalId);
    await tx.query(`INSERT INTO banking_approval_limits(user_id,attempts) VALUES($1,0)
      ON DUPLICATE KEY UPDATE user_id=user_id`,[user.id]);
    const row=(await tx.query<{attempts:number;expired:number}>(`SELECT attempts,window_start<UTC_TIMESTAMP()-INTERVAL 15 MINUTE AS expired FROM banking_approval_limits WHERE user_id=$1 FOR UPDATE`,[user.id])).rows[0];
    await tx.query(`UPDATE banking_approval_limits SET attempts=$1,window_start=IF($2,UTC_TIMESTAMP(),window_start) WHERE user_id=$3`,[row.expired?1:row.attempts+1,row.expired,user.id]);
    if(!row.expired && row.attempts>=8) return false;
    const pending=await tx.query(`SELECT id FROM banking_approval_challenges WHERE user_id=$1 AND is_pending=TRUE AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP()`,[user.id]);
    if(pending.rows.length) return false;
    await tx.query(`INSERT INTO banking_approval_challenges(id,user_id,approval_id,code_hash,expires_at,is_pending) VALUES($1,$2,$3,$4,UTC_TIMESTAMP()+INTERVAL 5 MINUTE,TRUE)`,[id,user.id,approvalId,hashOtp(code)]);
    return true;
  });
  if(!issued) throw new HttpError(429,'Too many approval codes requested or a delivery is already in progress.');
  try {
    await sendOtpEmail({to:user.email,purpose:'banking_approval',otpCode:code,subject:`MIMS: Employee approval #${approvalId}`,text:`Your code for employee approval #${approvalId} is ${code}. It expires in five minutes.`});
    await database.transaction(async tx=>{
      await tx.query('SELECT user_id FROM banking_approval_limits WHERE user_id=$1 FOR UPDATE',[user.id]);
      await tx.query('UPDATE banking_approval_challenges SET consumed_at=UTC_TIMESTAMP() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL',[user.id,id]);
      await tx.query('UPDATE banking_approval_challenges SET is_pending=FALSE WHERE id=$1',[id]);
    });
  } catch(error) {await database.query('UPDATE banking_approval_challenges SET consumed_at=UTC_TIMESTAMP() WHERE id=$1',[id]);throw error;}
  return {challenge_id:id,otp_required:true,message:'Enter the six-digit code sent to your staff email.'};
}
async function checkCode(tx:Queryable,user:Staff,approvalId:number,body:Record<string,unknown>,consume:boolean) {
  requireReviewer(user); await pendingRequest(tx,user,approvalId);
  if(typeof body.challenge_id!=='string'||typeof body.code!=='string'||!/^\d{6}$/.test(body.code)) return false;
  const challenge=(await tx.query<{id:string;code_hash:string}>(`SELECT id,code_hash FROM banking_approval_challenges WHERE id=$1 AND user_id=$2 AND approval_id=$3
    AND consumed_at IS NULL AND is_pending=FALSE AND expires_at>UTC_TIMESTAMP() AND attempts<5 FOR UPDATE`,[body.challenge_id,user.id,approvalId])).rows[0];
  if(!challenge) return false;
  if(!otpMatches(body.code,challenge.code_hash)) {
    await tx.query('UPDATE banking_approval_challenges SET attempts=attempts+1 WHERE id=$1',[challenge.id]); return false;
  }
  if(consume) await tx.query('UPDATE banking_approval_challenges SET consumed_at=UTC_TIMESTAMP() WHERE id=$1',[challenge.id]);
  return true;
}
export async function verifyApprovalCode(user:Staff,approvalId:number,body:Record<string,unknown>,consume=true) {
  const accepted=await (await getDb()).transaction(tx=>checkCode(tx,user,approvalId,body,consume));
  if(!accepted) throw new HttpError(400,'The approval code is invalid, expired, or has reached its attempt limit.');
}
export async function consumeApprovalCode(tx:Queryable,user:Staff,approvalId:number,body:Record<string,unknown>) {
  if(!await checkCode(tx,user,approvalId,body,true)) throw new HttpError(400,'The approval code is invalid or expired.');
}

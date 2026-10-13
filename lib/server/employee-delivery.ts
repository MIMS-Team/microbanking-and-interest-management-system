import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { RowDataPacket } from 'mysql2/promise';
import { AuthError, getActiveDbAdapterName, getMySqlPool, getSqliteDb, runInTransaction, parseDateSafe } from './db';
import { passwordHash } from './auth';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const binding=(row:Record<string,unknown>)=>hash(JSON.stringify([row.email,row.password_hash,row.role,row.branch_id,row.status,Number(row.must_change_password),Number(row.version??0)]));
type Kind='onboarding'|'account_update'|'password_change'|'account_status';
const invitationLifeMs=30*60*1000;
export async function queueEmployeeNotification(employeeId:number,kind:Kind){
  await runInTransaction(async connection=>{
    await connection.query('SELECT id FROM staff WHERE id=? FOR UPDATE',[employeeId]);
    const [[pending]]=await connection.query<RowDataPacket[]>("SELECT id FROM employee_notifications WHERE employee_id=? AND kind=? AND status IN ('pending','sending','failed') AND created_at>TIMESTAMPADD(MINUTE,-30,UTC_TIMESTAMP()) FOR UPDATE",[employeeId,kind]);
    if(!pending)await connection.query('INSERT INTO employee_notifications(employee_id,kind) VALUES(?,?)',[employeeId,kind]);
  },db=>{if(!db.prepare("SELECT id FROM employee_notifications WHERE employee_id=? AND kind=? AND status IN ('pending','sending','failed')").get(employeeId,kind))db.prepare('INSERT INTO employee_notifications(employee_id,kind,available_at,created_at) VALUES(?,?,?,?)').run(employeeId,kind,new Date().toISOString(),new Date().toISOString());});
}

/** SMTP is always outside a transaction. A retry creates a fresh hashed token. */
export async function deliverEmployeeNotifications(employeeId?:number){
  const owner=randomBytes(32).toString('hex');
  const claimed=await runInTransaction<{id:number;employee_id:number;kind:Kind;attempts:number}|null>(async connection=>{
    const [[row]]=await connection.query<RowDataPacket[]>(`SELECT * FROM employee_notifications WHERE (? IS NULL OR employee_id=?) AND attempts<5
      AND ((status IN ('pending','failed') AND available_at<=UTC_TIMESTAMP(3)) OR (status='sending' AND lease_until<UTC_TIMESTAMP(3))) ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`,[employeeId??null,employeeId??null]);
    if(!row)return null;
    await connection.query("UPDATE employee_notifications SET status='sending',owner=?,attempts=attempts+1,lease_until=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)) WHERE id=?",[owner,row.id]);
    return {id:Number(row.id),employee_id:Number(row.employee_id),kind:row.kind as Kind,attempts:Number(row.attempts)+1};
  },db=>{
    const now=new Date().toISOString(),row=db.prepare("SELECT * FROM employee_notifications WHERE (? IS NULL OR employee_id=?) AND attempts<5 AND ((status IN ('pending','failed') AND available_at<=?) OR (status='sending' AND lease_until<?)) ORDER BY id LIMIT 1").get(employeeId??null,employeeId??null,now,now);
    if(!row)return null;db.prepare("UPDATE employee_notifications SET status='sending',owner=?,attempts=attempts+1,lease_until=? WHERE id=?").run(owner,new Date(Date.now()+60000).toISOString(),row.id);return {id:Number(row.id),employee_id:Number(row.employee_id),kind:row.kind as Kind,attempts:Number(row.attempts)+1};
  });
  if(!claimed)return {status:'idle'};
  let tokenHash:string|undefined;
  try{
    const employee=getActiveDbAdapterName()==='mysql'?(await getMySqlPool().query<RowDataPacket[]>('SELECT * FROM staff WHERE id=?',[claimed.employee_id]))[0][0]:getSqliteDb().prepare('SELECT * FROM staff WHERE id=?').get(claimed.employee_id);
    if(!employee)throw new Error('ACCOUNT_UNAVAILABLE');
    let text='Your MIMS employee account was updated. Contact your administrator if you did not expect this change.';
    let subject='MIMS employee account notification';
    if(claimed.kind==='onboarding'){
      if(employee.status!=='active'||!employee.must_change_password){await cancelDelivery(claimed.id,owner);return {status:'cancelled'};}
      let origin=process.env.APP_URL;
      if(!origin||!/^https?:\/\//.test(origin)) origin = 'https://microbanking-and-interest-managemen.vercel.app';
      const token=randomBytes(32).toString('hex');tokenHash=hash(token);
      await runInTransaction(async conn=>{
        const [[current]]=await conn.query<RowDataPacket[]>('SELECT * FROM staff WHERE id=? FOR UPDATE',[employee.id]);
        if(binding(current)!==binding(employee))throw new Error('ACCOUNT_CHANGED');
        await conn.query("INSERT INTO employee_invitations(token_hash,employee_id,purpose,binding_hash,expires_at,is_pending) VALUES(?,?,'onboarding',?,?,1)",[tokenHash,employee.id,binding(employee),new Date(Date.now()+invitationLifeMs)]);
      },db=>{db.prepare("INSERT INTO employee_invitations(token_hash,employee_id,purpose,binding_hash,expires_at,is_pending) VALUES(?,?,'onboarding',?,?,1)").run(tokenHash!,employee.id,binding(employee),new Date(Date.now()+invitationLifeMs).toISOString());});
      subject='Set your MIMS employee password';text=`Your employee account was approved. Set your personal password within 30 minutes: ${new URL('/onboarding',origin).href}#token=${token}\nThis single-use link is personal. Do not share it.`;
    }else if(claimed.kind==='password_change')text='Your MIMS password was changed and previous sessions were revoked. Contact your administrator if you did not perform this recovery.';
    else if(claimed.kind==='account_status')text=`Your MIMS employee account status is ${employee.status}. Contact your administrator for details.`;
    if(!process.env.SMTP_HOST){
      console.info(`[MIMS-DEV-NOTIFICATION] To: ${employee.email} | Subject: ${subject} | ${text}`);
    } else {
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:10000});
      try{await transport.sendMail({from:process.env.SMTP_FROM,to:String(employee.email),subject,text});}finally{transport.close();}
    }
    if(tokenHash){
      await runInTransaction(async conn=>{
        const [[current]]=await conn.query<RowDataPacket[]>('SELECT * FROM staff WHERE id=? FOR UPDATE',[employee.id]);
        if(binding(current)!==binding(employee))throw new Error('ACCOUNT_CHANGED');
        const [[notification]]=await conn.query<RowDataPacket[]>('SELECT id FROM employee_notifications WHERE id=? AND owner=? AND status=\'sending\' AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE',[claimed.id,owner]);
        if(!notification)throw new Error('DELIVERY_FENCED');
        await conn.query('UPDATE employee_invitations SET consumed_at=UTC_TIMESTAMP(3) WHERE employee_id=? AND consumed_at IS NULL AND is_pending=0 AND token_hash<>?',[employee.id,tokenHash]);
        const [activated]=await conn.query("UPDATE employee_invitations SET is_pending=0 WHERE token_hash=? AND consumed_at IS NULL AND expires_at>UTC_TIMESTAMP(3)",[tokenHash]);
        if((activated as {affectedRows:number}).affectedRows!==1)throw new Error('INVITATION_EXPIRED');
        await conn.query("UPDATE employee_notifications SET status='sent',delivered_at=UTC_TIMESTAMP(3),error_code=NULL,lease_until=NULL WHERE id=? AND owner=?",[claimed.id,owner]);
      },db=>{
        const current=db.prepare('SELECT * FROM staff WHERE id=?').get(employee.id);if(!current||binding(current)!==binding(employee))throw new Error('ACCOUNT_CHANGED');
        const notification=db.prepare("SELECT id FROM employee_notifications WHERE id=? AND owner=? AND status='sending' AND lease_until>?").get(claimed.id,owner,new Date().toISOString());if(!notification)throw new Error('DELIVERY_FENCED');
        db.prepare('UPDATE employee_invitations SET consumed_at=? WHERE employee_id=? AND consumed_at IS NULL AND is_pending=0 AND token_hash<>?').run(new Date().toISOString(),employee.id,tokenHash!);
        const activated=db.prepare('UPDATE employee_invitations SET is_pending=0 WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?').run(tokenHash!,new Date().toISOString());if(activated.changes!==1)throw new Error('INVITATION_EXPIRED');
        db.prepare("UPDATE employee_notifications SET status='sent',delivered_at=?,error_code=NULL,lease_until=NULL WHERE id=? AND owner=?").run(new Date().toISOString(),claimed.id,owner);
      });
    }else await finishDelivery(claimed.id,owner,true);
    return {status:'sent'};
  }catch{
    if(tokenHash)await runInTransaction(async c=>{await c.query('UPDATE employee_invitations SET consumed_at=UTC_TIMESTAMP(3) WHERE token_hash=?',[tokenHash]);},db=>{db.prepare('UPDATE employee_invitations SET consumed_at=? WHERE token_hash=?').run(new Date().toISOString(),tokenHash!);});
    await finishDelivery(claimed.id,owner,false);return {status:claimed.attempts>=5?'exhausted':'failed'};
  }
}
async function cancelDelivery(id:number,owner:string){
  await runInTransaction(async c=>{await c.query("UPDATE employee_notifications SET status='cancelled',lease_until=NULL,error_code=NULL WHERE id=? AND owner=?",[id,owner]);},db=>{db.prepare("UPDATE employee_notifications SET status='cancelled',lease_until=NULL,error_code=NULL WHERE id=? AND owner=?").run(id,owner);});
}
async function finishDelivery(id:number,owner:string,success:boolean){
  await runInTransaction(async c=>{await c.query(`UPDATE employee_notifications SET status=IF(?, 'sent',IF(attempts>=5,'exhausted','failed')),delivered_at=IF(?,UTC_TIMESTAMP(3),NULL),available_at=TIMESTAMPADD(SECOND,60,UTC_TIMESTAMP(3)),error_code=IF(?,NULL,'DELIVERY_UNAVAILABLE'),lease_until=NULL WHERE id=? AND owner=?`,[success,success,success,id,owner]);},db=>{db.prepare("UPDATE employee_notifications SET status=CASE WHEN ? THEN 'sent' WHEN attempts>=5 THEN 'exhausted' ELSE 'failed' END,delivered_at=?,available_at=?,error_code=?,lease_until=NULL WHERE id=? AND owner=?").run(Number(success),success?new Date().toISOString():null,new Date(Date.now()+60000).toISOString(),success?null:'DELIVERY_UNAVAILABLE',id,owner);});
}
export async function consumeEmployeeInvitation(token:string,password:string){
  if(!/^[a-f0-9]{64}$/.test(token)||password.length<10||password.length>128||!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password))throw new AuthError('Use a valid invitation and a password of 10–128 characters with uppercase, lowercase and a number.');
  const tokenHash=hash(token),newHash=passwordHash(password);
  const check=(invitation:Record<string,unknown>|undefined,employee:Record<string,unknown>|undefined)=>{
    if(!invitation||!employee||invitation.purpose!=='onboarding'||invitation.is_pending||invitation.consumed_at||parseDateSafe(String(invitation.expires_at)).getTime()<=Date.now()||employee.status!=='active'||!employee.must_change_password||invitation.binding_hash!==binding(employee))throw new AuthError('Invitation is expired, already used or invalidated. Request a new invitation.',409);
  };
  const employeeId=await runInTransaction(async c=>{
    // Invitations and account updates share the staff lock first.
    const [[lookup]]=await c.query<RowDataPacket[]>('SELECT employee_id FROM employee_invitations WHERE token_hash=?',[tokenHash]);
    const [[employee]]=await c.query<RowDataPacket[]>('SELECT * FROM staff WHERE id=? FOR UPDATE',[lookup?.employee_id??0]);
    const [[invitation]]=await c.query<RowDataPacket[]>('SELECT * FROM employee_invitations WHERE token_hash=? FOR UPDATE',[tokenHash]);check(invitation,employee);
    await c.query('UPDATE employee_invitations SET consumed_at=UTC_TIMESTAMP(3) WHERE employee_id=? AND consumed_at IS NULL',[employee.id]);
    await c.query('UPDATE staff SET password_hash=?,must_change_password=0,temporary_password_expires_at=NULL,version=version+1 WHERE id=?',[newHash,employee.id]);
    await c.query('UPDATE staff_authentication SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE employee_id=?',[newHash,employee.id]);
    await c.query('UPDATE employee_sessions SET revoked_at=UTC_TIMESTAMP() WHERE employee_id=? AND revoked_at IS NULL',[employee.id]);
    await c.query("INSERT INTO employee_notifications(employee_id,kind) VALUES(?,'password_change')",[employee.id]);
    await c.query("INSERT INTO authentication_audit(employee_id,email,event_type,details) VALUES(?,?,'password_reset_completed',?)",[employee.id,employee.email,JSON.stringify({purpose:'onboarding'})]);return Number(employee.id);
  },db=>{
    const invitation=db.prepare('SELECT * FROM employee_invitations WHERE token_hash=?').get(tokenHash),employee=db.prepare('SELECT * FROM staff WHERE id=?').get(invitation?.employee_id??0);check(invitation,employee);
    db.prepare('UPDATE employee_invitations SET consumed_at=? WHERE employee_id=? AND consumed_at IS NULL').run(new Date().toISOString(),employee!.id);
    db.prepare('UPDATE staff SET password_hash=?,must_change_password=0,temporary_password_expires_at=NULL WHERE id=?').run(newHash,employee!.id);
    db.prepare('UPDATE staff_authentication SET password_hash=?,failed_attempts=0,locked_until=NULL WHERE employee_id=?').run(newHash,employee!.id);
    db.prepare('UPDATE employee_sessions SET revoked_at=? WHERE employee_id=? AND revoked_at IS NULL').run(new Date().toISOString(),employee!.id);
    db.prepare("INSERT INTO employee_notifications(employee_id,kind,available_at) VALUES(?,'password_change',?)").run(employee!.id,new Date().toISOString());return Number(employee!.id);
  });
  return {employeeId,message:'Personal password set. Sign in with your work email and OTP.'};
}

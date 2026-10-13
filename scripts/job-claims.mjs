import {randomBytes} from 'node:crypto';

export async function claimJob(db,job,boundary,{leaseSeconds=Number(process.env.JOB_LEASE_SECONDS||900),retrySeconds=Number(process.env.JOB_RETRY_SECONDS||60),maxAttempts=Number(process.env.JOB_MAX_ATTEMPTS||5)}={}) {
  if(!Number.isInteger(leaseSeconds)||leaseSeconds<1||leaseSeconds>3600 || !Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>100 || !Number.isInteger(retrySeconds)||retrySeconds<0||retrySeconds>86400) throw new Error('Invalid bounded job lease/retry configuration.');
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(job)||!boundary||boundary.length>40) throw new Error('Invalid job boundary.');
  return db.transaction(async tx=>{
    // A stable guard serializes creation of absent claim rows.
    // INSERT IGNORE + FOR UPDATE works across
    // hosts and READ COMMITTED without relying on gap locks.
    await tx.query('INSERT IGNORE INTO database_guards(name) VALUES($1)',['job:'+job]);
    await tx.query('SELECT name FROM database_guards WHERE name=$1 FOR UPDATE',['job:'+job]);
    const previous=(await tx.query(`SELECT *,lease_until>UTC_TIMESTAMP(3) AS live,
      retry_after>UTC_TIMESTAMP(3) AS cooling FROM job_claims WHERE job=$1 AND boundary=$2 FOR UPDATE`,[job,boundary])).rows[0];
    if(previous?.status==='complete' || previous?.status==='running'&&previous.live || previous?.cooling || previous?.attempt>=maxAttempts) return null;
    if(previous?.status==='running') await tx.query("UPDATE job_runs SET status='failed',finished_at=UTC_TIMESTAMP(3),error_text='Owner lease expired; recovery claimed' WHERE id=$1 AND status='running'",[previous.run_id]);
    const owner=randomBytes(32).toString('hex'),attempt=(previous?.attempt??0)+1;
    const run=await tx.query("INSERT INTO job_runs(job,boundary,status,owner_token,attempt) VALUES($1,$2,'running',$3,$4)",[job,boundary,owner,attempt]);
    await tx.query(`INSERT INTO job_claims(job,boundary,status,owner_token,lease_until,retry_after,attempt,run_id)
      VALUES($1,$2,'running',$3,UTC_TIMESTAMP(3)+INTERVAL $4 SECOND,NULL,$5,$6)
      ON DUPLICATE KEY UPDATE status='running',owner_token=$3,lease_until=UTC_TIMESTAMP(3)+INTERVAL $4 SECOND,retry_after=NULL,attempt=$5,run_id=$6`,[job,boundary,owner,leaseSeconds,attempt,run.insertId]);
    return {job,boundary,owner,runId:run.insertId,attempt,leaseSeconds,retrySeconds};
  });
}
export async function fenceJob(tx,claim) {
  const rows=(await tx.query(`SELECT run_id FROM job_claims WHERE job=$1 AND boundary=$2 AND owner_token=$3
    AND status='running' AND lease_until>UTC_TIMESTAMP(3) FOR SHARE`,[claim.job,claim.boundary,claim.owner])).rows;
  if(!rows.length) throw new Error('Job ownership lease expired or changed.');
}
export async function heartbeatJob(db,claim) {
  const result=await db.query(`UPDATE job_claims SET lease_until=UTC_TIMESTAMP(3)+INTERVAL $4 SECOND
    WHERE job=$1 AND boundary=$2 AND owner_token=$3 AND status='running' AND lease_until>UTC_TIMESTAMP(3)`,[claim.job,claim.boundary,claim.owner,claim.leaseSeconds]);
  if(!result.affectedRows) throw new Error('Job ownership lease expired or changed.');
}
/** @param {unknown} error */
export async function finishJob(db,claim,error=null) {
  await db.transaction(async tx=>{
    await fenceJob(tx,claim);
    await tx.query(`UPDATE job_claims SET status=$4,retry_after=IF($4='failed',UTC_TIMESTAMP(3)+INTERVAL $5 SECOND,NULL)
      WHERE job=$1 AND boundary=$2 AND owner_token=$3`,[claim.job,claim.boundary,claim.owner,error?'failed':'complete',claim.retrySeconds]);
    // Error type only: DB/native/email errors may contain customer data or secrets.
    await tx.query('UPDATE job_runs SET status=$1,finished_at=UTC_TIMESTAMP(3),error_text=$2 WHERE id=$3',
      [error?'failed':'complete',error?'Job failed; inspect restricted application logs.':null,claim.runId]);
  });
  if(error) await notifyJobFailure(db,claim);
}
export async function notifyJobFailure(db,claim) {
  let status='unconfigured';
  if(process.env.JOB_FAILURE_PROVIDER==='webhook') {
    try {
      const url=new URL(process.env.JOB_FAILURE_WEBHOOK_URL);
      if(url.protocol!=='https:' && !(process.env.NODE_ENV==='test'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))) throw new Error('HTTPS failure receiver required.');
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'database-job-failed',job:claim.job,boundary:claim.boundary,attempt:claim.attempt,run_id:claim.runId}),signal:AbortSignal.timeout(5000)});
      status=response.ok?'delivered':'failed';
    } catch {status='failed';}
  }
  await db.query('UPDATE job_runs SET notification_status=$1 WHERE id=$2',[status,claim.runId]);
}

// Adapt raw mysql2 connections to the same numbered bindings used by services.
// Queries here contain no quoted $ placeholders; only this module's SQL is used.
export function mysqlJobDatabase(connection) {
  const query=async(sql,params=[])=>{
    const ordered=[];const converted=sql.replace(/\$(\d+)/g,(_,n)=>{ordered.push(params[Number(n)-1]);return '?';});
    const [result]=await connection.query(converted,ordered);
    return {rows:Array.isArray(result)?result:result.insertId?[{id:result.insertId}]:[],insertId:result.insertId,affectedRows:result.affectedRows};
  };
  const db={query,transaction:async callback=>{
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');await connection.beginTransaction();
    try {const result=await callback(db);await connection.commit();return result;} catch(error){await connection.rollback();throw error;}
  }};
  return db;
}

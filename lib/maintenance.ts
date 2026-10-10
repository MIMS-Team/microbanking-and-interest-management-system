import { getDb } from './db';
import { performAction } from './banking';
import { periodsBetween } from './banking/interest';
import { businessDates } from './banking/shared';
import type { Staff } from './types';
import { HttpError } from './http';
export async function runMaintenance(user:Staff) {
  if(user.role!=='higher_manager') throw new HttpError(403,'Organization maintenance requires a higher manager.');
  const db=await getDb(); const dates=await businessDates(db); const details:string[]=[];
  const run=await db.query("INSERT INTO job_runs(job,boundary,status) VALUES('maintenance',$1,'running')",[dates.today]);
  try {
    details.push((await performAction(user,{action:'interest.accrue'})).message);
    const oldest=(await db.query<{start_date:string|null}>("SELECT DATE_FORMAT(MIN(opened_at)+INTERVAL 330 MINUTE,'%Y-%m-%d') AS start_date FROM savings_accounts")).rows[0].start_date;
    if(oldest) for(const period of periodsBetween(oldest,dates.today.slice(0,7)+'-01')) details.push((await performAction(user,{action:'interest.run',period})).message);
    details.push((await performAction(user,{action:'fd.processMaturities'})).message);
    // Weekly review (Monday Colombo date); catch up once after a missed week.
    const last=(await db.query<{recent:number}>("SELECT COUNT(*) AS recent FROM job_runs WHERE job='inactivity' AND status='complete' AND boundary=DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%x-%v')")).rows[0];
    if(!last.recent) {
      details.push((await performAction(user,{action:'account.processInactivity'})).message);
      await db.query("INSERT INTO job_runs(job,boundary,status,finished_at) VALUES('inactivity',DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%x-%v'),'complete',UTC_TIMESTAMP())");
    }
    await db.query("UPDATE job_runs SET status='complete',finished_at=UTC_TIMESTAMP() WHERE id=$1",[run.insertId]);
    return {message:'Maintenance completed.',details};
  } catch(error) {
    await db.query("UPDATE job_runs SET status='failed',finished_at=UTC_TIMESTAMP(),error_text=$1 WHERE id=$2",[String((error as Error).message).slice(0,1000),run.insertId]);throw error;
  }
}

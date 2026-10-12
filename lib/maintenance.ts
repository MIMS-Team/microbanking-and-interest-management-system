import { getDb } from './db';
import { performAction } from './banking';
import { periodsBetween } from './banking/interest';
import { businessDates } from './banking/shared';
import type { Staff } from './types';
import { HttpError } from './http';
import { claimJob, heartbeatJob, finishJob } from '../scripts/job-claims.mjs';
export async function runMaintenance(user:Staff) {
  if(user.role!=='higher_manager') throw new HttpError(403,'Organization maintenance requires a higher manager.');
  const db=await getDb(); const dates=await businessDates(db); const details:string[]=[];
  const claim=await claimJob(db,'maintenance',dates.today);
  if(!claim) return {message:'Maintenance is already claimed, completed or awaiting a controlled retry.',details};
  const action=async(input:Parameters<typeof performAction>[1])=>{
    await heartbeatJob(db,claim);
    return performAction(user,input,claim);
  };
  try {
    details.push((await action({action:'interest.accrue'})).message);
    const oldest=(await db.query<{start_date:string|null}>("SELECT DATE_FORMAT(MIN(opened_at)+INTERVAL 330 MINUTE,'%Y-%m-%d') AS start_date FROM savings_accounts")).rows[0].start_date;
    if(oldest) for(const period of periodsBetween(oldest,dates.today.slice(0,7)+'-01')) details.push((await action({action:'interest.run',period})).message);
    details.push((await action({action:'fd.processMaturities'})).message);
    // Weekly review (Monday Colombo date); catch up once after a missed week.
    const week=(await db.query<{boundary:string}>("SELECT DATE_FORMAT(UTC_TIMESTAMP()+INTERVAL 330 MINUTE,'%x-%v') AS boundary")).rows[0].boundary;
    const inactivity=await claimJob(db,'inactivity',week);
    if(inactivity) {
      try {
        details.push((await performAction(user,{action:'account.processInactivity'},inactivity)).message);
        await finishJob(db,inactivity);
      } catch(error) {await finishJob(db,inactivity,error);throw error;}
    }
    await finishJob(db,claim);
    return {message:'Maintenance completed.',details};
  } catch(error) {
    await finishJob(db,claim,error);throw error;
  }
}

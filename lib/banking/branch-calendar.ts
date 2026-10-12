import {BusinessError} from '../validation';
import type {Queryable} from '../db';
export interface BranchCalendar{hours:Array<{weekday:number;opens:string;closes:string}>;holidays:string[]}
export function branchCalendar(input:unknown):BranchCalendar|undefined{
  if(input===undefined)return undefined;
  if(!input||typeof input!=='object')throw new BusinessError('Supply an explicit branch calendar.');
  const value=input as BranchCalendar;
  if(!Array.isArray(value.hours)||value.hours.length<1||value.hours.length>7||!Array.isArray(value.holidays)||value.holidays.length>1000)throw new BusinessError('Configure one to seven operating weekdays and at most 1000 holidays.');
  const seen=new Set<number>();
  const hours=value.hours.map(row=>{
    if(!Number.isInteger(row.weekday)||row.weekday<0||row.weekday>6||seen.has(row.weekday))throw new BusinessError('Each operating weekday must appear once.');seen.add(row.weekday);
    const time=(v:string)=>{if(typeof v!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v))throw new BusinessError('Branch hours must use valid 24-hour times.');return v.length===5?v+':00':v;};
    const opens=time(row.opens),closes=time(row.closes);if(opens>=closes)throw new BusinessError('Closing time must follow opening time within the same day. Overnight calendars require a separately approved policy.');
    return {weekday:row.weekday,opens,closes};
  });
  const holidays=value.holidays.map(day=>{if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||Number.isNaN(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw new BusinessError('Holidays must be valid calendar dates.');return day;});
  if(new Set(holidays).size!==holidays.length)throw new BusinessError('Duplicate branch holiday.');return {hours,holidays};
}
export async function applyBranchCalendar(tx:Queryable,id:number,input:unknown){
  const calendar=branchCalendar(input);if(!calendar)return;
  await tx.query('DELETE FROM branch_hours WHERE branch_id=$1',[id]);await tx.query('DELETE FROM branch_holidays WHERE branch_id=$1',[id]);
  for(const row of calendar.hours)await tx.query('INSERT INTO branch_hours(branch_id,weekday,opens,closes) VALUES($1,$2,$3,$4)',[id,row.weekday,row.opens,row.closes]);
  for(const day of calendar.holidays)await tx.query('INSERT INTO branch_holidays(branch_id,holiday,reason) VALUES($1,$2,$3)',[id,day,'Approved branch calendar']);
}

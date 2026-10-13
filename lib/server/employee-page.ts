import type {RowDataPacket} from 'mysql2/promise';
import {AuthError,getActiveDbAdapterName,getSqlPool,getSqliteDb,parseDateSafe} from './db';
export async function employeePage(params:URLSearchParams){
  const page=Number(params.get('page')||1),pageSize=Number(params.get('pageSize')||20),search=params.get('search')||'',sort=params.get('sort')||'newest';
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100||search.length>120||!['newest','oldest'].includes(sort))throw new AuthError('Invalid employee list parameters.');
  const mysql=getActiveDbAdapterName()!=='sqlite',values:Array<string|number>=[];let where=' WHERE 1=1';
  for(const field of ['role','status','branch_id']){const value=params.get(field);if(value){if(field==='branch_id'&&(!Number.isSafeInteger(Number(value))||Number(value)<1))throw new AuthError('Invalid branch filter.');if(field==='role'&&!['agent','manager','higher_manager','admin'].includes(value)||field==='status'&&!['active','inactive'].includes(value))throw new AuthError('Invalid employee filter.');where+=` AND ${field}=?`;values.push(field==='branch_id'?Number(value):value);}}
  if(search){where+=mysql?" AND INSTR(CONCAT_WS(' ',full_name,email),?)>0":" AND INSTR(full_name || ' ' || email,?)>0";values.push(search);}
  const query=`SELECT id,full_name,email,role,branch_id,status,created_at,version,must_change_password FROM staff${where} ORDER BY created_at ${sort==='oldest'?'ASC':'DESC'},id ${sort==='oldest'?'ASC':'DESC'} LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`;
  const rows=mysql?(await getSqlPool().query<RowDataPacket[]>(query,values))[0]:getSqliteDb().prepare(query).all(...values);
  const countSql='SELECT COUNT(*) AS total FROM staff'+where;
  const count=mysql?(await getSqlPool().query<RowDataPacket[]>(countSql,values))[0][0]:getSqliteDb().prepare(countSql).get(...values)!;
  return {users:rows.map(row=>({...row,created_at:parseDateSafe(String(row.created_at)).toISOString(),onboarding_required:Boolean(row.must_change_password),must_change_password:undefined})),page,pageSize,total:Number(count.total)};
}

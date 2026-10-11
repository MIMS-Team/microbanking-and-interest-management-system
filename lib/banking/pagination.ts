import type { Queryable } from '../db';
import type { ListOptions, Resource } from './list-options';

export function registerPagination(database:Queryable,options:ListOptions|undefined,ownerNames:string){
  const pagination:Record<string,unknown>={};
  const aliases={customers:'c',accounts:'a',fixedDeposits:'f',transactions:'l',approvals:'p',staff:'s',branches:'b'};
  const searches={customers:"CONCAT_WS(' ',c.full_name,c.customer_number,c.nic,c.mobile)",accounts:`CONCAT_WS(' ',a.account_number,${ownerNames})`,fixedDeposits:`CONCAT_WS(' ',f.fd_number,${ownerNames})`,transactions:"CONCAT_WS(' ',o.reference,a.account_number,o.description)",approvals:"CONCAT_WS(' ',p.summary,p.type,p.customer_name)",staff:"CONCAT_WS(' ',s.full_name,s.email)",branches:"CONCAT_WS(' ',b.name,b.code)"};
  async function paged(resource:Resource,sql:string,params:unknown[]=[]){
    const selected=options?.resource===resource;
    const page=selected?options!.page:1,pageSize=selected?options!.pageSize:100;
    const search=selected?options!.search:'',status=selected?options!.status:'',sort=selected?options!.sort:'newest';
    let filtered=sql.slice(0,sql.lastIndexOf('ORDER BY'));const values=[...params];
    if(search){values.push(search);filtered+=` AND INSTR(${searches[resource]}, $${values.length})>0`;}
    if(status){values.push(status);filtered+=` AND ${aliases[resource]}.${resource==='transactions'?'type':'status'}=$${values.length}`;}
    const field=resource==='transactions'?'l.created_at':aliases[resource]+'.id';
    const ordered=filtered+' ORDER BY '+field+(sort==='oldest'?' ASC':' DESC')+(resource==='transactions'?',l.id'+(sort==='oldest'?' ASC':' DESC'):'');
    const counted=resource==='fixedDeposits'?ordered.replace('SELECT f.*','SELECT COUNT(*) OVER() AS _list_total, f.*'):ordered.replace(/^SELECT /,'SELECT COUNT(*) OVER() AS _list_total, ');
    const result=await database.query<Record<string,unknown>>(counted+` LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,values);
    let total=Number(result.rows[0]?._list_total||0);
    if(!result.rows.length&&page>1){const first=await database.query<Record<string,unknown>>(counted+' LIMIT 1',values);total=Number(first.rows[0]?._list_total||0);}
    for(const row of result.rows)delete row._list_total;
    pagination[resource]={page,pageSize,total,search,status,sort};return result;
  }
  return {paged,pagination};
}

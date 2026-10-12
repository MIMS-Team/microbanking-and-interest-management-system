import type { Queryable } from '../db';
import type { ListOptions, Resource } from './list-options';

export function registerPagination(database:Queryable,options:ListOptions|undefined,ownerNames:string){
  const pagination:Record<string,unknown>={};
  const aliases={customers:'c',accounts:'a',fixedDeposits:'f',transactions:'l',approvals:'p',staff:'s',branches:'b'};
  const searches={customers:"CONCAT_WS(' ',c.full_name,c.customer_number,c.nic,c.mobile)",accounts:`CONCAT_WS(' ',a.account_number,${ownerNames})`,fixedDeposits:`CONCAT_WS(' ',f.fd_number,${ownerNames})`,transactions:"CONCAT_WS(' ',o.reference,a.account_number,o.description)",approvals:"CONCAT_WS(' ',p.summary,p.type,p.customer_name)",staff:"CONCAT_WS(' ',s.full_name,s.email)",branches:"CONCAT_WS(' ',b.name,b.code)"};
  async function paged(resource:Resource,selection:string,source:string,params:unknown[]=[],prefix=''){
    const selected=options?.resource===resource;
    const page=selected?options!.page:1,pageSize=selected?options!.pageSize:100;
    const search=selected?options!.search:'',status=selected?options!.status:'',sort=selected?options!.sort:'newest';
    let filtered=source;const values=[...params];
    if(search){values.push(search);filtered+=` AND INSTR(${searches[resource]}, $${values.length})>0`;}
    if(status){values.push(status);filtered+=` AND ${aliases[resource]}.${resource==='transactions'?'type':'status'}=$${values.length}`;}
    const field=resource==='transactions'?'l.created_at':aliases[resource]+'.id';
    const ordered=filtered+' ORDER BY '+field+(sort==='oldest'?' ASC':' DESC')+(resource==='transactions'?',l.id'+(sort==='oldest'?' ASC':' DESC'):'');
    // Window counts and filesort can evaluate projected owner/balance subqueries
    // for every matching row before LIMIT. Select page IDs without those fields,
    // then hydrate only that bounded set with the same authorization/filters.
    const [count,ids]=await Promise.all([
      database.query<{total:number|string}>('SELECT COUNT(*) AS total '+filtered,values),
      database.query<{id:number}>(`SELECT ${aliases[resource]}.id `+ordered+` LIMIT ${pageSize} OFFSET ${(page-1)*pageSize}`,values),
    ]);
    const total=Number(count.rows[0]?.total||0);
    const pageValues=[...values,ids.rows.map(row=>row.id)];
    const pageSource=filtered+` AND ${aliases[resource]}.id IN ($${pageValues.length})`;
    const pageOrder=' ORDER BY '+field+(sort==='oldest'?' ASC':' DESC')+(resource==='transactions'?',l.id'+(sort==='oldest'?' ASC':' DESC'):'');
    const result=ids.rows.length?await database.query<Record<string,unknown>>(prefix+selection+' '+pageSource+pageOrder,pageValues):{rows:[]};
    pagination[resource]={page,pageSize,total,search,status,sort};return result;
  }
  return {paged,pagination};
}

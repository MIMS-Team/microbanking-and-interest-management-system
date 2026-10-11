import { BusinessError } from '../validation';
export type Resource='customers'|'accounts'|'fixedDeposits'|'transactions'|'approvals'|'staff'|'branches';
export interface ListOptions{resource?:Resource;page:number;pageSize:number;search:string;status:string;sort:'newest'|'oldest'}
export const resources:Resource[]=['customers','accounts','fixedDeposits','transactions','approvals','staff','branches'];
export function listOptions(params:URLSearchParams):ListOptions{
  const resource=params.get('resource')||undefined,page=Number(params.get('page')||1),pageSize=Number(params.get('pageSize')||8),sort=params.get('sort')||'newest';
  if(resource&&!resources.includes(resource as Resource)||!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100||!['newest','oldest'].includes(sort))throw new BusinessError('Invalid list pagination or sorting parameters.');
  const search=params.get('search')||'',status=params.get('status')||'';if(search.length>120||status.length>40)throw new BusinessError('List filter is too long.');
  return {resource:resource as Resource|undefined,page,pageSize,sort:sort as ListOptions['sort'],search,status};
}

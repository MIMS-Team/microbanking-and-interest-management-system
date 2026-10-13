'use client';
import { Operations } from './operations';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { RavinduShell, type PublicEmployee } from '@/app/_components';
import type { Bootstrap, ModuleName, ActionPayload } from '@/lib/types';
import { Customers } from './customers';
import { Transactions } from './transactions';
import { Approvals } from './approvals';
import { Interest } from './interest';
import { Reports } from './reports';
import { Administration } from './administration';
import { Dashboard } from './dashboard';
import { EmployeeManagerView } from './employee-management';
import { HrApprovals } from './hr-approvals';
import { Accounts, FixedDeposits } from './accounts';
import { Notice } from './ui';
import { ListContext, type PageInfo } from './list-context';
import type { Resource } from '@/lib/banking/list-options';
import { Users, ShieldCheck, Activity, ArrowRight, LayoutGrid, WalletCards, Landmark, ArrowLeftRight, FileChartColumn, Building2, Percent, UserCheck } from 'lucide-react';

const tabs = [['operations','Operations'],['overview','Overview'],['customers','Customers'],['savings','Savings Accounts'],['fixed-deposits','Fixed Deposits'],['transactions','Transactions'],['decisions','Approvals'],['interest','Interest'],['reports','Reports'],['organization','Branches & Staff'],['employees','Employee Directory'],['approvals','HR Approvals']] as const;
const tabIcons: Record<string, typeof Users> = {overview:LayoutGrid,operations:Activity,customers:Users,savings:WalletCards,'fixed-deposits':Landmark,transactions:ArrowLeftRight,decisions:ShieldCheck,interest:Percent,reports:FileChartColumn,organization:Building2,employees:Users,approvals:UserCheck};
const financial = new Set(['customers','savings','fixed-deposits','transactions','decisions','interest','reports','organization']);
const destinations: Record<ModuleName,string> = {Dashboard:'overview',Customers:'customers','Savings Accounts':'savings','Fixed Deposits':'fixed-deposits',Transactions:'transactions',Approvals:'decisions',Interest:'interest',Reports:'reports','Branches & Staff':'organization'};
function canOpen(key:string,permissions:string[]){const grant:Record<string,string>={operations:'operations.read',customers:'financial.read',savings:'financial.read','fixed-deposits':'financial.read',transactions:'financial.read',decisions:'approval.review',interest:'interest.manage',reports:'reports.read',organization:'organization.manage',employees:'employees.manage',approvals:'employees.read'};return key==='overview'||permissions.includes(grant[key])||key==='interest'&&permissions.includes('rate.manage');}
function canNavigate(key:string,role:string) {
  if (key==='overview') return true;
  if (key==='operations') return ['admin','higher_manager'].includes(role);
  if (key==='approvals') return ['admin','higher_manager'].includes(role);
  if (key==='employees') return role==='admin';
  if (role==='admin') return ['organization','interest','decisions'].includes(key);
  return financial.has(key) && (key!=='reports'||['manager','higher_manager'].includes(role));
}
export function Workspace() {
  const router=useRouter(),params=useSearchParams();
  const [user,setUser]=useState<PublicEmployee|null>(null),[data,setData]=useState<Bootstrap|null>(null);
  const [bankingEnabled,setBankingEnabled]=useState(false);
  const [permissions,setPermissions]=useState<string[]>([]);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
  const requested=params.get('tab')||'overview',tab=requested==='admin'?'employees':requested;
  const userId=user?.id,userRole=user?.role;
  const mayReadFinance=permissions.includes('financial.read');
  const mayOpenTab=canOpen(tab,permissions);
  const available=tabs.filter(([key])=>user&&canNavigate(key,user.role)&&canOpen(key,permissions)&&(!financial.has(key)||bankingEnabled));
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth/session',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok){router.replace('/login');return;}const body=await response.json();setUser(body.user);setPermissions(body.permissions||[]);setBankingEnabled(body.capabilities?.banking===true);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return ()=>controller.abort();
  },[router]);
  useEffect(()=>{
    if(user&&(!tabs.some(([key])=>key===tab&&canNavigate(key,user.role)&&canOpen(key,permissions)&&(!financial.has(key)||bankingEnabled))||requested==='admin'))router.replace(`/dashboard?tab=${canNavigate(tab,user.role)&&canOpen(tab,permissions)&&(!financial.has(tab)||bankingEnabled)&&tabs.some(([key])=>key===tab)?tab:'overview'}`);
  },[user,tab,requested,router,permissions,bankingEnabled]);
  const reload=useCallback(async()=>{
    setLoading(true);
    try{const resources:Record<string,string>={customers:'customers',savings:'accounts','fixed-deposits':'fixedDeposits',transactions:'transactions',decisions:'approvals',organization:'staff'};const resource=resources[tab];const response=await fetch('/api/bootstrap'+(resource?'?resource='+resource+'&pageSize=8':''),{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.error||'Unable to load banking records.');setData(body);setUser(previous=>previous?{...previous,...body.user}:body.user);setPermissions(body.permissions||[]);setError('');}
    catch(reason){setError(reason instanceof Error?reason.message:'Unable to load records.');}finally{setLoading(false);}
  },[tab]);
  useEffect(()=>{const timer=setTimeout(()=>{if(userId&&bankingEnabled&&mayOpenTab&&((tab==='overview'&&mayReadFinance&&userRole!=='admin')||financial.has(tab))&&canNavigate(tab,userRole||''))void reload();},0);return()=>clearTimeout(timer);},[userId,userRole,tab,reload,bankingEnabled,mayReadFinance,mayOpenTab]);
  async function onAction(payload:ActionPayload){
    const response=await fetch('/api/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();
    if(!response.ok)throw new Error(body.error||'The request could not be completed.');setNotice(body.message);await reload();
  }
  const props=data?{data,onAction}:null;
  async function loadList(resource:Resource,options:PageInfo){
    const response=await fetch('/api/bootstrap?'+new URLSearchParams({resource,page:String(options.page),pageSize:String(options.pageSize),search:options.search,status:options.status,sort:options.sort}),{cache:'no-store'}),body=await response.json();
    if(!response.ok)throw new Error(body.error||'Unable to load records.');
    setData(previous=>previous?{...previous,[resource]:body[resource],pagination:{...previous.pagination,[resource]:body.pagination[resource]}}:body);
  }
  const navigation = <nav className="workspace-nav" aria-label="Workspace navigation">{available.map(([key,name])=>{
    const Icon=tabIcons[key];
    return <Link key={key} href={`/dashboard?tab=${key}`} aria-current={tab===key?'page':undefined}><Icon size={16} />{name}</Link>;
  })}</nav>;
  return <RavinduShell eyebrow="Banking workspace" title="Overview" showHeading={false} navigation={navigation}>
    <div className="workspace-context"><span><Building2 size={14} />{data?.user.branch_name || (user?.branch_id ? `Branch #${user.branch_id}` : 'Bank-wide workspace')}</span><span>Banking &amp; interest management</span></div>
    {error&&<Notice tone="error">{error}<button onClick={()=>void reload()}>Retry loading records</button></Notice>}{notice&&<Notice tone="success">{notice}</Notice>}
    {!user?<p role="status">Loading session…</p>:<>
      {tab==='operations'&&permissions.includes('operations.read')&&<Operations permissions={permissions}/>}
      {tab==='overview'&&(
        <div className="space-y-6">
          {user.role==='admin'?(
            <>
              <div className="section-heading"><div><h1>Administration</h1><p>Welcome back, {user.full_name.split(' ')[0]}. Manage your team and review bank operations.</p></div><span className="date-pill">Bank-wide access</span></div>
              <div className="admin-actions">
                {[
                  {tab:'employees',title:'Employee directory',text:'Manage people, roles and branch assignments.',action:'Open directory',icon:Users},
                  {tab:'approvals',title:'HR approvals',text:'Review pending employee requests and verification.',action:'Review requests',icon:ShieldCheck},
                  {tab:'operations',title:'Operations',text:'Check scheduled jobs and employee delivery status.',action:'View operations',icon:Activity},
                ].filter(item=>permissions.includes({employees:'employees.manage',approvals:'employees.read',operations:'operations.read'}[item.tab]!)).map(item=><Link className="admin-action" key={item.tab} href={`/dashboard?tab=${item.tab}`}><span className="action-icon"><item.icon size={21} /></span><h2>{item.title}</h2><p>{item.text}</p><span className="admin-action-link">{item.action}<ArrowRight size={16} /></span></Link>)}
              </div>
              <div className="admin-note"><ShieldCheck size={20} /><div><h2>Every request, with the right review.</h2><p>Employee changes follow the bank’s approval and verification process. Open HR approvals to review outstanding requests.</p></div></div>
            </>
          ):(
            <>
              {data ? (
                <Dashboard data={data} navigate={module=>router.push(`/dashboard?tab=${destinations[module]}`)}/>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
                  <h2 className="text-lg font-bold text-slate-900">Your workspace</h2>
                  <p className="mt-1 text-xs text-slate-500">{user.full_name} · {user.role.replaceAll('_',' ')} · {user.branch_id?`Branch #${user.branch_id}`:['admin','higher_manager'].includes(user.role)?'Bank-wide role':'Branch assignment required'}</p>
                  <p className="mt-3 text-xs text-slate-400">Select a module to load your authorized records.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {tab==='employees'&&user.role==='admin'&&<EmployeeManagerView currentUser={user}/>}
      {tab==='approvals'&&['admin','higher_manager'].includes(user.role)&&<HrApprovals/>}
      {loading&&<p className="workspace-loading" role="status"><span className="spinner" />Refreshing records…</p>}
      {props&&<ListContext.Provider value={{pages:props.data.pagination||{},load:loadList}}>{tab==='customers'&&<Customers {...props}/>} {tab==='savings'&&<Accounts {...props}/>} {tab==='fixed-deposits'&&<FixedDeposits {...props}/>} {tab==='transactions'&&<Transactions {...props}/>} {tab==='decisions'&&<Approvals {...props}/>} {tab==='interest'&&<Interest {...props}/>} {tab==='reports'&&<Reports/>} {tab==='organization'&&<Administration {...props}/>}</ListContext.Provider>}
    </>}
  </RavinduShell>;
}

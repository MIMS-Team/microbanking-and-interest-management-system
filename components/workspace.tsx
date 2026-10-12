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
import { Users, ShieldCheck, Activity, ArrowRight } from 'lucide-react';

const tabs = [['operations','Operational outcomes'],['overview','Operations Overview'],['customers','Customers'],['savings','Savings Accounts'],['fixed-deposits','Fixed Deposits'],['transactions','Transactions'],['decisions','Approvals'],['interest','Interest'],['reports','Reports'],['organization','Branches & Staff'],['employees','Employee Directory'],['approvals','HR Approvals']] as const;
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
  return <RavinduShell eyebrow="Authorized Workspace" title={`Welcome back, ${user?.full_name.split(' ')[0]||'User'}`}>
    <nav className="local-tabs" aria-label="Workspace navigation">{available.map(([key,name])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>router.push(`/dashboard?tab=${key}`)}>{name}</button>)}<Link href="/profile">My profile</Link></nav>
    {error&&<Notice tone="error">{error}<button onClick={()=>void reload()}>Retry loading records</button></Notice>}{notice&&<Notice tone="success">{notice}</Notice>}
    {!user?<p role="status">Loading session…</p>:<>
      {tab==='operations'&&permissions.includes('operations.read')&&<Operations permissions={permissions}/>}
      {tab==='overview'&&(
        <div className="space-y-6">
          {user.role==='admin'?(
            <div className="space-y-6">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 text-white shadow-xl border border-white/10">
                <div className="relative z-10 max-w-2xl">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-300 ring-1 ring-blue-400/30">
                    <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                    Administrative Governance Center
                  </span>
                  <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                    Platform Administration &amp; Dual-Control Hub
                  </h2>
                  <p className="mt-2 text-sm text-slate-300">
                    {user.full_name} · System Administrator · Bank-wide role. Manage personnel, verify HR multi-party challenges, and oversee operational outcomes.
                  </p>
                </div>
                <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  onClick={()=>router.push('/dashboard?tab=employees')}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg"
                >
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100 transition group-hover:bg-blue-600 group-hover:text-white">
                      <Users className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-900">Employee Directory</h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      Provision new personnel, manage assignments, and initiate deactivations.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                    Open Directory <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                  </div>
                </button>

                <button
                  onClick={()=>router.push('/dashboard?tab=approvals')}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-lg"
                >
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition group-hover:bg-indigo-600 group-hover:text-white">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-900">HR Dual-Control Approvals</h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      Authorize pending employee actions via multi-factor challenge verification.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                    Review Requests <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                  </div>
                </button>

                <button
                  onClick={()=>router.push('/dashboard?tab=operations')}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-lg"
                >
                  <div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition group-hover:bg-emerald-600 group-hover:text-white">
                      <Activity className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold text-slate-900">Operational Outcomes</h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                      Track operational jobs, batch processing, and system audit trail status.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    View Operations <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                  </div>
                </button>
              </div>
            </div>
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
      {loading&&<p role="status">Refreshing records…</p>}
      {props&&<ListContext.Provider value={{pages:props.data.pagination||{},load:loadList}}>{tab==='customers'&&<Customers {...props}/>} {tab==='savings'&&<Accounts {...props}/>} {tab==='fixed-deposits'&&<FixedDeposits {...props}/>} {tab==='transactions'&&<Transactions {...props}/>} {tab==='decisions'&&<Approvals {...props}/>} {tab==='interest'&&<Interest {...props}/>} {tab==='reports'&&<Reports/>} {tab==='organization'&&<Administration {...props}/>}</ListContext.Provider>}
    </>}
  </RavinduShell>;
}

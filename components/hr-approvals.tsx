'use client';
import { useCallback, useEffect, useState } from 'react';
import { Badge, DataTable, Field, FormModal, Notice, Panel, SectionHeading } from './ui';
import { date, formValues } from '@/lib/format';
type RequestRow={id:number;challengeId:string;approvalId?:number;approverId:number;requestedBy:number;approverName:string;purpose:string;targetId?:number;expiresAt:string;status:string;proposal:{full_name?:string;email?:string;role?:string;branch_id?:number}};
export function HrApprovals(){
  const [page,setPage]=useState(1),[total,setTotal]=useState(0);
  const [rows,setRows]=useState<RequestRow[]>([]),[userId,setUserId]=useState(0),[review,setReview]=useState<RequestRow|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const load=useCallback(async()=>{try{const response=await fetch('/api/users/approvals?page='+page,{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.error);setUserId(body.userId);setTotal(body.total);setRows(body.requests.map((r:RequestRow,i:number)=>({...r,id:r.approvalId||i+1})));setError('');}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load HR requests.');}},[page]);
  useEffect(()=>{const initial=setTimeout(()=>void load(),0);const timer=setInterval(()=>void load(),15000);return()=>{clearTimeout(initial);clearInterval(timer);};},[load]);
  return <><SectionHeading title="Independent HR review" description="The assigned reviewer signs in separately. Requesters can track decisions and cannot approve their own requests." action={<button onClick={()=>void load()}>Refresh HR requests</button>}/>{error&&<Notice tone="error">{error}</Notice>}{message&&<Notice tone="success">{message}</Notice>}
    <div className="pagination"><span>{total} requests ? Page {page}</span><button disabled={page<=1} onClick={()=>setPage(page-1)}>Previous HR requests</button><button disabled={page*20>=total} onClick={()=>setPage(page+1)}>Next HR requests</button></div><Panel title="Employee request history"><DataTable rows={rows} search={r=>`${r.challengeId} ${r.proposal.full_name} ${r.proposal.email} ${r.targetId}`} filters={[{key:'status',label:'statuses',value:r=>r.status}]} columns={[
      {key:'request',label:'Request',render:r=><div>{r.purpose.replaceAll('_',' ')}<small>{r.approvalId?`Approval #${r.approvalId}`:r.challengeId}</small></div>},
      {key:'proposal',label:'Proposal',render:r=><div>{r.proposal.full_name||`Employee #${r.targetId}`}<small>{r.proposal.email} {r.proposal.role} {r.proposal.branch_id&&`Branch #${r.proposal.branch_id}`}</small></div>},
      {key:'reviewer',label:'Assigned reviewer',render:r=>r.approverName},{key:'expiry',label:'Expires',render:r=>date(r.expiresAt)},
      {key:'status',label:'Status',render:r=><Badge value={r.status}/>},{key:'review',label:'Review',render:r=>r.approverId===userId&&r.requestedBy!==userId&&['pending','stale'].includes(r.status)?<button onClick={()=>setReview(r)}>Review employee request</button>:null},
    ]}/></Panel>
    {review&&<FormModal title="Review employee proposal" description={`${review.purpose.replaceAll('_',' ')} · ${review.challengeId}`} onClose={()=>setReview(null)} submitLabel="Record HR decision" onSubmit={async form=>{
      const values=formValues(form),reject=values.decision==='rejected';
      const path=reject?'/api/users/approvals':review.purpose==='employee_creation'?'/api/users/confirm-create':`/api/users/${review.targetId}/confirm-deactivate`;
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challengeId:review.challengeId,code:values.code,reason:values.reason})}),body=await response.json();
      if(!response.ok)throw new Error(body.error);setMessage(body.message||'Employee request completed.');await load();
    }}><Notice>{JSON.stringify(review.proposal)} {review.targetId&&`Target employee #${review.targetId}`}</Notice><Field label="Decision"><select name="decision" required><option value="approved" disabled={review.status==='stale'}>Approve with OTP</option><option value="rejected">Reject</option></select></Field><Field label="6-Digit Approver OTP" help="Required for approval. Use the code sent directly to your registered work email."><input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}/></Field><Field label="Reason" help="Required for rejection (5–300 characters)." wide><textarea name="reason" maxLength={300}/></Field></FormModal>}
  </>;
}

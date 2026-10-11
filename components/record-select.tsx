'use client';
import {useState} from 'react';
import type {Resource} from '@/lib/banking/list-options';
import {Field,Notice} from './ui';
export function RecordSelect<T extends {id:number}>({resource,name,label,initial,allowed,describe,multiple=false,selected=[]}:{resource:Resource;name:string;label:string;initial:T[];allowed:(row:T)=>boolean;describe:(row:T)=>string;multiple?:boolean;selected?:number[]}){
  const [rows,setRows]=useState(initial),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function find(){setBusy(true);setError('');try{const response=await fetch('/api/bootstrap?'+new URLSearchParams({resource,pageSize:'100',search:query,status:'active'}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.error);setRows(previous=>[...new Map([...previous.filter(r=>selected.includes(r.id)),...(body[resource] as T[])].map(r=>[r.id,r])).values()]);}catch(reason){setError(reason instanceof Error?reason.message:'Search failed.');}finally{setBusy(false);}}
  return <div className="field-wide">{error&&<Notice tone="error">{error}</Notice>}<div className="table-toolbar"><label>Find eligible {resource==='customers'?'customers':'accounts'}<input value={query} onChange={e=>setQuery(e.target.value)}/></label><button type="button" disabled={busy} onClick={()=>void find()}>{busy?'Searching…':'Find eligible records'}</button></div><Field label={label} wide><select name={name} multiple={multiple} required defaultValue={multiple?selected.map(String):selected[0]?String(selected[0]):''} size={multiple?5:undefined}>{!multiple&&<option value="">Select a record</option>}{rows.filter(allowed).map(row=><option key={row.id} value={row.id}>{describe(row)}</option>)}</select></Field></div>;
}

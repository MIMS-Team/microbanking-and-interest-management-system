'use client';
import { useState } from 'react';
import type { Resource } from '@/lib/banking/list-options';
import { ListContext, type PageInfo } from './list-context';
import { useContext } from 'react';
import { EmptyState, Notice, type Column } from './ui';
import { Search } from 'lucide-react';
import { label } from '@/lib/format';
export function PagedTable<T extends {id:number}>({rows,columns,resource}:{rows:T[];columns:Column<T>[];resource:Resource}){
  const remote=useContext(ListContext),info=remote!.pages[resource]!;
  const [query,setQuery]=useState(info.search),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function change(value:Partial<PageInfo>){setBusy(true);setError('');try{await remote!.load(resource,{...info,pageSize:8,...value});}catch(reason){setError(reason instanceof Error?reason.message:'Unable to load records.');}finally{setBusy(false);}}
  return <div className="data-table">
    {error&&<Notice tone="error">{error}</Notice>}
    <form className="table-toolbar" onSubmit={event=>{event.preventDefault();if(!busy)void change({search:query,page:1});}}>
      <div className="table-search-group"><label className="search-field"><Search size={17}/><input aria-label="Search records" placeholder="Search records…" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></label><button type="submit" className="button button-secondary" disabled={busy}>Search</button></div>
      <div className="table-filters">
        {resource!=='transactions'&&<select aria-label="Filter by statuses" disabled={busy} value={info.status} onChange={event=>void change({status:event.target.value,page:1})}><option value="">All statuses</option>{['pending','active','inactive','closed','approved','rejected','expired','matured'].map(value=><option key={value} value={value}>{label(value)}</option>)}</select>}
        <select aria-label="Sort records" disabled={busy} value={info.sort} onChange={event=>void change({sort:event.target.value as PageInfo['sort'],page:1})}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
      </div>
    </form>
    {busy&&<p className="table-loading" role="status">Loading records…</p>}
    {rows.length?<div className="table-scroll"><table><thead><tr>{columns.map(column=><th key={column.key} className={column.className}>{column.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}>{columns.map(column=><td key={column.key} className={column.className}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>:<EmptyState title="No matching records" description="Try another search or choose a different status."/>}
    <div className="pagination"><span>{info.total} records · Page {info.page} of {Math.max(1,Math.ceil(info.total/info.pageSize))}</span><div><button aria-label="Previous page" disabled={busy||info.page<=1} onClick={()=>void change({page:info.page-1})}>Previous</button><button aria-label="Next page" disabled={busy||info.page*info.pageSize>=info.total} onClick={()=>void change({page:info.page+1})}>Next</button></div></div>
  </div>;
}

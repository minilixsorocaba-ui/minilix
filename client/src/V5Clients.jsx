import {useEffect,useMemo,useState} from 'react';

const api=async(url)=>{const r=await fetch(url,{credentials:'include'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erro ao carregar dados.');return d};
const money=n=>`R$ ${Number(n||0).toFixed(2).replace('.',',')}`;
const dateBR=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'—';

export default function V5Clients(){
 const[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[customers,setCustomers]=useState([]),[q,setQ]=useState(''),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[err,setErr]=useState('');
 const load=async()=>{setLoading(true);setErr('');try{setCustomers(await api('/api/customers'))}catch(e){setErr(e.message)}finally{setLoading(false)}};
 useEffect(()=>{if(open)load()},[open]);
 const filtered=useMemo(()=>customers.filter(c=>`${c.name} ${c.document||''} ${c.phone||''}`.toLowerCase().includes(q.toLowerCase())).slice(0,30),[customers,q]);
 const select=async c=>{setSelected(c);setDetail(null);try{const rentals=await api('/api/rentals');const mine=rentals.filter(r=>r.customer_id===c.id);const full=[];for(const r of mine.slice(0,20)){full.push(await api(`/api/rentals/${r.id}`))}setDetail(full)}catch(e){setErr(e.message)}};
 return <>
  <button onClick={()=>setOpen(v=>!v)} style={{position:'fixed',right:170,bottom:22,zIndex:9999,border:0,borderRadius:999,padding:'13px 18px',fontWeight:800,cursor:'pointer',boxShadow:'0 8px 24px rgba(0,0,0,.18)'}}>V5 · Clientes</button>
  {open&&<div style={{position:'fixed',right:22,bottom:78,zIndex:9998,width:'min(620px,calc(100vw - 32px))',maxHeight:'calc(100vh - 110px)',overflow:'auto',background:'#fff',borderRadius:18,boxShadow:'0 18px 55px rgba(0,0,0,.22)',padding:20,border:'1px solid #e5e7eb'}}>
   <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:1}}>MINILIX · V5.2</div><h2 style={{margin:'4px 0'}}>Clientes e histórico</h2></div><button onClick={load} disabled={loading} style={{padding:'8px 11px'}}>{loading?'…':'Atualizar'}</button></div>
   {err&&<div style={{marginTop:12,padding:10,borderRadius:10,background:'#fff1f2'}}>{err}</div>}
   <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por nome, documento ou telefone" style={{width:'100%',boxSizing:'border-box',marginTop:14,padding:11,border:'1px solid #d1d5db',borderRadius:10}} />
   <div style={{display:'grid',gridTemplateColumns:'minmax(190px,.8fr) 1.2fr',gap:14,marginTop:14}}>
    <div>{filtered.map(c=><button key={c.id} onClick={()=>select(c)} style={{display:'block',width:'100%',textAlign:'left',padding:11,marginBottom:7,border:'1px solid #e5e7eb',borderRadius:10,background:selected?.id===c.id?'#f1f5f9':'#fff',cursor:'pointer'}}><b>{c.name}</b><div style={{fontSize:12,color:'#64748b'}}>{c.phone||c.email||'Sem contato'}</div></button>)}{filtered.length===0&&<p style={{color:'#64748b'}}>Nenhum cliente encontrado.</p>}</div>
    <div>{!selected?<div style={{padding:16,borderRadius:12,background:'#f8fafc',color:'#64748b'}}>Selecione um cliente para visualizar locações, tambores, OS e histórico.</div>:<>
      <div style={{padding:14,borderRadius:12,background:'#f8fafc'}}><h3 style={{margin:'0 0 5px'}}>{selected.name}</h3><div style={{fontSize:13}}>{selected.document||'Sem documento'} · {selected.phone||'Sem telefone'}</div></div>
      {!detail?<p>Carregando histórico…</p>:detail.length===0?<p style={{color:'#64748b'}}>Nenhuma locação encontrada para este cliente.</p>:detail.map(x=><div key={x.rental.id} style={{marginTop:10,padding:12,border:'1px solid #e5e7eb',borderRadius:12}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b>Locação · {dateBR(x.rental.scheduled_date)}</b><span>{x.rental.status}</span></div><div style={{fontSize:13,marginTop:5}}>{x.rental.street}, {x.rental.number} · {x.rental.city}</div><div style={{fontSize:13,marginTop:5}}><b>Tambores:</b> {x.items.map(i=>`${i.patrimony_code||'sem patrimônio'} (${i.container_name})`).join(', ')||'—'}</div><div style={{fontSize:13,marginTop:5}}><b>OS:</b> {x.orders.map(o=>`${o.number} · ${o.order_type} · ${o.status}`).join(' | ')||'—'}</div><div style={{fontSize:13,marginTop:5}}><b>Eventos:</b> {x.events.length} · vencimento {dateBR(x.rental.due_date)}</div></div>)}
    </>}</div>
   </div>
   <div style={{marginTop:14,padding:11,borderRadius:10,background:'#f8fafc',fontSize:12,color:'#475569'}}>V5.2 concentra o histórico operacional do cliente sem alterar os lançamentos existentes.</div>
  </div>}
 </>;
}

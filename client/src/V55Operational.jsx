import {useEffect,useState} from 'react';

const api=async(url,options={})=>{const r=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erro na operação.');return d};
const labels={PENDENTE:'Pendente',ATRIBUIDA:'Atribuída',A_CAMINHO:'A caminho',NO_LOCAL:'No local',CONCLUIDA:'Concluída',CANCELADA:'Cancelada'};

export default function V55Operational(){
 const[open,setOpen]=useState(false),[orders,setOrders]=useState([]),[alerts,setAlerts]=useState([]),[loading,setLoading]=useState(false),[err,setErr]=useState('');
 const load=async()=>{setLoading(true);setErr('');try{const[o,a]=await Promise.all([api('/api/orders'),api('/api/alerts/overdue')]);setOrders(Array.isArray(o)?o:[]);setAlerts(Array.isArray(a)?a:(a?.items||[]))}catch(e){setErr(e.message)}finally{setLoading(false)}};
 useEffect(()=>{if(open)load()},[open]);
 const change=async(id,status)=>{try{await api(`/api/orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});load()}catch(e){setErr(e.message)}};
 const retirada=async(id)=>{try{await api(`/api/orders/${id}/retirada`,{method:'POST'});load()}catch(e){setErr(e.message)}};
 const counts={PENDENTE:orders.filter(o=>o.status==='PENDENTE').length,ATRIBUIDA:orders.filter(o=>o.status==='ATRIBUIDA').length,A_CAMINHO:orders.filter(o=>o.status==='A_CAMINHO').length,NO_LOCAL:orders.filter(o=>o.status==='NO_LOCAL').length};
 const next=o=>o.status==='ATRIBUIDA'?['A_CAMINHO','🚚 A caminho']:o.status==='A_CAMINHO'?['NO_LOCAL','📍 No local']:o.status==='NO_LOCAL'?['CONCLUIDA','✓ Concluir']:null;
 return <>
  <button className="v55-fab" onClick={()=>setOpen(true)}>🚚 Operação</button>
  {open&&<div className="v55-overlay" onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
   <section className="v55-panel">
    <div className="v55-head"><div><div className="eyebrow">V5.5 · OPERAÇÃO</div><h2>Painel operacional</h2><p>Andamento das OS, alertas de vencimento e próximas ações.</p></div><button className="secondary" onClick={()=>setOpen(false)}>Fechar</button></div>
    {err&&<div className="alert">{err}</div>}
    <div className="v55-cards"><div><span>Pendentes</span><strong>{counts.PENDENTE}</strong></div><div><span>Atribuídas</span><strong>{counts.ATRIBUIDA}</strong></div><div><span>A caminho</span><strong>{counts.A_CAMINHO}</strong></div><div><span>No local</span><strong>{counts.NO_LOCAL}</strong></div><div><span>Vencidas</span><strong>{alerts.length}</strong></div></div>
    <div className="v55-section"><div className="panelhead"><h3>Próximas ações</h3><button className="secondary" onClick={load} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></div>
      {orders.filter(o=>!['CONCLUIDA','CANCELADA'].includes(o.status)).slice(0,10).map(o=>{const n=next(o);return <div className="v55-row" key={o.id}><div><b>{o.number} · {o.order_type}</b><span>{o.customer_name} · {o.city}</span><small>{o.scheduled_date} · {labels[o.status]} · {o.driver_name||'Sem motorista'}</small></div><div className="actions">{o.route_url&&<a className="route" href={o.route_url} target="_blank" rel="noreferrer">🗺️ Rota</a>}{n&&<button onClick={()=>change(o.id,n[0])}>{n[1]}</button>}</div></div>})}
      {!loading&&orders.filter(o=>!['CONCLUIDA','CANCELADA'].includes(o.status)).length===0&&<div className="empty">Nenhuma OS aberta no momento.</div>}
    </div>
    <div className="v55-section"><h3>Retiradas</h3>{orders.filter(o=>o.order_type==='ENTREGA'&&o.status==='CONCLUIDA').slice(0,6).map(o=><div className="v55-row" key={`r-${o.id}`}><div><b>{o.number}</b><span>{o.customer_name} · entrega concluída</span></div><button className="secondary" onClick={()=>retirada(o.id)}>Gerar retirada</button></div>)}{orders.filter(o=>o.order_type==='ENTREGA'&&o.status==='CONCLUIDA').length===0&&<div className="empty">Nenhuma entrega concluída aguardando retirada.</div>}</div>
    <div className="v55-section"><h3>Locações vencidas</h3>{alerts.slice(0,8).map((a,i)=><div className="v55-row" key={a.id||i}><div><b>{a.customer_name||a.name||'Cliente'}</b><span>{a.due_date||a.dueDate||'Vencida'} {a.rental_number?`· ${a.rental_number}`:''}</span></div><span className="badge">VENCIDA</span></div>)}{alerts.length===0&&<div className="empty">Nenhuma locação vencida.</div>}</div>
   </section>
  </div>}
 </>;
}

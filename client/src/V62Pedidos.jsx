import React,{useEffect,useState} from 'react';

export default function V62Pedidos(){
  const [open,setOpen]=useState(false),[me,setMe]=useState(null),[orders,setOrders]=useState([]),[drivers,setDrivers]=useState([]),[loading,setLoading]=useState(false),[msg,setMsg]=useState('');
  const load=async()=>{
    setLoading(true);setMsg('');
    try{
      const [m,o,d]=await Promise.all([
        fetch('/api/auth/me').then(r=>r.json()),
        fetch('/api/orders').then(r=>r.json()),
        fetch('/api/drivers').then(r=>r.ok?r.json():[])
      ]);
      setMe(m.user);setOrders(Array.isArray(o)?o:[]);setDrivers(Array.isArray(d)?d:[]);
    }catch(e){setMsg('Não foi possível carregar os pedidos.')}finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  if(!me||!['ADMIN','ATENDIMENTO'].includes(me.role))return null;
  const assign=async(id,driverId)=>{
    const r=await fetch('/api/orders/'+id+'/driver',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({driverId:driverId||null})});
    const j=await r.json(); if(!r.ok){setMsg(j.error||'Não foi possível atribuir a OS.');return} load();
  };
  const status=async(id,next)=>{
    const r=await fetch('/api/orders/'+id+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});
    const j=await r.json(); if(!r.ok){setMsg(j.error||'Não foi possível alterar a OS.');return} load();
  };
  const nextFor=o=>o.status==='PENDENTE'?'ATRIBUIDA':o.status==='ATRIBUIDA'?'A_CAMINHO':o.status==='A_CAMINHO'?'NO_LOCAL':o.status==='NO_LOCAL'?'CONCLUIDA':null;
  return <div className="v62-wrap">
    <button className="v5-fab" onClick={()=>setOpen(!open)}>📋 Pedidos V6.2</button>
    {open&&<section className="v5-panel" style={{right:16,bottom:82,width:'min(980px,calc(100vw - 32px))'}}>
      <div className="v5-panel-head"><div><strong>Pedidos e OS</strong><small>Cliente → locação → tambor → agenda → entrega → retirada</small></div><button onClick={()=>setOpen(false)}>×</button></div>
      <div className="v5-grid">
        <div className="v5-card"><b>{orders.length}</b><span>OS cadastradas</span></div>
        <div className="v5-card"><b>{orders.filter(o=>!['CONCLUIDA','CANCELADA'].includes(o.status)).length}</b><span>Em operação</span></div>
        <div className="v5-card"><b>{orders.filter(o=>o.status==='PENDENTE').length}</b><span>Pendentes</span></div>
        <div className="v5-card"><b>{orders.filter(o=>o.order_type==='RETIRADA').length}</b><span>Retiradas</span></div>
      </div>
      {msg&&<div className="v5-alert">{msg}</div>}
      {loading?<p>Atualizando...</p>:<div style={{display:'grid',gap:12}}>
        {orders.map(o=><article key={o.id} style={{border:'1px solid #dbe7df',borderRadius:14,padding:14,background:'#fff'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div><strong>{o.number}</strong> · {o.order_type}<div style={{marginTop:5}}>{o.customer_name}</div><small>{o.street}, {o.number?o.number:''} · {o.city} · {o.scheduled_date}</small></div>
            <span className="v5-badge">{o.status}</span>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:12}}>
            <select value={o.driver_id||''} onChange={e=>assign(o.id,e.target.value)} disabled={o.status==='CONCLUIDA'||o.status==='CANCELADA'}>
              <option value="">Não atribuído</option>{drivers.filter(d=>d.active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {nextFor(o)&&<button className="v5-btn" onClick={()=>status(o.id,nextFor(o))}>Avançar: {nextFor(o)}</button>}
            {o.route_url&&<a className="v5-btn" href={o.route_url} target="_blank" rel="noreferrer">🗺️ Rota</a>}
            {o.has_photo&&<a className="v5-btn" href={'/api/orders/'+o.id+'/photo'} target="_blank" rel="noreferrer">📸 Foto</a>}
          </div>
        </article>)}
      </div>}
    </section>}
  </div>
}

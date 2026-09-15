import {useEffect,useState} from 'react';

const api=async(url)=>{const r=await fetch(url,{credentials:'include'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erro ao carregar dados.');return d};
const money=n=>`R$ ${Number(n||0).toFixed(2).replace('.',',')}`;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());

export default function V5Dashboard(){
  const[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[data,setData]=useState(null),[err,setErr]=useState('');
  const load=async()=>{setLoading(true);setErr('');try{const me=await api('/api/auth/me');const [s,o,a]=await Promise.all([api('/api/dashboard'),api('/api/orders'),api('/api/assets')]);let f=[];if(me?.user?.role==='ADMIN')f=await api('/api/finance');setData({s,o,a,f,isAdmin:me?.user?.role==='ADMIN'})}catch(e){setErr(e.message)}finally{setLoading(false)}};
  useEffect(()=>{if(open)load()},[open]);
  const orders=data?.o||[];
  const todayOrders=orders.filter(o=>o.scheduled_date===today());
  const overdue=data?.s?.overdueRentals||0;
  const pendingFinance=(data?.f||[]).filter(x=>String(x.status||'').toUpperCase()==='ABERTO');
  const available=(data?.a||[]).filter(x=>x.status==='DISPONIVEL').length;
  return <>
    <button onClick={()=>setOpen(v=>!v)} style={{position:'fixed',right:22,bottom:22,zIndex:9999,border:0,borderRadius:999,padding:'13px 18px',fontWeight:800,cursor:'pointer',boxShadow:'0 8px 24px rgba(0,0,0,.18)'}}>V5 · Central</button>
    {open&&<div style={{position:'fixed',right:22,bottom:78,zIndex:9998,width:'min(430px,calc(100vw - 32px))',maxHeight:'calc(100vh - 110px)',overflow:'auto',background:'#fff',borderRadius:18,boxShadow:'0 18px 55px rgba(0,0,0,.22)',padding:20,border:'1px solid #e5e7eb'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:1}}>MINILIX · V5</div><h2 style={{margin:'4px 0'}}>Central gerencial</h2></div><button onClick={load} disabled={loading} style={{padding:'8px 11px'}}>{loading?'…':'Atualizar'}</button></div>
      {err&&<div style={{marginTop:12,padding:10,borderRadius:10,background:'#fff1f2'}}>{err}</div>}
      {data&&<>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:16}}>
          <div style={{padding:13,borderRadius:12,background:'#f8fafc'}}><small>OS hoje</small><strong style={{display:'block',fontSize:24}}>{todayOrders.length}</strong></div>
          <div style={{padding:13,borderRadius:12,background:'#f8fafc'}}><small>OS abertas</small><strong style={{display:'block',fontSize:24}}>{data.s?.openOrders||0}</strong></div>
          <div style={{padding:13,borderRadius:12,background:'#f8fafc'}}><small>Vencidas</small><strong style={{display:'block',fontSize:24}}>{overdue}</strong></div>
          <div style={{padding:13,borderRadius:12,background:'#f8fafc'}}><small>Tambores disponíveis</small><strong style={{display:'block',fontSize:24}}>{available}</strong></div>
        </div>
        <div style={{marginTop:16}}><h3 style={{marginBottom:8}}>Agenda de hoje</h3>{todayOrders.length===0?<p style={{margin:0,color:'#64748b'}}>Nenhuma OS programada para hoje.</p>:todayOrders.slice(0,8).map(o=><div key={o.id} style={{padding:'9px 0',borderBottom:'1px solid #eee'}}><b>{o.number} · {o.order_type}</b><div style={{fontSize:13,color:'#64748b'}}>{o.customer_name} · {o.status}</div></div>)}</div>
        {data.isAdmin&&<div style={{marginTop:16}}><h3 style={{marginBottom:8}}>Financeiro em aberto</h3><p style={{margin:0}}><b>{pendingFinance.length}</b> lançamento(s) em aberto.</p>{pendingFinance.slice(0,5).map(x=><div key={x.id} style={{padding:'8px 0',fontSize:13}}>{x.description||x.type} · <b>{money(x.amount)}</b></div>)}</div>}
        <div style={{marginTop:16,padding:12,borderRadius:12,background:'#f8fafc',fontSize:13}}>Visão gerencial com agenda diária, alertas operacionais e, para administradores, leitura financeira.</div>
      </>}
    </div>}
  </>;
}

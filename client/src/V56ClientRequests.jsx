import {useEffect,useState} from 'react';
const api=async(url,options={})=>{const r=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Erro na operação.');return d};
const typeLabel={RETIRADA:'Retirada',DIAS_ADICIONAIS:'Dias adicionais',TAMBOR_ADICIONAL:'Tambor adicional',TROCA_TAMBOR:'Troca de tambor',SUPORTE:'Suporte'};
const statusLabel={ABERTA:'Aberta',EM_ATENDIMENTO:'Em atendimento',CONCLUIDA:'Concluída',CANCELADA:'Cancelada'};
export default function V56ClientRequests(){
 const[open,setOpen]=useState(false),[items,setItems]=useState([]),[loading,setLoading]=useState(false),[err,setErr]=useState(''),[allowed,setAllowed]=useState(false);
 useEffect(()=>{api('/api/auth/me').then(x=>setAllowed(['ADMIN','ATENDIMENTO'].includes(x?.user?.role))).catch(()=>setAllowed(false))},[]);
 const load=async()=>{setLoading(true);setErr('');try{const r=await api('/api/client-requests');setItems(Array.isArray(r)?r:[])}catch(e){setErr(e.message)}finally{setLoading(false)}};
 useEffect(()=>{if(open&&allowed)load()},[open,allowed]);
 const setStatus=async(id,status)=>{try{await api('/api/client-requests/'+id+'/status',{method:'PATCH',body:JSON.stringify({status})});load()}catch(e){setErr(e.message)}};
 if(!allowed)return null;
 return <><button style={{position:'fixed',right:22,bottom:128,zIndex:1200,borderRadius:999,padding:'12px 17px',fontWeight:900,boxShadow:'0 10px 28px rgba(0,77,36,.22)'}} onClick={()=>setOpen(true)}>📥 Solicitações</button>
 {open&&<div style={{position:'fixed',inset:0,zIndex:1199,background:'rgba(0,36,20,.28)',display:'flex',justifyContent:'flex-end'}} onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section style={{width:'min(760px,96vw)',height:'100%',overflow:'auto',background:'#f7fbf8',padding:26,boxShadow:'-18px 0 45px rgba(0,60,30,.2)'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'flex-start',borderBottom:'1px solid #dce9e1',paddingBottom:18,marginBottom:18}}><div><div className='eyebrow'>V5.6 · ATENDIMENTO</div><h2>Solicitações do App Cliente</h2><p>Pedidos feitos pelo cliente ficam centralizados para atendimento e registro.</p></div><button className='secondary' onClick={()=>setOpen(false)}>Fechar</button></div>
 {err&&<div className='alert'>{err}</div>}
 <div className='panel'><div className='panelhead'><h3>Fila de solicitações</h3><button className='secondary' onClick={load} disabled={loading}>{loading?'Atualizando…':'Atualizar'}</button></div>
 {items.map(x=><div key={x.id} style={{padding:'15px 0',borderTop:'1px solid #edf2ef'}}><b>{typeLabel[x.type]||x.type} · {x.customer_name}</b><div className='muted'>{x.customer_email||''}{x.rental_id?' · locação '+String(x.rental_id).slice(0,8):''} · {new Date(x.created_at).toLocaleString('pt-BR')}</div>{x.details&&<div style={{marginTop:8}}>{x.details}</div>}<div style={{marginTop:8}}><span className='badge'>{statusLabel[x.status]||x.status}</span></div><div className='actions' style={{marginTop:10}}>{x.status==='ABERTA'&&<button onClick={()=>setStatus(x.id,'EM_ATENDIMENTO')}>Assumir atendimento</button>}{x.status==='EM_ATENDIMENTO'&&<button onClick={()=>setStatus(x.id,'CONCLUIDA')}>Concluir</button>}{['ABERTA','EM_ATENDIMENTO'].includes(x.status)&&<button className='secondary' onClick={()=>setStatus(x.id,'CANCELADA')}>Cancelar</button>}</div></div>)}
 {!loading&&items.length===0&&<div className='empty'>Nenhuma solicitação pendente.</div>}</div></section></div>}</>;
}
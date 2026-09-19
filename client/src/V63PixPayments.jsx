import {useEffect,useState} from 'react';

const api=async(url,options={})=>{const r=await fetch(url,{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível concluir a operação.');return d};
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const date=d=>d?new Date(d+'T00:00:00').toLocaleDateString('pt-BR'):'—';

export default function V63PixPayments({finance,onRefresh}){
 const[payments,setPayments]=useState([]),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const load=async()=>{try{setPayments(await api('/api/client/payments'))}catch(e){setErr(e.message)}};
 useEffect(()=>{load()},[]);
 const pendingFinance=(finance||[]).filter(f=>f.type==='RECEITA'&&f.status!=='PAGO');
 const create=async(id)=>{setBusy(true);setErr('');try{const p=await api('/api/client/payments/create',{method:'POST',body:JSON.stringify({financialEntryId:id})});setSelected(p);await load();onRefresh?.()}catch(e){setErr(e.message)}finally{setBusy(false)}};
 const refresh=async p=>{setBusy(true);setErr('');try{const x=await api('/api/client/payments/'+p.id);setSelected(x);await load();onRefresh?.()}catch(e){setErr(e.message)}finally{setBusy(false)}};
 const copy=async()=>{if(selected?.qr_code){await navigator.clipboard?.writeText(selected.qr_code)}};
 return <section className="client-panel">
  <div className="client-payment-head"><div><h2>Pagamentos via Pix</h2><p className="client-muted">Pague sua cobrança MiniLix por QR Code ou Pix Copia e Cola.</p></div><button className="client-secondary" onClick={load}>Atualizar</button></div>
  {err&&<div className="client-alert">{err}</div>}
  {selected&&<div className="client-pix-box">
   <div><b>Pagamento Pix</b><span>{money(selected.amount)} · {selected.status}</span></div>
   {selected.qr_code_base64&&<img className="client-pix-qr" src={'data:image/png;base64,'+selected.qr_code_base64} alt="QR Code Pix"/>}
   {selected.qr_code&&<div><label>Pix Copia e Cola</label><div className="client-copy-row"><input readOnly value={selected.qr_code}/><button onClick={copy}>Copiar</button></div></div>}
   {selected.ticket_url&&<a className="client-link-button" href={selected.ticket_url} target="_blank" rel="noreferrer">Abrir pagamento</a>}
   {selected.status!=='PAGO'&&<button onClick={()=>refresh(selected)} disabled={busy}>{busy?'Consultando…':'Já paguei — atualizar status'}</button>}
   {selected.status==='PAGO'&&<div className="client-success">Pagamento confirmado.</div>}
  </div>}
  <div className="client-pay-list"><h3>Cobranças em aberto</h3>{pendingFinance.length===0?<div className="client-empty">Nenhuma cobrança em aberto.</div>:pendingFinance.map(f=><div className="client-item" key={f.id}><div><b>{f.description}</b><span>{f.due_date?'Vencimento: '+date(f.due_date):'Sem vencimento'}</span></div><div><strong>{money(f.amount)}</strong><button onClick={()=>create(f.id)} disabled={busy}>Pagar com Pix</button></div></div>)}</div>
  <div className="client-pay-list"><h3>Pagamentos Pix gerados</h3>{payments.length===0?<div className="client-empty">Nenhum pagamento Pix gerado.</div>:payments.map(p=><div className="client-item" key={p.id}><div><b>{p.description||'Pagamento MiniLix'}</b><span>{money(p.amount)} · {p.status}</span></div><button onClick={()=>setSelected(p)}>Ver Pix</button></div>)}</div>
 </section>
}

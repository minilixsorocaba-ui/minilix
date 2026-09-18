import {useEffect} from 'react';
import App from './AppV3.jsx';

const money=n=>`R$ ${Number(n||0).toFixed(2).replace('.',',')}`;
const due=(date,extra)=>{if(!date)return '';const d=new Date(`${date}T00:00:00`);d.setDate(d.getDate()+4+Number(extra||0));return d.toISOString().slice(0,10)};

export default function AppPricingRules(){
  useEffect(()=>{
    const originalFetch=window.fetch.bind(window);
    let initialRentalUntil=0;
    const patchDom=()=>{
      const labels=[...document.querySelectorAll('label')];
      labels.forEach(label=>{
        const first=label.firstChild;
        if(!first||first.nodeType!==3)return;
        const text=first.textContent.trim();
        if(text==='Dias solicitados') first.nodeValue='Dias adicionais solicitados';
        if(text==='Valor por tambor/dia') first.nodeValue='Valor contratado por tambor';
      });
      const getInput=t=>labels.find(l=>(l.firstChild?.textContent||'').trim()===t)?.querySelector('input');
      const qty=getInput('Quantidade');
      const extra=getInput('Dias adicionais solicitados');
      const total=getInput('Valor total');
      const delivery=getInput('Entrega');
      const dueInput=getInput('Vencimento');
      if(extra){extra.min='0';if(extra.value===''||extra.value==='1'){extra.value='0';}}
      if(qty&&extra&&total){
        const q=Math.max(1,Number(qty.value)||1),d=Math.max(0,Number(extra.value)||0),value=q*110+d*10;
        total.value=money(value);
        const small=total.parentElement?.querySelector('small');
        if(small)small.textContent=d?`Cálculo: ${q} × R$ 110,00 + ${d} dia(s) adicional(is) × R$ 10,00`:`Cálculo: ${q} × R$ 110,00 (5 dias incluídos)`;
      }
      if(delivery&&dueInput){
        const d=Math.max(0,Number(extra?.value)||0),v=due(delivery.value,d);
        if(v)dueInput.value=v;
        dueInput.readOnly=true;
      }
      labels.forEach(label=>{
        const t=(label.firstChild?.textContent||'').trim();
        if(t==='Dias adicionais solicitados'){
          const s=label.querySelector('small');
          if(s)s.textContent='5 dias de permanência já incluídos no valor contratado. Cada dia adicional: R$ 10,00.';
        }
        if(t==='Valor contratado por tambor'){
          const s=label.querySelector('small');
          if(s)s.textContent='R$ 110,00 por tambor, com 5 dias de permanência incluídos.';
        }
      });
      [...document.querySelectorAll('button')].forEach(button=>{
        if(button.textContent.trim()==='Gerar retirada'){
          const note=document.createElement('span');
          note.className='badge';
          note.textContent='Retirada automática';
          button.replaceWith(note);
        }
      });
    };
    const patchedFetch=async(input,init={})=>{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!url.includes('/api/rentals'))return originalFetch(input,init);
      if(typeof init.body==='string'){
        try{
          const data=JSON.parse(init.body);
          if(url.endsWith('/api/rentals')){
            const q=Math.max(1,Number(data.quantity)||1);
            const extra=Math.max(0,Number(data.days||5)-5);
            data.dailyRate=110;
            data.totalAmount=q*110+extra*10;
            data.dueDate=due(data.scheduledDate,extra);
            initialRentalUntil=Date.now()+10000;
            init={...init,body:JSON.stringify(data)};
          }else if(url.includes('/api/rentals/')&&url.endsWith('/add-container')){
            data.dailyRate=Date.now()<initialRentalUntil?100:70;
            init={...init,body:JSON.stringify(data)};
          }
        }catch{}
      }
      return originalFetch(input,init);
    };
    window.fetch=patchedFetch;
    patchDom();
    const timer=setInterval(patchDom,700);
    return()=>{window.fetch=originalFetch;clearInterval(timer)};
  },[]);
  return <App/>;
}

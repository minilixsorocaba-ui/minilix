import crypto from 'node:crypto';

const MP_BASE='https://api.mercadopago.com';

function paymentStatusFromProvider(status,statusDetail){
  const s=String(status||'').toLowerCase();
  if(['processed','approved','accredited'].includes(s)) return 'PAGO';
  if(['cancelled','canceled','rejected','failed'].includes(s)) return 'CANCELADO';
  if(['expired'].includes(s)) return 'EXPIRADO';
  return 'AGUARDANDO_PAGAMENTO';
}

function extractPayment(order){
  const p=order?.transactions?.payments?.[0]||{};
  const pm=p.payment_method||{};
  return {
    paymentId:p.id||p.reference_id||null,
    status:p.status||order?.status||null,
    statusDetail:p.status_detail||order?.status_detail||null,
    qrCode:pm.qr_code||null,
    qrCodeBase64:pm.qr_code_base64||null,
    ticketUrl:pm.ticket_url||null,
  };
}

async function mpRequest(path,options={}){
  const token=String(process.env.MERCADOPAGO_ACCESS_TOKEN||'').trim();
  if(!token) throw Object.assign(new Error('Mercado Pago ainda não está configurado no ambiente MiniLix.'),{status:503});
  const r=await fetch(MP_BASE+path,{
    ...options,
    headers:{accept:'application/json','content-type':'application/json',Authorization:'Bearer '+token,...(options.headers||{})}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.error||'Mercado Pago recusou a operação Pix.'),{status:r.status,provider:data});
  return data;
}

async function syncPayment({pool,transactionId,order}){
  const p=extractPayment(order);
  const status=paymentStatusFromProvider(p.status, p.statusDetail);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=await client.query('SELECT * FROM payment_transactions WHERE id=$1 FOR UPDATE',[transactionId]);
    if(!current.rows[0]) throw new Error('Transação Pix não encontrada.');
    const t=current.rows[0];
    const paidAt=status==='PAGO'?(t.paid_at||new Date()):t.paid_at;
    await client.query(
      `UPDATE payment_transactions SET provider_payment_id=$1,provider_status=$2,provider_status_detail=$3,qr_code=COALESCE($4,qr_code),qr_code_base64=COALESCE($5,qr_code_base64),ticket_url=COALESCE($6,ticket_url),status=$7,paid_at=$8,raw_response=$9,updated_at=NOW() WHERE id=$10`,
      [p.paymentId,p.status,p.statusDetail,p.qrCode,p.qrCodeBase64,p.ticketUrl,status,paidAt,JSON.stringify(order),transactionId]
    );
    if(status==='PAGO'){
      await client.query("UPDATE financial_entries SET status='PAGO',paid_at=COALESCE(paid_at,NOW()) WHERE id=$1",[t.financial_entry_id]);
      await client.query('INSERT INTO rental_events(rental_id,event_type,description) SELECT rental_id,$1,$2 FROM payment_transactions WHERE id=$3 AND rental_id IS NOT NULL',[
        'PAGAMENTO_PIX_CONFIRMADO',
        'Pagamento Pix confirmado automaticamente pelo Mercado Pago.',
        transactionId
      ]);
    } else if(status==='CANCELADO'){
      await client.query("UPDATE financial_entries SET status='ABERTO',paid_at=NULL WHERE id=$1 AND status<>'PAGO'",[t.financial_entry_id]);
    }
    await client.query('COMMIT');
    return {...t,...p,status,paidAt};
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}

export function registerPixRoutes({app,pool,clientAuth}){
  app.get('/api/client/payments',clientAuth,async(req,res)=>{
    const r=await pool.query(`
      SELECT p.id,p.rental_id,p.financial_entry_id,p.provider,p.provider_order_id,p.amount,p.status,
             p.provider_status,p.provider_status_detail,p.qr_code,p.qr_code_base64,p.ticket_url,
             p.expires_at,p.paid_at,p.created_at,f.description,f.due_date
      FROM payment_transactions p
      LEFT JOIN financial_entries f ON f.id=p.financial_entry_id
      WHERE p.customer_id=$1
      ORDER BY p.created_at DESC
    `,[req.client.sub]);
    res.json(r.rows);
  });

  app.get('/api/client/payments/:id',clientAuth,async(req,res)=>{
    const r=await pool.query('SELECT * FROM payment_transactions WHERE id=$1 AND customer_id=$2',[req.params.id,req.client.sub]);
    if(!r.rows[0]) return res.status(404).json({error:'Pagamento não encontrado.'});
    const t=r.rows[0];
    if(t.provider==='MERCADO_PAGO'&&t.provider_order_id&&t.status!=='PAGO'){
      try{
        const order=await mpRequest('/v1/orders/'+encodeURIComponent(t.provider_order_id),{method:'GET'});
        const synced=await syncPayment({pool,transactionId:t.id,order});
        return res.json(synced);
      }catch(e){console.error(e)}
    }
    res.json(t);
  });

  app.post('/api/client/payments/create',clientAuth,async(req,res)=>{
    const financialEntryId=String(req.body?.financialEntryId||'').trim();
    if(!financialEntryId) return res.status(400).json({error:'Informe o lançamento financeiro que será pago.'});
    const f=await pool.query(`
      SELECT f.*,r.id rental_id,c.name customer_name,c.email customer_email
      FROM financial_entries f
      LEFT JOIN rentals r ON r.id=f.rental_id
      JOIN customers c ON c.id=f.customer_id
      WHERE f.id=$1 AND f.customer_id=$2
    `,[financialEntryId,req.client.sub]);
    if(!f.rows[0]) return res.status(404).json({error:'Cobrança não encontrada.'});
    const finance=f.rows[0];
    if(finance.status==='PAGO') return res.status(409).json({error:'Esta cobrança já está paga.'});

    const existing=await pool.query(`
      SELECT * FROM payment_transactions
      WHERE financial_entry_id=$1 AND customer_id=$2 AND provider='MERCADO_PAGO'
        AND status IN ('PAGAMENTO_GERADO','AGUARDANDO_PAGAMENTO')
      ORDER BY created_at DESC LIMIT 1
    `,[financialEntryId,req.client.sub]);
    if(existing.rows[0]) return res.status(200).json(existing.rows[0]);

    const idempotencyKey=crypto.randomUUID();
    const externalReference='minilix-finance-'+financialEntryId;
    const order=await mpRequest('/v1/orders',{
      method:'POST',
      headers:{'X-Idempotency-Key':idempotencyKey},
      body:JSON.stringify({
        type:'online',
        total_amount:Number(finance.amount).toFixed(2),
        external_reference:externalReference,
        processing_mode:'automatic',
        transactions:{payments:[{amount:Number(finance.amount).toFixed(2),payment_method:{id:'pix',type:'bank_transfer'}}]},
        payer:{email:finance.customer_email||req.client.email}
      })
    });
    const p=extractPayment(order);
    const providerStatus=p.status;
    const status=paymentStatusFromProvider(providerStatus,p.statusDetail);
    const ins=await pool.query(`
      INSERT INTO payment_transactions
      (rental_id,customer_id,financial_entry_id,provider,provider_order_id,provider_payment_id,external_reference,amount,status,provider_status,provider_status_detail,qr_code,qr_code_base64,ticket_url,idempotency_key,raw_response)
      VALUES($1,$2,$3,'MERCADO_PAGO',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `,[finance.rental_id,req.client.sub,financialEntryId,order.id,p.paymentId,externalReference,Number(finance.amount),status,providerStatus,p.statusDetail,p.qrCode,p.qrCodeBase64,p.ticketUrl,idempotencyKey,JSON.stringify(order)]);
    res.status(201).json(ins.rows[0]);
  });

  app.post('/api/payments/webhook',async(req,res)=>{
    const body=req.body||{};
    const provider='MERCADO_PAGO';
    const eventKey=String(body?.id||body?.data?.id||crypto.randomUUID());
    try{
      const event=await pool.query(
        'INSERT INTO payment_webhook_events(provider,event_key,payload) VALUES($1,$2,$3) ON CONFLICT(provider,event_key) DO NOTHING RETURNING id',
        [provider,eventKey,JSON.stringify(body)]
      );
      if(!event.rows[0]) return res.status(200).json({ok:true,duplicate:true});
      const orderId=body?.data?.id||body?.id;
      if(orderId){
        const t=await pool.query('SELECT id FROM payment_transactions WHERE provider=$1 AND provider_order_id=$2 LIMIT 1',[provider,String(orderId)]);
        if(t.rows[0]){
          try{
            const order=await mpRequest('/v1/orders/'+encodeURIComponent(String(orderId)),{method:'GET'});
            await syncPayment({pool,transactionId:t.rows[0].id,order});
          }catch(e){console.error('Pix webhook sync:',e.message)}
        }
      }
      await pool.query('UPDATE payment_webhook_events SET processed_at=NOW() WHERE provider=$1 AND event_key=$2',[provider,eventKey]);
      res.status(200).json({ok:true});
    }catch(e){
      console.error(e);
      res.status(200).json({ok:true});
    }
  });
}

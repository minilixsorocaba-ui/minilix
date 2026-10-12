export function monthBounds(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))throw Object.assign(new Error('Informe o mês no formato AAAA-MM.'),{status:400});
 const[y,m]=month.split('-').map(Number);if(y<2020||y>2100)throw Object.assign(new Error('Ano fora do intervalo permitido.'),{status:400});
 return{start:`${month}-01T00:00:00-03:00`,end:`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-01T00:00:00-03:00`};
}
async function buildReport(pool,id,month){
 const{start,end}=monthBounds(month);
 const contract=(await pool.query('SELECT id,name,code,rate FROM partner_contracts WHERE id=$1',[id])).rows[0];if(!contract)throw Object.assign(new Error('Condomínio não encontrado.'),{status:404});
 const ledger=(await pool.query('SELECT l.id,l.created_at,l.amount,l.eligible_base,l.rate,l.reason,r.partner_unit,(SELECT number FROM service_orders WHERE rental_id=r.id ORDER BY created_at LIMIT 1) os_number FROM partner_ledger l JOIN rentals r ON r.id=l.rental_id WHERE l.contract_id=$1 AND l.created_at >= $2::timestamptz AND l.created_at < $3::timestamptz ORDER BY l.created_at,l.id',[id,start,end])).rows;
 // Período contábil usa registro do repasse; data da transferência é exibida separadamente.
 const payouts=(await pool.query('SELECT id,created_at,paid_at,amount,transfer_reference,proof FROM partner_payouts WHERE contract_id=$1 AND created_at >= $2::timestamptz AND created_at < $3::timestamptz ORDER BY created_at,id',[id,start,end])).rows;
 const opening=(await pool.query('SELECT COALESCE((SELECT SUM(amount) FROM partner_ledger WHERE contract_id=$1 AND created_at<$2::timestamptz),0)-COALESCE((SELECT SUM(amount) FROM partner_payouts WHERE contract_id=$1 AND created_at<$2::timestamptz),0) balance',[id,start])).rows[0];
 const cents=v=>Math.round(Number(v||0)*100),sum=rows=>rows.reduce((s,r)=>s+cents(r.amount),0);
 const earned=sum(ledger.filter(r=>Number(r.amount)>0)),adjustments=sum(ledger.filter(r=>Number(r.amount)<0)),paid=sum(payouts),initial=cents(opening.balance);
 return{contract,month,ledger,payouts,summary:{opening:initial/100,earned:earned/100,adjustments:adjustments/100,paid:paid/100,closing:(initial+earned+adjustments-paid)/100},generatedAt:new Date().toISOString()};
}

export async function monthlyReport(pool,id,month){const db=await pool.connect();try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const report=await buildReport(db,id,month);await db.query('COMMIT');return report}catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}}

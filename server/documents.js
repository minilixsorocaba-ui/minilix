export function registerDocumentRoutes({app,pool,auth,role}) {
 const select=`SELECT o.id,o.number AS order_number,o.order_type,o.status,o.scheduled_date,o.driver_id,o.customer_confirmation,o.confirmed_at,o.driver_notes,r.notes,r.partner_unit,c.name AS customer_name,c.phone,a.street,a.number AS address_number,a.complement,a.neighborhood,a.city,a.state,u.name AS driver_name,p.name AS condominium,p.friendly_code AS code,COALESCE((SELECT SUM(quantity) FROM rental_items WHERE rental_id=r.id),0) AS quantity FROM service_orders o JOIN rentals r ON r.id=o.rental_id JOIN customers c ON c.id=r.customer_id JOIN addresses a ON a.id=r.address_id LEFT JOIN users u ON u.id=o.driver_id LEFT JOIN partner_contracts p ON p.id=r.partner_contract_id`;
 app.get('/api/documents/orders/:id',auth,async(req,res,next)=>{try{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return res.status(400).json({error:'Identificador inválido.'});
  const row=(await pool.query(`${select} WHERE o.id=$1`,[req.params.id])).rows[0];
  if(!row)return res.status(404).json({error:'OS não encontrada.'});
  if(req.user.role==='MOTORISTA'&&row.driver_id!==req.user.sub)return res.status(403).json({error:'Esta OS não está atribuída a você.'});
  const items=(await pool.query('SELECT i.quantity,c.name,a.patrimony_code FROM rental_items i JOIN containers c ON c.id=i.container_id LEFT JOIN container_assets a ON a.id=i.asset_id WHERE i.rental_id=(SELECT rental_id FROM service_orders WHERE id=$1)',[row.id])).rows;
  res.set('Cache-Control','no-store').json({...row,items});
 }catch(e){next(e)}});
 app.get('/api/documents/control',auth,role('ADMIN','ATENDIMENTO'),async(req,res,next)=>{try{
  const month=String(req.query.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)return res.status(400).json({error:'Competência inválida.'});
  const rows=(await pool.query(`${select} WHERE o.scheduled_date >= $1::date AND o.scheduled_date < $1::date + INTERVAL '1 month' ORDER BY o.scheduled_date,o.number`,[month+'-01'])).rows;
  res.set('Cache-Control','no-store').json({month,rows,generatedAt:new Date().toISOString()});
 }catch(e){next(e)}});
}

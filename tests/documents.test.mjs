import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import express from 'express';import cookieParser from 'cookie-parser';import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import {registerDocumentRoutes} from '../server/documents.js';
process.env.JWT_SECRET='test-only-secret-not-used-in-production';
const db=new PGlite();await db.exec("CREATE FUNCTION gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(substr(md5(random()::text),1,n*2),'hex') $$");
await db.exec((await readFile('server/schema.sql','utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
await db.exec(await readFile('server/partners.sql','utf8'));
const pool={query:(s,p)=>db.query(s,p),connect:async()=>({query:(s,p)=>db.query(s,p),release(){}})};
const scalar=async(s,p=[])=>Object.values((await db.query(s,p)).rows[0])[0];
const admin=await scalar("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@test.test','hash','ADMIN') RETURNING id");

const customer=await scalar("INSERT INTO customers(name) VALUES('Teste local') RETURNING id");
const address=await scalar("INSERT INTO addresses(customer_id,street,number,city,state) VALUES($1,'Rua teste','87','Sorocaba','SP') RETURNING id",[customer]);
const rental=await scalar("INSERT INTO rentals(customer_id,address_id,scheduled_date) VALUES($1,$2,'2026-10-01') RETURNING id",[customer,address]);
const driver=await scalar("INSERT INTO users(name,email,password_hash,role) VALUES('Motorista','driver@test.test','hash','MOTORISTA') RETURNING id");
const order=await scalar("INSERT INTO service_orders(number,rental_id,driver_id,scheduled_date) VALUES('OS-TESTE',$1,$2,'2026-10-01') RETURNING id",[rental,driver]);
const app=express();const auth=(req,res,next)=>{const who=req.get('x-user');if(!who)return res.sendStatus(401);req.user={sub:who==='driver'?driver:admin,role:who==='admin'?'ADMIN':'MOTORISTA'};next()};
const role=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.sendStatus(403);
registerDocumentRoutes({app,pool,auth,role});app.use((e,req,res,next)=>res.status(500).json({error:e.message}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const root='http://127.0.0.1:'+server.address().port;
const get=(path,user)=>fetch(root+path,{headers:user?{'x-user':user}:{}});
try{
assert.equal((await get('/api/documents/control?month=2026-10')).status,401);
assert.equal((await get('/api/documents/control?month=2026-10','driver')).status,403);
assert.equal((await get('/api/documents/control?month=2026-13','admin')).status,400);
const control=await (await get('/api/documents/control?month=2026-10','admin')).json();assert.equal(control.rows.length,1);assert.equal(control.rows[0].order_number,'OS-TESTE');assert.equal(control.rows[0].address_number,'87');
assert.equal((await (await get('/api/documents/control?month=2026-09','admin')).json()).rows.length,0);
const doc=await (await get('/api/documents/orders/'+order,'driver')).json();assert.equal(doc.order_number,'OS-TESTE');assert.ok(Array.isArray(doc.items));
assert.equal((await get('/api/documents/orders/'+order,'other')).status,403);
assert.equal((await get('/api/documents/orders/bad','admin')).status,400);
console.log('PASS: documentos com SQL real, competências, identificação da OS e endereço, autenticação e isolamento do motorista.');
}finally{await new Promise(r=>server.close(r));await db.close()}

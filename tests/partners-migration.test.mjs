import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {linkPartner} from '../server/partners.js';
const db=new PGlite();const scalar=async(s,p=[])=>Object.values((await db.query(s,p)).rows[0])[0];
await db.exec("CREATE FUNCTION gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(substr(md5(random()::text),1,n*2),'hex') $$");
await db.exec((await readFile('server/schema.sql','utf8')).replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
const previous=await readFile('tests/fixtures/partners-v1.sql','utf8');
await db.exec(previous);
const admin=await scalar("INSERT INTO users(name,email,password_hash,role) VALUES('Teste','migration@example.test','hash','ADMIN') RETURNING id");
const contract=await scalar("INSERT INTO partner_contracts(code,name,document,address,representative,bank_details,starts_on,ends_on,created_by) VALUES('MLX-C-LEGADO','Condomínio','000','Rua','Teste','Conta',CURRENT_DATE,CURRENT_DATE+89,$1) RETURNING id",[admin]);
const migration=await readFile('server/partners.sql','utf8');await db.exec(migration);
const short=await scalar('SELECT short_code FROM partner_contracts WHERE id=$1',[contract]);assert.equal(short,'MLX-001');assert.equal(await scalar('SELECT friendly_code FROM partner_contracts WHERE id=$1',[contract]),'COND-001');assert.equal(await scalar('SELECT code FROM partner_contracts WHERE id=$1',[contract]),'MLX-C-LEGADO');
const customer=await scalar("INSERT INTO customers(name) VALUES('Teste') RETURNING id");const address=await scalar("INSERT INTO addresses(customer_id,street,number) VALUES($1,'Rua','1') RETURNING id",[customer]);
for(const code of ['MLX-C-LEGADO','MLX-001','001','COND-001','cond001']){const rental=await scalar('INSERT INTO rentals(customer_id,address_id,scheduled_date) VALUES($1,$2,CURRENT_DATE) RETURNING id',[customer,address]);await linkPartner(db,rental,{partnerCode:code,partnerUnit:'101'},110);assert.equal(await scalar('SELECT partner_contract_id FROM rentals WHERE id=$1',[rental]),contract)}
await db.exec(migration);assert.equal(await scalar('SELECT short_code FROM partner_contracts WHERE id=$1',[contract]),short);console.log('PASS: migração preserva código legado, código curto e entrada numérica; reaplicação não renumera.');await db.close();

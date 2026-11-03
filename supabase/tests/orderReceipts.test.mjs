import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '../../tmp/moderation-db/node_modules/@electric-sql/pglite/dist/index.js';
test('receipt snapshots are transactional, immutable, unique, private and retained after refunds',async()=>{
 const db=new PGlite();
 const buyer='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',order='33333333-3333-4333-8333-333333333333';
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
   create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
   create table auth.users(id uuid primary key);grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
   create table orders(id uuid primary key,user_id uuid,user_name text,user_phone text,user_address text,buyer_email text,items jsonb,subtotal numeric,shipping_fee numeric,total numeric,payment_status text,status text,payment_verified_at timestamptz,created_at timestamptz default now(),payment_reference text,order_type text,delivery_option text);
   insert into auth.users values('${buyer}'),('${other}');
   insert into orders(id,user_id,user_name,items,subtotal,shipping_fee,total,payment_status,status) values('${order}','${buyer}','Original buyer','[{"qty":1,"price":700,"product_name":"Original vase"}]',700,0,700,'pending','pending');`);
  await db.exec(await readFile(new URL('../migrations/20261103001000_order_receipts.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select * from order_receipts')).rows.length,0);
  await assert.rejects(db.query('select capture_order_receipt($1,$2)',[order,buyer]),/RECEIPT_NOT_AVAILABLE/);
  await db.exec(`update orders set payment_status='paid',payment_verified_at=now() where id='${order}';`);
  const first=(await db.query('select * from order_receipts')).rows[0];
  assert.equal(first.snapshot.buyerName,'Original buyer');
  const results=await Promise.all([db.query('select capture_order_receipt($1,$2)',[order,buyer]),db.query('select capture_order_receipt($1,$2)',[order,buyer])]);
  assert.equal(results.length,2);assert.equal((await db.query('select * from order_receipts')).rows.length,1);
  await db.exec(`update orders set user_name='New name',total=999,payment_status='refunded',status='refunded' where id='${order}';`);
  assert.deepEqual((await db.query('select * from order_receipts')).rows[0],first);
  await assert.rejects(db.query('select capture_order_receipt($1,$2)',[order,other]),/ORDER_NOT_FOUND/);
  await assert.rejects(db.exec(`update order_receipts set snapshot='{}';`),/cannot be changed/);
  await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query('select * from order_receipts')).rows.length,0);
  await assert.rejects(db.query('select capture_order_receipt($1,$2)',[order,buyer]),/permission denied/);
  await assert.rejects(db.exec(`update order_receipts set snapshot='{}'`),/permission denied/);
  await db.exec(`set request.jwt.claim.sub='${buyer}';`);assert.equal((await db.query('select * from order_receipts')).rows.length,1);
  await db.exec('reset role;');
  await db.exec(await readFile(new URL('../rollback/20261103001000_order_receipts.sql',import.meta.url),'utf8'));
 } finally {await db.close();}
});

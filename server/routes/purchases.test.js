import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { createPurchasesRouter } from './purchases.js';

async function requestOrders(authenticated) {
  const calls = [];
  const supabase = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { orders: [], total: 0, statusCounts: { all: 0 } }, error: null }; } };
  const verifyAuth = async (_req, res) => { if (!authenticated) { res.status(401).json({ error: 'Unauthorized' }); return null; } return '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768'; };
  const app = express(); app.use(express.json()); app.use('/api/orders', createPurchasesRouter({ supabase, verifyAuth, requireSuperAdmin: async () => false }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { const address = server.address(); const response = await fetch(`http://127.0.0.1:${address.port}/api/orders?status=to-pay&page=2`); return { status: response.status, body: await response.json(), calls }; }
  finally { server.close(); }
}

test('purchase listing requires a verified bearer identity', async () => {
  const response = await requestOrders(false);
  assert.equal(response.status, 401);
  assert.equal(response.calls.length, 0);
});

test('purchase listing derives buyer ID and keeps the fixed page size', async () => {
  const response = await requestOrders(true);
  assert.equal(response.status, 200);
  assert.equal(response.calls[0].name, 'get_buyer_orders_page');
  assert.equal(response.calls[0].args.p_user_id, '0d7a41a1-8fc6-4daf-85a1-f1d439e6e768');
  assert.equal(response.calls[0].args.p_page_size, 10);
});

test('receipt route rejects guests and other buyers and serves private PDFs to the owner',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const receipt={receipt_number:'LK-TEST',template_version:1,issued_at:'2026-11-03T00:00:00Z',snapshot:{orderId:id,items:[{product_name:'Vase',qty:1,price:700}],subtotal:700,shippingFee:0,total:700}};
  let identity=null;
  const supabase={from:table=>({select:()=>({eq:()=>({eq:(_field,owner)=>({maybeSingle:async()=>({data:owner==='owner'?(table==='orders'?{id,payment_status:'paid'}:receipt):null})})})})})};
  const app=express();app.use('/api/orders',createPurchasesRouter({supabase,verifyAuth:async(_req,res)=>{if(!identity){res.status(401).json({error:'Unauthorized'});return null;}return identity;},requireSuperAdmin:async()=>false}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const url=`http://127.0.0.1:${server.address().port}/api/orders/${id}/receipt`;
    assert.equal((await fetch(url)).status,401);
    identity='other';assert.equal((await fetch(url)).status,404);
    identity='owner';const response=await fetch(url);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.match(response.headers.get('content-disposition'),/attachment; filename="LikhArtisan-Receipt-LK-TEST.pdf"/);
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  }finally{server.close();}
});

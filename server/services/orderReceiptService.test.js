import test from 'node:test';
import assert from 'node:assert/strict';
import {getOrderReceipt,receiptEligible,renderOrderReceipt} from './orderReceiptService.js';
const orderId='11111111-1111-4111-8111-111111111111';
const receipt={receipt_number:'LK-TEST',template_version:1,issued_at:'2026-11-03T08:00:00Z',snapshot:{orderId,orderDate:'2026-11-03T07:00:00Z',buyerName:'José Peña',items:[{product_name:'Vase',qty:1,price:700}],subtotal:700,shippingFee:100,total:800}};
test('receipt requires paid evidence; pending and unverified refunds are excluded',()=>{
 assert.equal(receiptEligible({payment_status:'pending'}),false);
 assert.equal(receiptEligible({payment_status:'paid'}),true);
 assert.equal(receiptEligible({payment_status:'refunded'}),false);
 assert.equal(receiptEligible({payment_status:'refunded',payment_verified_at:'2026-11-03'}),true);
});
test('unknown or non-owned orders never reach receipt capture',async()=>{
 let captured=false;
 const db={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})}),rpc:()=>{captured=true;}};
 await assert.rejects(getOrderReceipt(db,orderId,'other'),{status:404});assert.equal(captured,false);
});
test('reuses immutable existing receipts even after refund',async()=>{
 const db={from:table=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:table==='orders'?{payment_status:'refunded'}:receipt})})})})}),rpc:()=>{throw Error('should not capture');}};
 assert.deepEqual(await getOrderReceipt(db,orderId,'buyer'),receipt);
});
test('PDF renders regular, custom rounding and multipage orders; rejects inconsistent totals',async()=>{
 const pdf=await renderOrderReceipt(receipt);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 const custom={...receipt,snapshot:{...receipt.snapshot,orderType:'customized',items:[{qty:3,price:33.33}],subtotal:100,shippingFee:0,total:100}};
 assert.ok((await renderOrderReceipt(custom)).length>1000);
 const items=Array.from({length:50},()=>({...receipt.snapshot.items[0],product_name:'Long handcrafted pottery description '.repeat(5)}));
 assert.ok((await renderOrderReceipt({...receipt,snapshot:{...receipt.snapshot,items,subtotal:35000,total:35100}})).length>pdf.length);
 await assert.rejects(renderOrderReceipt({...receipt,snapshot:{...receipt.snapshot,total:1}}),/RECEIPT_INVALID_DATA/);
});

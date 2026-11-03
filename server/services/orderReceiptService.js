import { PDFDocument } from 'pdfkit';
import { fileURLToPath } from 'node:url';
const asset = name => fileURLToPath(new URL(`../assets/receipts/${name}`,import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const httpError = (message,status) => Object.assign(new Error(message),{status});
export function receiptEligible(order) {
  return order.payment_status === 'paid' || Boolean(order.payment_verified_at) && (order.payment_status === 'refunded' || order.status === 'refunded');
}
export async function getOrderReceipt(supabase,orderId,userId) {
  if (!uuid.test(orderId)) throw httpError('ORDER_NOT_FOUND',404);
  const {data:order,error} = await supabase.from('orders').select('id,user_id,payment_status,status,payment_verified_at').eq('id',orderId).eq('user_id',userId).maybeSingle();
  if(error) throw error;
  if(!order) throw httpError('ORDER_NOT_FOUND',404);
  const existing = await supabase.from('order_receipts').select('*').eq('order_id',orderId).eq('owner_user_id',userId).maybeSingle();
  if(existing.error) throw existing.error;
  if(existing.data) return existing.data;
  if(!receiptEligible(order)) throw httpError('RECEIPT_NOT_AVAILABLE',409);
  const result = await supabase.rpc('capture_order_receipt',{p_order_id:orderId,p_owner_id:userId});
  if(result.error) {
    if(result.error.message?.includes('RECEIPT_NOT_AVAILABLE')) throw httpError('RECEIPT_NOT_AVAILABLE',409);
    if(result.error.message?.includes('ORDER_NOT_FOUND')) throw httpError('ORDER_NOT_FOUND',404);
    throw result.error;
  }
  if(!result.data) throw httpError('RECEIPT_NOT_AVAILABLE',409);
  return result.data;
}
const cents = value => Math.round(Number(value)*100);
const money = value => `₱${(Number(value)||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
export async function renderOrderReceipt(receipt) {
  const s = receipt.snapshot;
  if(receipt.template_version!==1 || !s || !Array.isArray(s.items) || !s.items.length || ![s.subtotal,s.shippingFee,s.total].every(v=>Number.isFinite(Number(v))&&Number(v)>=0)) throw httpError('RECEIPT_INVALID_DATA',409);
  const custom = s.orderType === 'customized';
  const rows = s.items.map(item=>{
    const quantity=Number(item.qty ?? item.quantity);
    const price=Number(item.price);
    if(!Number.isInteger(quantity)||quantity<1||!Number.isFinite(price)||price<0) throw httpError('RECEIPT_INVALID_DATA',409);
    return {name:item.product_name||item.productName||'Custom pottery design', variant:item.variation||item.dimensions||'',shop:item.shop_name||item.shopName||'LikhArtisan Shop',quantity,price,amount:cents(price)*quantity/100};
  });
  const rounded = rows.reduce((sum,row)=>sum+cents(row.amount),0)!==cents(s.subtotal);
  if(cents(s.subtotal)+cents(s.shippingFee)!==cents(s.total) || rounded && (!custom || rows.length!==1)) throw httpError('RECEIPT_INVALID_DATA',409);
  if(custom && rows.length===1) rows[0].amount=Number(s.subtotal);
  const doc=new PDFDocument({size:'A4',margins:{top:45,bottom:48,left:44,right:44},bufferPages:true,info:{Title:`Payment Receipt ${receipt.receipt_number}`,Author:'LikhArtisan',CreationDate:new Date(receipt.issued_at)}});
  const chunks=[];
  const completed = new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
  doc.registerFont('Receipt',asset('SourceSans3-Regular.ttf')).font('Receipt');
  const left=44,right=551,width=507,bottom=760;
  let y=45;
  function text(value,x,top,w,size=10,align='left') {doc.fontSize(size).fillColor('#322820').text(String(value??''),x,top,{width:w,align,lineGap:2});}
  function rule(top){doc.moveTo(left,top).lineTo(right,top).lineWidth(.5).strokeColor('#dfd5ca').stroke();}
  function tableHeading(){doc.rect(left,y,width,25).fill('#f6efe7');text('Description / Variant',left+8,y+6,270,9);text('Qty',326,y+6,35,9,'right');text('Unit price',369,y+6,82,9,'right');text('Amount',459,y+6,84,9,'right');y+=33;}
  function newPage(withTable=true){doc.addPage();y=45;text('LikhArtisan · Payment Receipt',left,y,330,12);text(receipt.receipt_number,left,y+18,width,8);y+=45;if(withTable)tableHeading();}
  doc.image(asset('logo.png'),left,y,{fit:[165,45]});
  text('PAYMENT RECEIPT',300,y+3,251,18,'right');text('Purchase record',300,y+28,251,10,'right');y+=65;rule(y);y+=16;
  const meta=[['Receipt number',receipt.receipt_number],['Order reference',s.orderId],['Order date',date(s.orderDate)],['Payment date',date(s.paidAt)],['Issued',date(receipt.issued_at)],['Payment reference',s.paymentReference]].filter(([,value])=>value);
  for(const [label,value] of meta){const h=Math.max(16,doc.fontSize(10).heightOfString(String(value),{width:365})+3);text(label,left,y,130,10);text(value,180,y,371,10);y+=h;}
  y+=14;text('BUYER',left,y,width,10);y+=19;
  for(const value of [s.buyerName,s.buyerPhone,s.buyerEmail,s.buyerAddress].filter(Boolean)){
    // Wrap unusually long saved addresses rather than clipping them.
    const lines=String(value).match(/.{1,140}(?:\s|$)|.{1,140}/gu)||[];
    for(const line of lines){const h=doc.fontSize(10).heightOfString(line,{width})+4;if(y+h>bottom)newPage(false);text(line,left,y,width,10);y+=h;}
  }
  y+=19;if(y>bottom-100)newPage(false);tableHeading();
  for(const row of rows){
    const description=`${row.name}\n${row.shop}${row.variant?` · ${row.variant}`:''}`;
    const height=Math.max(42,doc.fontSize(10).heightOfString(description,{width:265})+15);
    // Extremely long descriptions are split across pages in bounded segments.
    const parts=description.match(/.{1,500}(?:\s|$)|.{1,500}/gs)||[''];
    for(let i=0;i<parts.length;i++){
      const h=parts.length===1?height:Math.max(42,doc.fontSize(10).heightOfString(parts[i],{width:265})+15);
      if(y+h>bottom)newPage();
      text(parts[i],left+8,y+3,265,10);
      if(i===0){text(row.quantity,326,y+3,35,10,'right');text(money(row.price),369,y+3,82,10,'right');text(money(row.amount),459,y+3,84,10,'right');}
      y+=h;rule(y);y+=7;
    }
  }
  if(y>bottom-165)newPage(false);y+=10;
  for(const [label,value] of [['Subtotal',s.subtotal],['Shipping',s.shippingFee],['Total paid',s.total]]){text(label,330,y,110,label==='Total paid'?12:10);text(money(value),440,y,111,label==='Total paid'?14:10,'right');y+=26;}
  if(rounded){y+=5;text('Approved quote total applies; unit prices are rounded.',left,y,width,9);y+=24;}
  y+=10;text('System-generated purchase record. Not a tax invoice. No signature required.',left,y,width,9);
  const range=doc.bufferedPageRange();
  for(let i=0;i<range.count;i++){
    doc.switchToPage(i);
    const margin=doc.page.margins.bottom;doc.page.margins.bottom=0;
    doc.fontSize(8).fillColor('#756c63').text(`Page ${i+1} of ${range.count}`,left,805,{width,align:'center',lineBreak:false});
    doc.page.margins.bottom=margin;
  }
  doc.end();return completed;
}

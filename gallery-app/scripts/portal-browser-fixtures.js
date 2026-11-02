async (page) => {
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const encode = value => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const sessions = Object.fromEntries([
    ['admin', 'admin-1', 'admin@example.test'], ['seller', 'seller-1', 'seller@example.test'],
    ['seller2', 'seller-2', 'seller2@example.test'], ['buyer', 'buyer-1', 'buyer@example.test'],
  ].map(([role,id,email]) => [role, {
    access_token: `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:id,role:'authenticated',exp:expires})}.fixture`,
    refresh_token:`fixture-${role}`,expires_in:86400,expires_at:expires,token_type:'bearer',
    user:{id,email,role:'authenticated',aud:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{name:role}},
  }]));
  const date = '2026-11-02T01:00:00Z';
  const shops = [{id:'shop-1',name:'Fixture Clay Studio',owner_id:'seller-1',email:'seller@example.test',location:'Manila',description:'Test ceramics',about:'Local fixture data',created_at:date}, {id:'shop-2',name:'Other Clay Studio',owner_id:'seller-2',email:'seller2@example.test',location:'Quezon City',created_at:date}];
  const products = shops.map((shop,i) => ({id:`product-${i+1}`,name:i?'Other Shop Vase':'Fixture Clay Vase',shop_id:shop.id,shop_name:shop.name,category:'Vases',status:'active',price:450,stock:5,image:'/placeholder.svg',materials:'Clay',technique:'Handmade',description:'Fixture product',created_at:date,updated_at:date}));
  const orders = shops.map((shop,i) => ({id:`order-${i+1}`,user_id:'buyer-1',user_name:'Fixture Buyer',status:'paid',payment_status:'paid',delivery_status:'pending',order_type:i?'customized':'product',design_request_id:i?'request-2':null,total:450,subtotal:450,shipping_fee:0,delivery_option:'pickup',created_at:date,items:[{product_id:products[i].id,product_name:products[i].name,shop_id:shop.id,shop_name:shop.name,qty:1,price:450,image:'/placeholder.svg'}]}));
  const conversations = shops.map((shop,i)=>({id:`conversation-${i+1}`,shop_id:shop.id,buyer_id:'buyer-1',buyer_name:'Fixture Buyer',buyer_unread:0,artisan_unread:0,last_message:'Can I order this vase?',last_message_at:date,created_at:date}));
  const messages = conversations.map((c,i)=>({id:`message-${i+1}`,conversation_id:c.id,sender_id:'buyer-1',text:c.last_message,created_at:date}));
  const roles = [{id:'role-1',user_id:'admin-1',role:'super_admin'},...shops.map((shop,i)=>({id:`role-${i+2}`,user_id:shop.owner_id,role:'shop_owner',shop_id:shop.id}))];
  const tables = {
    shops, products, orders, conversations, messages, user_roles:roles,
    product_variations:products.map((p,i)=>({id:`variation-${i+1}`,product_id:p.id,price:450,stock:5,dimensions:'4 x 4 in',height:'8 in',opening_diameter:'3 in',measurement_unit:'in',product_weight_g:400,sort_order:0})),
    artisans:shops.map((s,i)=>({id:`artisan-${i+1}`,shop_id:s.id,name:`Fixture Artisan ${i+1}`,specialty:'Pottery',experience:'5 years',description:'Fixture artisan',location:'Manila',cover_image:'/placeholder.svg',created_at:date})),
    notifications:[{id:'notification-1',user_id:'seller-1',recipient_context:'artisan',type:'message',title:'New buyer message',message:'Fixture Buyer sent a message',conversation_id:'conversation-1',read:false,created_at:date}],
    theme_settings:[{id:'current',theme_name:'default',auto_detect:false}],
    models_3d:[],landing_3d_feature:[],design_requests:[],design_request_events:[],design_request_revisions:[],activity_log:[],generated_attachment_catalog_settings:[],generated_attachment_shop_overrides:[]
  };
  const analytics={summary:{grossRevenue:450,refunds:0,netRevenue:450,paidOrders:1,averageOrderValue:450,purchasingCustomers:1,repeatCustomers:0,repeatCustomerRate:0,cancellationRate:0,problematicOrders:0},comparisonSummary:null,series:[],paymentStatuses:[],deliveryStatuses:[],products:[],shops:[],categories:[]};
  await page.context().routeWebSocket('**/realtime/v1/**', ws => { ws.onMessage(raw => { try { let msg=JSON.parse(String(raw)); const array=Array.isArray(msg); if(array) msg={join_ref:msg[0],ref:msg[1],topic:msg[2],event:msg[3],payload:msg[4]}; const send=reply=>ws.send(JSON.stringify(array?[reply.join_ref||null,reply.ref,reply.topic,reply.event,reply.payload]:reply)); if(msg.event==='phx_join') send({topic:msg.topic,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:[]}},ref:msg.ref,join_ref:msg.join_ref}); if(msg.event==='heartbeat') send({topic:'phoenix',event:'phx_reply',payload:{status:'ok',response:{}},ref:msg.ref}); } catch {} }); });
  await page.route('**/*', async route => {
    const req=route.request(), url=new URL(req.url());
    if(url.hostname==='127.0.0.1' && !url.pathname.startsWith('/api/')) return route.continue();
    const token=(req.headers().authorization||'').replace('Bearer ','');
    const session=Object.values(sessions).find(s=>s.access_token===token)||sessions.admin;
    const user=session.user;
    const reply=(body,status=200,headers={})=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers});
    if(url.pathname.includes('/auth/v1/user')) return reply(user);
    if(url.pathname.includes('/auth/v1/token')) return reply(session);
    if(url.pathname.startsWith('/api/orders/admin/returns/order/')) return reply({returnRequest:null});
    if(url.pathname.endsWith('/seller-delivery-status')) {
      const id=url.pathname.split('/').at(-2), row=orders.find(o=>o.id===id), body=req.postDataJSON();
      if(!row) return reply({error:'Not found'},404);
      const shop=shops.find(s=>s.owner_id===user.id);
      if(!shop||!row.items.some(i=>i.shop_id===shop.id)) return reply({error:'Not your shop'},403);
      row.delivery_status=body.status;
      return reply({order:{id:row.id,status:row.status,delivery_status:row.delivery_status},notificationSent:true});
    }
    if(url.pathname.startsWith('/api/')) return reply({ok:true});
    if(url.pathname.includes('/rest/v1/rpc/')) {
      const rpc=url.pathname.split('/').at(-1);
      if(rpc==='count_active_users') return reply(4);
      if(rpc==='admin_commerce_analytics') return reply(analytics);
      if(rpc==='list_users_with_roles') return reply(Object.values(sessions).map(s=>({id:s.user.id,email:s.user.email,created_at:date,roles:roles.filter(r=>r.user_id===s.user.id)})));
      return reply([]);
    }
    if(url.pathname.includes('/rest/v1/')) {
      const table=url.pathname.split('/').at(-1);let rows=[...(tables[table]||[])];
      // This is a fixture access model, not proof of production RLS.
      if(user.id.startsWith('seller-') && ['products','orders','conversations'].includes(table)) { const shop=shops.find(s=>s.owner_id===user.id);rows=rows.filter(r=>table==='orders'?r.items.some(i=>i.shop_id===shop?.id):r.shop_id===shop?.id); }
      for(const [key,value] of url.searchParams) { if(value.startsWith('eq.')) rows=rows.filter(r=>String(r[key])===value.slice(3)); if(value.startsWith('in.(')) { const values=value.slice(4,-1).split(',');rows=rows.filter(r=>values.includes(String(r[key]))); } }
      if(req.method()==='PATCH') { const changes=req.postDataJSON();rows.forEach(r=>Object.assign(r,changes)); }
      if(req.method()==='DELETE') tables[table]=(tables[table]||[]).filter(r=>!rows.includes(r));
      if(req.method()==='POST') { const body=req.postDataJSON();rows=(Array.isArray(body)?body:[body]).map((row,i)=>({id:row.id||`created-${Date.now()}-${i}`,created_at:date,...row})); tables[table]=tables[table]||[];for(const row of rows) { const old=tables[table].find(r=>r.id===row.id);if(old)Object.assign(old,row);else tables[table].push(row); } }
      if(url.searchParams.has('limit'))rows=rows.slice(0,Number(url.searchParams.get('limit')));
      const single=(req.headers().accept||'').includes('vnd.pgrst.object');
      const headers={'content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`};
      return reply(single?(rows[0]||null):rows,200,headers);
    }
    if(req.resourceType()==='image') return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="#e8d8c8"/></svg>'});
    return reply({});
  });
  await page.addInitScript(({sessions})=>{
    const role=localStorage.getItem('portal-fixture-role')||'admin';
    localStorage.setItem('sb-portal-fixtures-auth-token',JSON.stringify(sessions[role]));
  },{sessions});
  await page.goto('http://127.0.0.1:5188/admin');
}
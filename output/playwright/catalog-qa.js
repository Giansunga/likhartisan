async (page) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.unroute('**/*');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const square = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#eeeae5"/><path d="M125 100H275L255 300H145Z" fill="#a76742"/></svg>');
  const portrait = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><rect width="200" height="400" fill="#eeeae5"/><rect x="50" y="30" width="100" height="340" fill="#a76742"/></svg>');
  const wide = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="250"><rect width="600" height="250" fill="#eeeae5"/><ellipse cx="300" cy="125" rx="280" ry="100" fill="#a76742"/></svg>');
  const products = [
    {id:'vase',name:'Handcrafted terracotta vase with a deliberately long product name',price:400,stock:5,image:"https://pub-0cc6e7109e7e48a183d54d0426453a6a.r2.dev/products/1786633796932_6a94cb2a.jpg" || square,model3d:"https://pub-0cc6e7109e7e48a183d54d0426453a6a.r2.dev/models/1786547266096_c53a2a58.glb",shop_id:'qa-shop',shop_name:'Clay House',category:'Vases',status:'active',materials:'Terracotta Clay'},
    {id:'sold',name:'Sold-out portrait vase',price:200,stock:4,image:portrait,shop_id:'qa-shop',shop_name:'Clay House',category:'Vases',status:'active'},
    {id:'wide',name:'Wide pottery bowl',price:120,stock:2,image:wide,shop_id:'qa-shop',shop_name:'Clay House',category:'Vases',status:'active'},
    {id:'zero',name:'Stored zero-price piece',price:0,stock:0,image:square,shop_id:'qa-shop',shop_name:'Clay House',category:'Vases',status:'active'},
  ];
  const shop = {id:'qa-shop',name:'Clay House',owner_name:'QA Maker',email:'test@example.test',description:'Handmade pottery in Santo Tomas',about:'Our family pottery workshop.',location:'Santo Tomas',image:'',banner:'',created_at:'2022-01-01'};
  const artisans = [{id:'assigned',name:'Assigned maker',shop_id:'qa-shop',cover_image:'/images/artisan_1.jpg',specialty:'Potter'}, {id:'independent',name:'Independent maker',shop_id:null,cover_image:'/images/hero_1.jpg'}, {id:'missing',name:'Unavailable shop maker',shop_id:'missing',cover_image:'/images/hero_1.jpg'}];
  const variations = [{product_id:'sold',price:80,stock:0},{product_id:'sold',price:120,stock:0}];
  const totals = {artisans:19,products:104};
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname.includes('supabase') && url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      let data = table === 'products' ? products : table === 'shops' ? [shop] : table === 'artisans' ? artisans : table === 'product_variations' ? variations : [];
      for (const [key,value] of url.searchParams) { if(value.startsWith('eq.')) data=data.filter(row=>String(row[key])===value.slice(3)); if(value.startsWith('in.(')) { const ids=value.slice(4,-1).split(','); data=data.filter(row=>ids.includes(String(row[key]))); } }
      const count = (route.request().method()==='HEAD' && !url.searchParams.has('shop_id')) ? (totals[table] ?? data.length) : data.length;
      const body = route.request().headers().accept?.includes('vnd.pgrst.object') ? JSON.stringify(data[0] ?? null) : JSON.stringify(data);
      return route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-' + Math.max(0,count-1) + '/' + count,'access-control-expose-headers':'content-range'},body:route.request().method()==='HEAD' ? '' : body});
    }
    if (url.hostname.includes('youtube')) return route.fulfill({contentType:'text/html',body:'<p>Shop tour preview</p>'});
    if(url.pathname.startsWith('/api/') || url.port==='3001')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    return route.continue();
  });
  const report = [];
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:4173/gallery');
    await page.locator('.product-card-item').first().waitFor();
    await page.locator('.product-grid').scrollIntoViewIfNeeded();
    const gallery = await page.locator('.product-img-wrapper').evaluateAll(nodes=>nodes.map(node=>({square:Math.abs(node.clientWidth-node.clientHeight)<=1,fit:getComputedStyle(node.querySelector('img')).objectFit})));
    const sold=page.locator('.product-card-item[href="/product/sold"]');
    if(!(await sold.innerText()).includes('₱80') || !(await sold.innerText()).includes('Out of stock'))throw new Error('Missing sold-out price');
    const footer=await sold.locator('.product-card-footer').evaluate(node=>{const price=node.querySelector('.product-card-price').getBoundingClientRect();const badge=node.querySelector('.product-card-out-of-stock').getBoundingClientRect();return {priceLeft:price.left<badge.left,badgeRight:Math.abs(badge.right-node.getBoundingClientRect().right)<2};});
    await page.screenshot({path:'output/playwright/catalog-gallery-'+width+'.png'});
    report.push({surface:'gallery',width,gallery,footer,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    await page.goto('http://127.0.0.1:4173/shop/qa-shop');
    await page.getByRole('heading',{name:'Featured pieces'}).waitFor();
    await page.locator('.shop-product-grid').scrollIntoViewIfNeeded();
    report.push({surface:'shop',width,fit:await page.locator('.shop-product-card__image img').first().evaluate(node=>getComputedStyle(node).objectFit),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    await page.screenshot({path:'output/playwright/catalog-shop-'+width+'.png'});
    await page.goto('http://127.0.0.1:4173/product/vase');
    await page.getByRole('button',{name:'Disable studio background'}).waitFor();
    await page.locator('.pdp-media-frame canvas').waitFor();
    await page.locator('.pdp-media-frame').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1800);
    const controls=await page.locator('.pdp-media-frame').evaluate(node=>{const frame=node.getBoundingClientRect(); const studio=node.querySelector('.model-viewer-studio-toggle').getBoundingClientRect();const favorite=node.querySelector('.pdp-favorite').getBoundingClientRect();return {studioLeft:studio.left-frame.left<15,heartRight:frame.right-favorite.right<15,minTargets:studio.height>=44&&favorite.height>=44,separated:studio.right<favorite.left};});
    await page.getByRole('button',{name:/Add Handcrafted.*to favorites/}).click();
    await page.getByRole('button',{name:/Remove Handcrafted.*from favorites/}).waitFor();
    await page.getByRole('button',{name:/Remove Handcrafted.*from favorites/}).press('Tab');
    report.push({surface:'viewer',width,controls,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    await page.screenshot({path:'output/playwright/catalog-viewer-'+width+'.png'});
    await page.getByRole('button',{name:/Remove Handcrafted.*from favorites/}).click();
    await page.locator('.pdp-rail').first().scrollIntoViewIfNeeded();
    report.push({surface:'recommendations',width,cards:await page.locator('.pdp-card-image').evaluateAll(nodes=>nodes.map(node=>({square:Math.abs(node.clientWidth-node.clientHeight)<=1,fit:getComputedStyle(node.querySelector('img')).objectFit}))),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
    await page.screenshot({path:'output/playwright/catalog-recommendations-'+width+'.png'});
  }
  await page.goto('http://127.0.0.1:4173/artisans');await page.getByRole('link',{name:'Clay House',exact:true}).waitFor();
  await page.screenshot({path:'output/playwright/catalog-artisans-mobile.png'});
  await page.goto('http://127.0.0.1:4173/#home-collections');
  await page.getByLabel('LikhArtisan community impact').waitFor();
  await page.waitForTimeout(400);
  const initialCounts=await page.locator('.home-impact__stat').allTextContents();
  totals.artisans=20;totals.products=103;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);
  report.push({surface:'counts',initialCounts,updated:await page.locator('.home-impact__stat').allTextContents()});
  await page.screenshot({path:'output/playwright/catalog-counts-mobile.png'});
  await page.setViewportSize({width:768,height:900});
  await page.goto('http://127.0.0.1:4173/gallery');await page.locator('.product-card-item').first().waitFor();
  await page.evaluate(()=>document.body.style.zoom='2');
  report.push({surface:'zoom200',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await page.screenshot({path:'output/playwright/catalog-zoom200.png'});
  return {report,errors};
}
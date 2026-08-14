export async function createOrderNotifications(supabase, orderId, items, buyerName) {
  const shopIds = [...new Set((items || []).map(item => item.shop_id).filter(Boolean))];
  for (const shopId of shopIds) {
    const { data: shop } = await supabase.from('shops').select('id, owner_id').eq('id', shopId).single();
    let ownerId = shop?.owner_id;
    if (!ownerId && shop?.id) {
      const { data: shopRole } = await supabase.from('user_roles').select('user_id').eq('shop_id', shop.id).eq('role', 'shop_owner').limit(1).maybeSingle();
      ownerId = shopRole?.user_id;
      if (ownerId) await supabase.from('shops').update({ owner_id: ownerId }).eq('id', shopId);
    }
    if (ownerId) {
      await supabase.from('notifications').insert({
        user_id: ownerId,
        type: 'order',
        title: 'New Order Received',
        message: `${buyerName || 'A buyer'} placed an order (ID: ${orderId.substring(0, 8)})`,
        order_id: orderId,
        recipient_context: 'artisan',
      });
    }
  }
}

export async function decrementStockForItems(supabase, items) {
  if (!items?.length) return;
  for (const item of items.filter(value => value.variation_id)) {
    const { error } = await supabase.rpc('decrement_stock', { p_variation_id: item.variation_id, p_qty: item.qty });
    if (error) throw error;
  }
  for (const item of items.filter(value => !value.variation_id && value.product_id)) {
    const { data: product, error: readError } = await supabase.from('products').select('stock').eq('id', item.product_id).single();
    if (readError) throw readError;
    const next = Math.max(0, (Number(product?.stock) || 0) - (Number(item.qty) || 0));
    const { error: updateError } = await supabase.from('products').update({ stock: next }).eq('id', item.product_id);
    if (updateError) throw updateError;
  }
  const variedProductIds = [...new Set(items.filter(value => value.variation_id && value.product_id).map(value => value.product_id))];
  for (const productId of variedProductIds) {
    const { data: variations, error: variationError } = await supabase.from('product_variations').select('stock').eq('product_id', productId);
    if (variationError) throw variationError;
    const totalStock = (variations || []).reduce((sum, variation) => sum + (Number(variation.stock) || 0), 0);
    const { error: productError } = await supabase.from('products').update({ stock: totalStock }).eq('id', productId);
    if (productError) throw productError;
  }
}

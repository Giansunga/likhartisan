import { supabase } from './supabase';

/**
 * Recompute a product's stock level from its variations.
 * Should be called after any variation stock edit.
 */
export async function recomputeProductStock(productId: string): Promise<number> {
  const { data: variations, error } = await supabase
    .from('product_variations')
    .select('stock')
    .eq('product_id', productId);

  if (error) {
    throw error;
  }

  const totalStock = (variations || []).reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

  const { data: saved, error: saveError } = await supabase
    .from('products')
    .update({ stock: totalStock, updated_at: new Date().toISOString() })
    .eq('id', productId).select('id').single();
  if (saveError) throw saveError;
  if (!saved) throw new Error('Product stock could not be confirmed. Reload before retrying.');

  return totalStock;
}

/**
 * Batch recompute stock for multiple products.
 */
export async function recomputeAllProductStocks(): Promise<void> {
  const { data: products, error } = await supabase
    .from('products')
    .select('id');

  if (error) throw error;
  if (!products) return;

  await Promise.all(products.map(p => recomputeProductStock(p.id)));
}

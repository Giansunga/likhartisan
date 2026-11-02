import { supabase } from './supabase';

export interface CatalogVariationWrite {
  id?: string;
  clientId: string;
  values: Record<string, unknown>;
}

// Stable draft IDs let a user resume a partially completed save without inserting duplicates.
export async function saveCatalogVariations(productId: string, rows: CatalogVariationWrite[]) {
  const savedIds: string[] = [];
  for (const row of rows) {
    const id = row.id || row.clientId;
    const update = () => supabase.from('product_variations').update(row.values).eq('id', id).eq('product_id', productId).select('id').single();
    let result = row.id ? await update() : await supabase.from('product_variations').insert({ ...row.values, id, product_id: productId }).select('id').single();
    // A duplicate primary key confirms an earlier attempt persisted this exact draft row.
    if (!row.id && result.error?.code === '23505') result = await update();
    if (result.error) throw result.error;
    if (!result.data?.id) throw new Error('A saved variation could not be confirmed. Reload before retrying.');
    savedIds.push(result.data.id);
  }
  return savedIds;
}

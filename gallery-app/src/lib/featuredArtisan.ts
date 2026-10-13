import { supabase } from './supabase';

export interface FeaturedArtisan {
  id: string;
  shop_id: string;
  name: string;
  specialty: string | null;
}

export async function validateFeaturedArtisan(shopId: string, artisanId: string) {
  if (!shopId || !artisanId) throw new Error('Select a Featured Artisan for this shop.');
  const { data, error } = await supabase.from('artisans')
    .select('id').eq('id', artisanId).eq('shop_id', shopId).single();
  if (error || !data) throw new Error('The selected artisan is no longer available for this shop. Please select an artisan again.');
}

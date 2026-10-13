import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FeaturedArtisan } from '../lib/featuredArtisan';

export default function ProductFeaturedArtisan({ artisanId, shopId }: { artisanId?: string; shopId: string }) {
  const request = useMemo(() => ({ artisanId, shopId }), [artisanId, shopId]);
  const [result, setResult] = useState<{ request: typeof request; artisan: FeaturedArtisan } | null>(null);
  const artisan = result?.request === request ? result.artisan : null;
  useEffect(() => {
    let active = true;
    if (!artisanId || !shopId) return;
    void (async () => {
      try {
        const { data, error } = await supabase.from('artisans').select('id, shop_id, name, specialty')
          .eq('id', artisanId).eq('shop_id', shopId).single();
        if (active && !error && data) setResult({ request, artisan: data });
      } catch { /* Artisan details are optional for viewing the product. */ }
    })();
    return () => { active = false; };
  }, [artisanId, shopId, request]);
  if (!artisan?.name?.trim() || artisan.id !== artisanId || artisan.shop_id !== shopId) return null;
  return <div className="pdp-featured-artisan">
    <span>Featured Artisan: <strong>{artisan.name}</strong></span>
    {artisan.specialty?.trim() && <em>{artisan.specialty}</em>}
  </div>;
}

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { resolveCatalogAssets, type CatalogSettingsRecord, type GeneratedAttachmentAsset, type ShopOverrideRecord } from './attachments';
import { GENERATED_ATTACHMENT_RECIPES } from './generatedAttachmentCatalog';

export type AttachmentCatalog = {
  status: 'pending' | 'ready' | 'error';
  assets: GeneratedAttachmentAsset[];
  error: string;
  retry: () => void;
};

export function useAttachmentCatalog(shopId: string | null, enabled = true): AttachmentCatalog {
  const [attempt, setAttempt] = useState(0);
  const key = `${shopId || ''}:${attempt}`;
  const [result, setResult] = useState<{ key: string; status: AttachmentCatalog['status']; assets: GeneratedAttachmentAsset[]; error: string }>(
    { key: '', status: 'pending', assets: [], error: '' },
  );
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    async function load() {
      try {
        const [settings, overrides] = await Promise.all([
          supabase.from('generated_attachment_catalog_settings').select('*').eq('active', true).order('recipe_key'),
          shopId ? supabase.from('generated_attachment_shop_overrides').select('*').eq('shop_id', shopId)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (settings.error || overrides.error) throw settings.error || overrides.error;
        if (alive) setResult({ key, status: 'ready', error: '', assets: resolveCatalogAssets(GENERATED_ATTACHMENT_RECIPES,
          (settings.data || []) as CatalogSettingsRecord[], (overrides.data || []) as ShopOverrideRecord[], shopId) });
      } catch {
        if (alive) setResult({ key, status: 'error', assets: [], error: 'Attachments could not be checked. Your selections are retained. Please retry.' });
      }
    }
    void load();
    return () => { alive = false; };
  }, [enabled, key, shopId]);
  return { status: result.key === key ? result.status : 'pending', assets: result.key === key ? result.assets : [],
    error: result.key === key ? result.error : '', retry: () => setAttempt(value => value + 1) };
}

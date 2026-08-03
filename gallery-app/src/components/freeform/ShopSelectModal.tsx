import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ShopWithModels {
  id: string;
  name: string;
  image: string;
  modelCount: number;
  thumbnails: string[];
}

export default function ShopSelectModal({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (shopId: string, shopName: string) => void;
}) {
  const [shops, setShops] = useState<ShopWithModels[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    fetchShopsWithModels();
  }, [open]);

  async function fetchShopsWithModels() {
    setLoading(true);

    // Fetch models that have a shop_id, joining with shops
    const { data: modelRows } = await supabase
      .from('models_3d')
      .select('shop_id, thumbnail, shops!inner(id, name, image)')
      .not('shop_id', 'is', null)
      .eq('status', 'active');

    if (!modelRows || modelRows.length === 0) {
      setShops([]);
      setLoading(false);
      return;
    }

    // Group by shop
    const shopMap = new Map<string, { name: string; image: string; thumbnails: string[] }>();
    for (const row of modelRows) {
      const shopId = row.shop_id as string;
      const shopData = (row as any).shops;
      if (!shopMap.has(shopId)) {
        shopMap.set(shopId, {
          name: shopData.name,
          image: shopData.image || '',
          thumbnails: [],
        });
      }
      const entry = shopMap.get(shopId)!;
      if (row.thumbnail && entry.thumbnails.length < 6) {
        entry.thumbnails.push(row.thumbnail);
      }
    }

    const result: ShopWithModels[] = Array.from(shopMap.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      image: data.image,
      modelCount: modelRows.filter((r) => (r as any).shop_id === id).length,
      thumbnails: data.thumbnails,
    }));

    setShops(result);
    setLoading(false);
  }

  function handleConfirm() {
    if (!selectedId) return;
    const shop = shops.find((s) => s.id === selectedId);
    if (shop) onSelect(shop.id, shop.name);
  }

  if (!open) return null;

  return (
    <div className="shop-select-overlay">
      <div className="shop-select-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shop-select-header">
          <h3 className="freeform-modal-title">Select a Shop</h3>
        </div>

        <div className="shop-select-body">
          {loading ? (
            <div className="shop-select-empty">Loading shops...</div>
          ) : shops.length === 0 ? (
            <div className="shop-select-empty">No shops with models available yet</div>
          ) : (
            shops.map((shop) => (
              <button
                key={shop.id}
                className={`shop-card${selectedId === shop.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(shop.id)}
              >
                <div className="shop-card-header">
                  <div className="shop-card-avatar">
                    {shop.image ? (
                      <img src={shop.image} alt={shop.name} />
                    ) : (
                      <span>{shop.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="shop-card-info">
                    <div className="shop-card-name">{shop.name}</div>
                    <div className="shop-card-count">{shop.modelCount} Options</div>
                  </div>
                </div>
                {shop.thumbnails.length > 0 && (
                  <div className="shop-card-thumbs">
                    {shop.thumbnails.map((thumb, i) => (
                      <div key={i} className="shop-card-thumb">
                        <img src={thumb} alt="" />
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        <div className="shop-select-footer">
          <span className="shop-select-label">
            {selectedId
              ? <>Selected: <strong>{shops.find((s) => s.id === selectedId)?.name}</strong></>
              : 'Select a shop to continue'}
          </span>
          <button
            className="freeform-save-btn"
            disabled={!selectedId}
            onClick={handleConfirm}
            style={{ opacity: selectedId ? 1 : 0.5 }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

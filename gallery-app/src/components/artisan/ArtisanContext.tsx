import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SHOP_EMAILS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { ArtisanProduct, ArtisanShop } from '../../types/artisan';
import { ArtisanContext, type ArtisanContextValue } from './artisanContextValue';

export default function ArtisanProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<ArtisanShop | null>(null);
  const [products, setProducts] = useState<ArtisanProduct[]>([]);
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [buyerActiveMap, setBuyerActiveMap] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function resolveShop() {
      if (!user) {
        if (active) setChecked(true);
        return;
      }

      const email = user.email?.trim().toLowerCase() || '';
      const configuredSeller = SHOP_EMAILS.some((item: string) => item.trim().toLowerCase() === email);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role, shop_id')
        .eq('user_id', user.id);
      const ownerRole = roles?.find(role => role.role === 'shop_owner');
      if (!configuredSeller && !ownerRole) {
        if (active) setChecked(true);
        return;
      }

      let shopResult: ArtisanShop | null = null;
      if (configuredSeller) {
        const { data } = await supabase.from('shops').select('*').eq('email', user.email).maybeSingle();
        shopResult = data as ArtisanShop | null;
      }
      if (!shopResult && ownerRole?.shop_id) {
        const { data } = await supabase.from('shops').select('*').eq('id', ownerRole.shop_id).maybeSingle();
        shopResult = data as ArtisanShop | null;
      }
      if (!shopResult && configuredSeller) {
        const { data } = await supabase.from('shops').select('*').eq('owner_id', user.id).maybeSingle();
        shopResult = data as ArtisanShop | null;
      }
      if (active) {
        setShop(shopResult);
        setChecked(true);
      }
    }

    void resolveShop().catch(error => {
      console.error('Seller access check failed:', error);
      if (active) setChecked(true);
    });
    return () => { active = false; };
  }, [authLoading, user]);

  const fetchProducts = useCallback(async () => {
    if (!shop?.id) return;
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: false });
    if (error) {
      setLoadingProducts(false);
      throw error;
    }
    const nextProducts = (data || []) as ArtisanProduct[];
    setProducts(nextProducts);
    const ids = nextProducts.map(product => product.id);
    if (ids.length) {
      const { data: variations } = await supabase
        .from('product_variations')
        .select('product_id, price')
        .in('product_id', ids);
      const nextPrices: Record<string, number> = {};
      for (const variation of variations || []) {
        const price = Number(variation.price) || 0;
        if (!(variation.product_id in nextPrices) || price < nextPrices[variation.product_id]) {
          nextPrices[variation.product_id] = price;
        }
      }
      setProductPrices(nextPrices);
    } else {
      setProductPrices({});
    }
    setLoadingProducts(false);
  }, [shop]);

  useEffect(() => {
    if (!shop?.id) return;
    queueMicrotask(() => { void fetchProducts().catch(error => console.error('Seller products failed:', error)); });
  }, [fetchProducts, shop?.id]);

  useEffect(() => {
    if (!shop?.id) return;
    const channel = supabase.channel(`shop:${shop.id}`, { config: { presence: { key: shop.id } } });
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') void channel.track({ shop_id: shop.id, online_at: new Date().toISOString() });
    });
    void supabase.from('shops').update({ last_seen_at: new Date().toISOString() }).eq('id', shop.id);
    return () => { void supabase.removeChannel(channel); };
  }, [shop?.id]);

  useEffect(() => {
    const channel = supabase.channel('buyers-online')
      .on('presence', { event: 'sync' }, () => {
        const next: Record<string, boolean> = {};
        for (const presences of Object.values(channel.presenceState())) {
          for (const presence of presences as Array<{ user_id?: string }>) {
            if (presence.user_id) next[presence.user_id] = true;
          }
        }
        setBuyerActiveMap(next);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const value = useMemo<ArtisanContextValue | null>(() => shop && user ? ({
    shop,
    products,
    productPrices,
    loadingProducts,
    loadingOrders,
    loadingMessages,
    buyerActiveMap,
    userId: user.id,
    setProducts,
    setShop,
    setLoadingOrders,
    setLoadingMessages,
    refreshProducts: fetchProducts,
  }) : null, [shop, user, products, productPrices, loadingProducts, loadingOrders, loadingMessages, buyerActiveMap, fetchProducts]);

  if (!checked || authLoading) return <div className="seller-route-loader">Loading your shop…</div>;
  if (!value) return <Navigate to="/" replace />;
  return <ArtisanContext.Provider value={value}>{children}</ArtisanContext.Provider>;
}

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getErrorMessage } from '../../lib/portalErrors';
import { captureException } from '../../lib/sentry';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { SHOP_EMAILS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { normalizeProductCategory } from '../../lib/utils';
import type { ArtisanProduct, ArtisanShop } from '../../types/artisan';
import { PortalRealtimeProvider } from '../../realtime/PortalRealtimeProvider';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import { listenToBuyerPresence } from '../../realtime/buyerPresence';
import { ArtisanContext, useArtisanPortal, type ArtisanContextValue } from './artisanContextValue';

function ArtisanRealtimeBridge({ refreshProducts }: { refreshProducts: () => Promise<void> }) {
  const { shop, setShop } = useArtisanPortal();
  const refreshShop = useCallback(async () => {
    const { data, error } = await supabase.from('shops').select('*').eq('id', shop.id).maybeSingle();
    if (error) throw error;
    if (data) setShop(data as ArtisanShop);
  }, [setShop, shop.id]);
  usePortalRealtimeRefresh(['products', 'product_variations'], refreshProducts);
  usePortalRealtimeRefresh(['shops'], refreshShop);
  return null;
}

export default function ArtisanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <ArtisanSessionProvider key={user?.id || 'signed-out'}>{children}</ArtisanSessionProvider>;
}

function ArtisanSessionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [shop, setShop] = useState<ArtisanShop | null>(null);
  const [products, setProducts] = useState<ArtisanProduct[]>([]);
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [buyerActiveMap, setBuyerActiveMap] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState(false);
  const [accessError, setAccessError] = useState('');
  const [productsError, setProductsError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const productRequest = useRef(0);
  const shopId = shop?.id;

  useEffect(() => {
    if (authLoading) return;
    let active = true;

    async function resolveShop() {
      if (!user) {
        if (active) { setShop(null); setChecked(true); }
        return;
      }

      const email = user.email?.trim().toLowerCase() || '';
      const configuredSeller = SHOP_EMAILS.some((item: string) => item.trim().toLowerCase() === email);
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('role, shop_id')
        .eq('user_id', user.id);
      if (roleError) throw roleError;
      const ownerRole = roles?.find(role => role.role === 'shop_owner');
      if (!configuredSeller && !ownerRole) {
        if (active) { setShop(null); setChecked(true); }
        return;
      }

      let shopResult: ArtisanShop | null = null;
      if (configuredSeller) {
        const { data, error } = await supabase.from('shops').select('*').eq('email', email).limit(1).maybeSingle();
        if (error) throw error;
        shopResult = data as ArtisanShop | null;
      }
      if (!shopResult && ownerRole?.shop_id) {
        const { data, error } = await supabase.from('shops').select('*').eq('id', ownerRole.shop_id).maybeSingle();
        if (error) throw error;
        shopResult = data as ArtisanShop | null;
      }
      if (!shopResult && configuredSeller) {
        const { data, error } = await supabase.from('shops').select('*').eq('owner_id', user.id).limit(1).maybeSingle();
        if (error) throw error;
        shopResult = data as ArtisanShop | null;
      }
      if (active) {
        setShop(shopResult);
        setChecked(true);
      }
    }

    void resolveShop().catch(error => {
      console.error('Seller access check failed:', error);
      if (active) { setAccessError(getErrorMessage(error, 'Your shop access could not be verified.')); setChecked(true); }
    });
    return () => { active = false; };
  }, [attempt, authLoading, user]);

  const fetchProducts = useCallback(async () => {
    if (!shopId) return;
    const request = ++productRequest.current;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase.from('products').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
      if (error) throw error;
      const nextProducts = ((data || []) as ArtisanProduct[]).map(product => ({ ...product, category: normalizeProductCategory(product.category) }));
      const ids = nextProducts.map(product => product.id);
      const nextPrices: Record<string, number> = {};
      if (ids.length) {
        const { data: variations, error: variationError } = await supabase.from('product_variations').select('product_id, price').in('product_id', ids);
        if (variationError) throw variationError;
        for (const variation of variations || []) {
          if (variation.price == null) continue;
          const price = Number(variation.price);
          if (!Number.isFinite(price)) continue;
          if (!(variation.product_id in nextPrices) || price < nextPrices[variation.product_id]) nextPrices[variation.product_id] = price;
        }
      }
      if (request !== productRequest.current) return;
      setProducts(nextProducts);
      setProductPrices(nextPrices);
      setProductsError('');
    } catch (error) {
      if (request === productRequest.current) setProductsError(getErrorMessage(error, 'Listings could not be loaded. Please try again.'));
      throw error;
    } finally { if (request === productRequest.current) setLoadingProducts(false); }
  }, [shopId]);

  const invalidateProducts = useCallback(() => { productRequest.current++; }, []);
  useEffect(() => {
    if (!shop?.id) return;
    let active = true;
    queueMicrotask(() => { if (active) void fetchProducts().catch(() => undefined); });
    return () => { active = false; invalidateProducts(); };
  }, [fetchProducts, invalidateProducts, shop?.id]);

  useEffect(() => {
    if (!shop?.id) return;
    const channel = supabase.channel(`shop:${shop.id}`, { config: { presence: { key: shop.id } } });
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') void channel.track({ shop_id: shop.id, online_at: new Date().toISOString() }).catch(captureException);
    });
    void Promise.resolve(supabase.from('shops').update({ last_seen_at: new Date().toISOString() }).eq('id', shop.id)).catch(captureException);
    return () => { void supabase.removeChannel(channel).catch(captureException); };
  }, [shop?.id]);

  useEffect(() => {
    return listenToBuyerPresence(setBuyerActiveMap);
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
  if (accessError) return <section className="seller-route-loader" role="alert"><h2>Unable to verify shop access</h2><p>{accessError}</p><button type="button" onClick={() => { setAccessError(''); setChecked(false); setAttempt(value => value + 1); }}>Try again</button></section>;
  if (!shop || !user) return <Navigate to="/" replace />;
  return (
    <PortalRealtimeProvider topics={[`shop:${shop.id}`, `user:${user.id}`]}>
      <ArtisanContext.Provider value={value}>
        <ArtisanRealtimeBridge refreshProducts={fetchProducts} />
        {productsError && <div className="seller-message-error" role="alert"><span>{productsError}</span><button type="button" onClick={() => void fetchProducts().catch(() => undefined)}>Try again</button></div>}
        {children}
      </ArtisanContext.Provider>
    </PortalRealtimeProvider>
  );
}

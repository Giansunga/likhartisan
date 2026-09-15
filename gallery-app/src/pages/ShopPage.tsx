import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Store } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ShopClosingSection from '../components/shop/ShopClosingSection';
import ShopHero from '../components/shop/ShopHero';
import ShopMakersSection from '../components/shop/ShopMakersSection';
import ShopProductsSection from '../components/shop/ShopProductsSection';
import ShopStorySection from '../components/shop/ShopStorySection';
import {
  EMPTY_STOREFRONT_DATA,
  getLowestProductPrices,
  getMembershipYear,
  getProductRatingSummaries,
  type ShopArtisan,
  type ShopProfile,
  type ShopStorefrontData,
} from '../components/shop/shopStorefront';
import { useAuth } from '../contexts/AuthContext';
import { mapSupabaseProduct } from '../lib/utils';
import { supabase } from '../lib/supabase';
import '../styles/shop-profile.css';

type ActionStatus = { tone: 'success' | 'error'; text: string } | null;

const SHOP_FIELDS = 'id, name, owner_name, email, description, about, image, banner, location, created_at';
const PRODUCT_FIELDS = 'id, name, description, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, technique, shop_id, shop_name, status, views, created_at, updated_at';
const ARTISAN_FIELDS = 'id, name, specialty, experience, description, cover_image';

export default function ShopPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const requestId = useRef(0);
  const [shop, setShop] = useState<ShopProfile | null>(null);
  const [storefront, setStorefront] = useState<ShopStorefrontData>(EMPTY_STOREFRONT_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [messagePending, setMessagePending] = useState(false);
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null);

  const loadShop = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    setShop(null);
    setStorefront(EMPTY_STOREFRONT_DATA);

    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const shopResult = await supabase.from('shops').select(SHOP_FIELDS).eq('id', id).maybeSingle();
      if (currentRequest !== requestId.current) return;
      if (shopResult.error) throw shopResult.error;
      if (!shopResult.data) {
        setLoading(false);
        return;
      }

      const loadedShop = shopResult.data as ShopProfile;
      setShop(loadedShop);

      const [productResult, followerResult, artisanResult] = await Promise.all([
        supabase
          .from('products')
          .select(PRODUCT_FIELDS, { count: 'exact' })
          .eq('shop_id', id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.from('shop_followers').select('*', { count: 'exact', head: true }).eq('shop_id', id),
        supabase
          .from('artisans')
          .select(ARTISAN_FIELDS, { count: 'exact' })
          .eq('shop_id', id)
          .order('created_at', { ascending: false })
          .limit(4),
      ]);

      if (currentRequest !== requestId.current) return;
      if (productResult.error) throw productResult.error;

      const products = (productResult.data ?? []).map(row => mapSupabaseProduct(row));
      const productIds = products.map(product => product.id);
      let productPrices: Record<string, number> = {};
      let productRatings = {};

      if (productIds.length) {
        const [variationResult, reviewResult] = await Promise.all([
          supabase.from('product_variations').select('product_id, price').in('product_id', productIds).not('price', 'is', null),
          supabase.from('product_reviews').select('product_id, rating').in('product_id', productIds),
        ]);
        if (currentRequest !== requestId.current) return;
        if (!variationResult.error) productPrices = getLowestProductPrices(variationResult.data ?? []);
        if (!reviewResult.error) productRatings = getProductRatingSummaries(reviewResult.data ?? []);
      }

      setStorefront({
        products,
        productCount: productResult.count ?? products.length,
        followerCount: followerResult.error ? 0 : followerResult.count ?? 0,
        artisanCount: artisanResult.error ? 0 : artisanResult.count ?? artisanResult.data?.length ?? 0,
        artisans: artisanResult.error ? [] : (artisanResult.data ?? []) as ShopArtisan[],
        productPrices,
        productRatings,
      });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setLoadError(error instanceof Error ? error.message : 'This shop could not be loaded.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void loadShop();
    });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [loadShop]);

  useEffect(() => {
    let active = true;
    if (!id || !user?.id) {
      Promise.resolve().then(() => {
        if (active) setFollowing(false);
      });
      return () => { active = false; };
    }

    supabase
      .from('shop_followers')
      .select('id')
      .eq('shop_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setFollowing(!error && Boolean(data));
      });

    return () => { active = false; };
  }, [id, user?.id]);

  async function handleFollow() {
    if (!user?.id) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    if (!id || followPending) return;

    const wasFollowing = following;
    setFollowPending(true);
    setActionStatus(null);
    setFollowing(!wasFollowing);
    setStorefront(current => ({ ...current, followerCount: Math.max(0, current.followerCount + (wasFollowing ? -1 : 1)) }));

    const result = wasFollowing
      ? await supabase.from('shop_followers').delete().eq('shop_id', id).eq('user_id', user.id)
      : await supabase.from('shop_followers').insert({ shop_id: id, user_id: user.id });

    if (result.error) {
      setFollowing(wasFollowing);
      setStorefront(current => ({ ...current, followerCount: Math.max(0, current.followerCount + (wasFollowing ? 1 : -1)) }));
      setActionStatus({ tone: 'error', text: 'Your follow preference could not be updated. Please try again.' });
    } else {
      setActionStatus({ tone: 'success', text: wasFollowing ? `You unfollowed ${shop?.name ?? 'this shop'}.` : `You are now following ${shop?.name ?? 'this shop'}.` });
    }
    setFollowPending(false);
  }

  async function handleMessageShop() {
    if (!user?.id) {
      window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
      return;
    }
    if (!shop || messagePending) return;

    setMessagePending(true);
    setActionStatus(null);
    try {
      const existing = await supabase
        .from('conversations')
        .select('id')
        .eq('buyer_id', user.id)
        .eq('shop_id', shop.id)
        .limit(1)
        .maybeSingle();
      if (existing.error) throw existing.error;

      if (!existing.data) {
        const created = await supabase
          .from('conversations')
          .insert({
            buyer_id: user.id,
            shop_id: shop.id,
            shop_name: shop.name,
            last_message: '',
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (created.error) throw created.error;
      }

      navigate('/chat');
    } catch {
      setActionStatus({ tone: 'error', text: 'A conversation could not be opened. Please try again.' });
      setMessagePending(false);
    }
  }

  if (loading) {
    return (
      <main className="shop-page shop-loading" aria-busy="true" aria-label="Loading shop">
        <div className="shop-loading__hero" />
        <div className="shop-container shop-loading__body">
          <div /><div /><div />
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="shop-page shop-state-page">
        <div className="shop-state-card" role="alert">
          <Store aria-hidden="true" />
          <p className="shop-kicker">Something went wrong</p>
          <h1>We couldn’t load this shop</h1>
          <p>{loadError}</p>
          <div><button className="shop-button shop-button--primary" type="button" onClick={() => void loadShop()}><RefreshCw aria-hidden="true" /> Try again</button><Link className="shop-button shop-button--outline" to="/shops"><ArrowLeft aria-hidden="true" /> Back to shops</Link></div>
        </div>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="shop-page shop-state-page">
        <div className="shop-state-card">
          <Store aria-hidden="true" />
          <p className="shop-kicker">Shop not found</p>
          <h1>This storefront isn’t available</h1>
          <p>It may have moved or no longer be listed.</p>
          <Link className="shop-button shop-button--primary" to="/shops"><ArrowLeft aria-hidden="true" /> Explore shops</Link>
        </div>
      </main>
    );
  }

  const membershipYear = getMembershipYear(shop.created_at);

  return (
    <main className="shop-page seasonal-storefront-shell">
      {actionStatus ? <div className={`shop-action-status is-${actionStatus.tone}`} role={actionStatus.tone === 'error' ? 'alert' : 'status'}>{actionStatus.text}</div> : null}
      <ShopHero
        shop={shop}
        productCount={storefront.productCount}
        followerCount={storefront.followerCount}
        artisanCount={storefront.artisanCount}
        membershipYear={membershipYear}
        following={following}
        followPending={followPending}
        messagePending={messagePending}
        onFollow={() => void handleFollow()}
        onMessage={() => void handleMessageShop()}
      />
      <nav className="shop-section-nav" aria-label="Shop sections">
        <div className="shop-container"><a href="#shop-products">Pieces</a><a href="#shop-story">Our story</a><a href="#shop-makers">Artisans</a></div>
      </nav>
      <ShopProductsSection shopId={shop.id} shopName={shop.name} products={storefront.products} productCount={storefront.productCount} prices={storefront.productPrices} ratings={storefront.productRatings} />
      <ShopStorySection shop={shop} membershipYear={membershipYear} />
      <ShopMakersSection artisans={storefront.artisans} artisanCount={storefront.artisanCount} />
      <ShopClosingSection shopName={shop.name} messagePending={messagePending} onMessage={() => void handleMessageShop()} />
    </main>
  );
}

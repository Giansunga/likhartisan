import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';
import { mapSupabaseProduct, fmt } from '../lib/utils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';

interface Shop {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  description: string;
  about: string;
  image: string;
  banner: string;
  location: string;
  created_at: string;
}

interface ShopArtisan {
  id: string;
  name: string;
  specialty: string;
  experience: string;
  description: string;
  cover_image: string;
}

const REGALA_INFO: Record<string, { address: string; phone: string; years: string; about: string }> = {
  'Regala Pottery': {
    address: 'Magsaysay St., Sapa, Sto. Nino, Santo Tomas, Pampanga',
    phone: '+63 907 617 1118',
    years: '100+',
    about: 'Shop is a traditional Filipino pottery shop dedicated to preserving the rich heritage of local craftsmanship. Specializing in terracotta clay pots, vases, and decorative pieces, we have been handcrafting pottery for over a century.\n\nOur artisan team combines traditional techniques with modern aesthetics to create beautiful, functional pieces for your home and garden.',
  },
};

export default function ShopPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopProducts, setShopProducts] = useState<Product[]>([]);
  const [productPrices, setProductPrices] = useState<Record<string, number>>({});
  const [productRatings, setProductRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [shopArtisans, setShopArtisans] = useState<ShopArtisan[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchShop() {
      const { data: shopData } = await supabase
        .from('shops')
        .select('*')
        .eq('id', id)
        .single();

      if (shopData) {
        setShop(shopData);
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('shop_id', id)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (productsData) {
          setShopProducts(productsData.map((p: any) => mapSupabaseProduct(p)));

          // Fetch lowest variation price per product
          const productIds = productsData.map((p: any) => p.id);
          if (productIds.length > 0) {
            const { data: variations } = await supabase
              .from('product_variations')
              .select('product_id, price')
              .in('product_id', productIds);
            if (variations && variations.length > 0) {
              const priceMap: Record<string, number> = {};
              for (const v of variations as any[]) {
                const p = Number(v.price) || 0;
                if (!priceMap[v.product_id] || p < priceMap[v.product_id]) {
                  priceMap[v.product_id] = p;
                }
              }
              setProductPrices(priceMap);
            }

            // Fetch product ratings
            const { data: revData } = await supabase
              .from('product_reviews')
              .select('product_id, rating')
              .in('product_id', productIds);
            if (revData) {
              const ratings: Record<string, { total: number; count: number }> = {};
              for (const r of revData) {
                if (!ratings[r.product_id]) ratings[r.product_id] = { total: 0, count: 0 };
                ratings[r.product_id].total += r.rating;
                ratings[r.product_id].count += 1;
              }
              const avgRatings: Record<string, { avg: number; count: number }> = {};
              for (const [pid, data] of Object.entries(ratings)) {
                avgRatings[pid] = { avg: data.total / data.count, count: data.count };
              }
              setProductRatings(avgRatings);
            }
          }
        }

        // Fetch follower count (fallback to random if table doesn't exist)
        try {
          const { count } = await supabase
            .from('shop_followers')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', id);
          setFollowerCount(count || 0);
        } catch {
          setFollowerCount(847); // Default fallback
        }

        // Fetch artisans for this shop
        const { data: artisanData } = await supabase
          .from('artisans')
          .select('*')
          .eq('shop_id', id)
          .order('created_at', { ascending: false });
        if (artisanData) setShopArtisans(artisanData);
      }
      setLoading(false);
    }
    fetchShop();
  }, [id]);

  useEffect(() => {
    async function checkAuth() {
      if (user?.id) {
        setUserId(user.id);
        if (id) {
          const { count } = await supabase
            .from('shop_followers')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', id)
            .eq('user_id', user.id);
          setFollowing((count || 0) > 0);
        }
      }
    }
    checkAuth();
  }, [id, user]);

  async function handleFollow() {
    if (!userId) { window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } })); return; }
    if (!id) return;
    if (following) {
      await supabase.from('shop_followers').delete().eq('shop_id', id).eq('user_id', userId);
      setFollowing(false);
      setFollowerCount(c => Math.max(0, c - 1));
    } else {
      const { error } = await supabase.from('shop_followers').insert({ shop_id: id, user_id: userId });
      if (!error) {
        setFollowing(true);
        setFollowerCount(c => c + 1);
      }
    }
  }

  async function handleMessageShop() {
    if (!userId) { window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signin' })); return; }
    if (!shop) return;

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('buyer_id', userId)
      .eq('shop_id', shop.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      navigate('/chat');
      return;
    }

    const { data, error } = await supabase
      .from('conversations')
      .insert({ buyer_id: userId, shop_id: shop.id, shop_name: shop.name, last_message: '', last_message_at: new Date().toISOString() })
      .select()
      .single();

    if (!error && data) {
      navigate('/chat');
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', paddingTop: '80px' }}>
        <div style={{ color: 'var(--text-light)' }}>Loading...</div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', paddingTop: '80px' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', color: 'var(--primary-color)', marginBottom: '12px' }}>Shop not found</h2>
          <Link to="/shops" style={{ color: 'var(--accent-color)', fontWeight: 600, textDecoration: 'none' }}>Back to Shops</Link>
        </div>
      </div>
    );
  }

  const info = REGALA_INFO[shop.name] || {
    address: shop.location || 'Santo Tomas, Pampanga',
    phone: shop.email,
    years: 'N/A',
    about: shop.about || shop.description || 'A traditional Filipino pottery shop dedicated to preserving local craftsmanship.',
  };

  return (
    <div style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>

      {/* 1. BANNER + PROFILE SECTION */}
      <div style={{ background: 'var(--primary-color)' }}>
        {/* Banner Image - Full Width */}
        <div style={{ width: '100%', height: '360px', overflow: 'hidden' }}>
          <img
            src={shop.banner || '/images/vases_collection.png'}
            alt={shop.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        
        {/* Profile Card - Overlapping Banner (constrained to container) */}
        <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', position: 'relative' }}>
          <div style={{ 
            position: 'absolute', 
            bottom: '0', 
            left: '0',
            right: '0',
            display: 'flex', 
            alignItems: 'center', 
            gap: '28px',
            padding: '0 24px 28px 0'
          }}>
            {/* Profile Photo */}
            <div style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              border: '5px solid #fff',
              overflow: 'hidden',
              background: '#E8E0D8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              flexShrink: 0,
              marginTop: '60px'
            }}>
              {shop.image ? (
                <img src={shop.image} alt={shop.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="1.5" style={{ width: 48, height: 48 }}>
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M8 5l2-3h4l2 3" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </div>

            {/* Shop Info */}
            <div style={{ color: '#fff', paddingTop: '20px' }}>
              {/* Verified Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Verified Shop</span>
              </div>

              {/* Shop Name */}
              <h1 style={{ margin: '0 0 8px', fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>{shop.name}</h1>
              
              {/* Location */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ width: '14px', height: '14px', opacity: 0.8 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>{info.address}</span>
              </div>

              {/* Description */}
              <p style={{ margin: '0 0 20px', fontSize: '0.92rem', lineHeight: 1.6, opacity: 0.9, maxWidth: '500px' }}>
                {shop.description || 'Timeless pottery pieces inspired by Filipino heritage. Handcrafted with passion, made to last for generations'}
              </p>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button onClick={handleFollow} style={{ 
                  padding: '12px 32px', 
                  borderRadius: '8px', 
                  border: 'none', 
                  background: following ? '#fff' : 'var(--accent-color)', 
                  color: following ? 'var(--accent-color)' : '#fff', 
                  fontWeight: 600, 
                  fontSize: '0.9rem', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg viewBox="0 0 24 24" fill={following ? 'var(--accent-color)' : 'none'} stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {following ? 'Following' : 'Follow'}
                </button>
                <button onClick={handleMessageShop} style={{ 
                  padding: '12px 32px', 
                  borderRadius: '8px', 
                  border: '2px solid #fff', 
                  background: 'transparent', 
                  color: '#fff', 
                  fontWeight: 600, 
                  fontSize: '0.9rem', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Message Shop
                </button>
              </div>
            </div>
          </div>

          {/* Design Yours Button - Right Side */}
          <div style={{ 
            position: 'absolute', 
            bottom: '28px', 
            right: '24px'
          }}>
            <button style={{ 
              padding: '14px 28px', 
              borderRadius: '8px', 
              border: '2px solid #fff', 
              background: 'rgba(255,255,255,0.1)', 
              color: '#fff', 
              fontWeight: 600, 
              fontSize: '0.9rem', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backdropFilter: 'blur(4px)'
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              Design Yours
            </button>
          </div>
        </div>
      </div>

      {/* 3. STATS ROW */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E8E0D8' }}>
        <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: isMobile ? '16px 12px' : '28px 24px', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '20px' }}>
          {/* Products */}
          <div style={{ textAlign: 'center', borderRight: '1px solid #E8E0D8' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{shopProducts.length}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '4px' }}>Products</div>
          </div>
          
          {/* Followers */}
          <div style={{ textAlign: 'center', borderRight: '1px solid #E8E0D8' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{followerCount}+</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '4px' }}>Followers</div>
          </div>
          
          {/* Years in Business */}
          <div style={{ textAlign: 'center', borderRight: '1px solid #E8E0D8' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>{info.years}+</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '4px' }}>Years in Business</div>
          </div>
          
          {/* Handcrafted */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'var(--font-serif)', lineHeight: 1 }}>100%</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-light)', marginTop: '4px' }}>Handcrafted</div>
          </div>
        </div>
      </div>

      {/* 4. ABOUT + SHOP INFORMATION */}
      <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: isMobile ? '24px 12px' : '48px 24px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.8fr 1fr', gap: isMobile ? '24px' : '40px' }}>
        {/* LEFT: About */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '20px' }}>About {shop.name}</h2>
          {info.about.split('\n\n').map((para, i) => (
            <p key={i} style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '14px' }}>{para}</p>
          ))}
        </div>

        {/* RIGHT: Shop Information */}
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8E0D8', padding: '28px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '20px' }}>Shop Information</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FDF5ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>Location</div>
                <div style={{ color: 'var(--text-light)', lineHeight: 1.5 }}>{shop.location || info.address}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FDF5ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>Phone</div>
                <div style={{ color: 'var(--text-light)' }}>{info.phone}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#FDF5ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-dark)', marginBottom: '2px' }}>Email</div>
                <div style={{ color: 'var(--text-light)' }}>{shop.email}</div>
              </div>
            </div>
          </div>

          {shop.location && (
            <div style={{ marginTop: '20px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E8E0D8' }}>
              <iframe
                title="Shop Location"
                width="100%"
                height="200"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(shop.location)}&output=embed`}
              />
            </div>
          )}
        </div>
      </div>

      {/* 5. SHOP PRODUCTS */}
      <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: '0 24px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', margin: 0 }}>Shop Products</h2>
          <Link to="/gallery" style={{ color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
            View All Products
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </Link>
        </div>

        {shopProducts.length === 0 ? (
          <p style={{ color: 'var(--text-light)', textAlign: 'center', padding: '40px' }}>No products yet.</p>
        ) : (
          <div className="product-grid">
            {shopProducts.map(p => (
              <Link key={p.id} to={`/product/${p.id}`} className="product-card-item group">
                <div className="product-img-wrapper">
                  <img src={p.image} alt={p.name} />
                </div>
                <div className="product-details">
                  <div className="product-card-header">
                    <span className="product-tag">{p.category}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <h3 className="product-card-title" style={{ margin: 0 }}>{p.name}</h3>
                    {productRatings[p.id] && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', gap: '1px' }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} width="11" height="11" viewBox="0 0 24 24"
                              fill={star <= Math.round(productRatings[p.id].avg) ? '#F59E0B' : 'none'}
                              stroke={star <= Math.round(productRatings[p.id].avg) ? '#F59E0B' : '#D1D5DB'}
                              strokeWidth="1.5">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          ))}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>({productRatings[p.id].count})</span>
                      </div>
                    )}
                  </div>
                  <div className="product-card-footer">
                    <div className="product-card-price">{fmt(productPrices[p.id] ?? p.price ?? 0)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 6. ARTISANS */}
      <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: '0 24px 48px' }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text-dark)', marginBottom: '24px' }}>Artisans</h2>
        {shopArtisans.length > 0 ? (
          <div style={{ display: 'flex', gap: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
            {shopArtisans.map((artisan) => (
              <div key={artisan.id} style={{ minWidth: '280px', maxWidth: '320px', flex: '1', background: '#fff', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.06)', overflow: 'hidden', border: '1px solid rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: '210px', overflow: 'hidden' }}>
                  <img src={artisan.cover_image || '/images/artisan_1.png'} alt={artisan.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '4px' }}>{artisan.name}</h3>
                  {artisan.specialty && <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '12px' }}>{artisan.specialty}</p>}
                  <div style={{ width: '36px', height: '3px', background: 'var(--primary-color)', marginBottom: '14px' }} />
                  {artisan.description && <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.6, marginBottom: '20px', flex: 1 }}>{artisan.description}</p>}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto', flexWrap: 'wrap' }}>
                    {artisan.experience && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-light)', background: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: '6px' }}>{artisan.experience}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff', borderRadius: '12px', border: '1px solid #E8E0D8' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#D4C8BB" strokeWidth="1.5" style={{ width: '48px', height: '48px', margin: '0 auto 12px' }}>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <p style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>No artisan profiles available for this shop yet.</p>
          </div>
        )}
      </div>

    </div>
  );
}

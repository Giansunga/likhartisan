import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { mapSupabaseProduct, fmt } from '../lib/utils';
import type { Product } from '../types';

interface RecommendationsSectionProps {
  excludeProductIds?: string[];
  preferredCategories?: string[];
  preferredShopIds?: string[];
  title?: string;
  subtitle?: string;
  limit?: number;
}

export default function RecommendationsSection({
  excludeProductIds = [],
  preferredCategories = [],
  preferredShopIds = [],
  title = 'You Might Also Like',
  subtitle,
  limit = 8,
}: RecommendationsSectionProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    fetchRecommendations();
  }, [excludeProductIds.join(','), preferredCategories.join(','), preferredShopIds.join(',')]);

  async function fetchRecommendations() {
    setLoading(true);
    const excludeSet = new Set(excludeProductIds);

    let results: Product[] = [];

    // 1. Try same-category products first
    if (preferredCategories.length > 0) {
      const { data } = await supabase
        .from('products')
        .select('id, name, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, technique, shop_id, shop_name, status, views, created_at, updated_at')
        .in('category', preferredCategories)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit + excludeProductIds.length);

      if (data) {
        results = data
          .map((p: any) => mapSupabaseProduct(p))
          .filter((p: Product) => !excludeSet.has(p.id));
      }
    }

    // 2. Try same-shop products
    if (results.length < limit && preferredShopIds.length > 0) {
      const existingIds = new Set(results.map(p => p.id));
      const { data } = await supabase
        .from('products')
        .select('id, name, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, technique, shop_id, shop_name, status, views, created_at, updated_at')
        .in('shop_id', preferredShopIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(limit + excludeProductIds.length + 10);

      if (data) {
        const more = data
          .map((p: any) => mapSupabaseProduct(p))
          .filter((p: Product) => !excludeSet.has(p.id) && !existingIds.has(p.id));
        results = [...results, ...more];
      }
    }

    // 3. Fill remaining slots with popular products
    if (results.length < limit) {
      const existingIds = new Set(results.map(p => p.id));
      const { data } = await supabase
        .from('products')
        .select('id, name, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, technique, shop_id, shop_name, status, views, created_at, updated_at')
        .eq('status', 'active')
        .order('views', { ascending: false })
        .limit(limit + excludeProductIds.length + 10);

      if (data) {
        const more = data
          .map((p: any) => mapSupabaseProduct(p))
          .filter((p: Product) => !excludeSet.has(p.id) && !existingIds.has(p.id));
        results = [...results, ...more];
      }
    }

    results = results.slice(0, limit);

    // 3. Fetch lowest variation prices
    if (results.length > 0) {
      const ids = results.map(p => p.id);
      const { data: varRows } = await supabase
        .from('product_variations')
        .select('product_id, price')
        .in('product_id', ids);

      if (varRows && varRows.length > 0) {
        const lowest: Record<string, number> = {};
        for (const v of varRows) {
          if (v.price && (!lowest[v.product_id] || v.price < lowest[v.product_id])) {
            lowest[v.product_id] = v.price;
          }
        }
        results.forEach(p => {
          if (lowest[p.id]) p.price = lowest[p.id];
        });
      }
    }

    // 4. Fetch ratings
    if (results.length > 0) {
      const ids = results.map(p => p.id);
      const { data: revRows } = await supabase
        .from('product_reviews')
        .select('product_id, rating')
        .in('product_id', ids);

      if (revRows) {
        const ratings: Record<string, { total: number; count: number }> = {};
        for (const r of revRows) {
          if (!ratings[r.product_id]) ratings[r.product_id] = { total: 0, count: 0 };
          ratings[r.product_id].total += r.rating;
          ratings[r.product_id].count++;
        }
        results.forEach(p => {
          if (ratings[p.id]) {
            p.ratingAvg = ratings[p.id].total / ratings[p.id].count;
            p.ratingCount = ratings[p.id].count;
          }
        });
      }
    }

    setProducts(results);
    setLoading(false);
  }

  function slide(dir: number) {
    const el = trackRef.current;
    if (!el) return;
    const cardWidth = 280 + 30; // card width + gap
    const visible = Math.floor(el.parentElement!.clientWidth / cardWidth);
    const maxOffset = Math.max(0, (products.length - visible) * cardWidth);
    let newOffset = offset - dir * visible * cardWidth;
    newOffset = Math.max(-maxOffset, Math.min(0, newOffset));
    setOffset(newOffset);
  }

  if (loading || products.length === 0) return null;

  return (
    <section style={{ marginTop: '40px', paddingBottom: '48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>
            {title}
          </h2>
          {subtitle && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: '4px 0 0' }}>{subtitle}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => slide(1)}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: '1.5px solid var(--bg-tertiary)',
              background: 'var(--bg-primary)', color: 'var(--text-dark)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-dark)'; e.currentTarget.style.borderColor = 'var(--bg-tertiary)'; }}
          >
            &lt;
          </button>
          <button
            onClick={() => slide(-1)}
            style={{
              width: '36px', height: '36px', borderRadius: '50%', border: '1.5px solid var(--bg-tertiary)',
              background: 'var(--bg-primary)', color: 'var(--text-dark)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-primary)'; e.currentTarget.style.color = 'var(--text-dark)'; e.currentTarget.style.borderColor = 'var(--bg-tertiary)'; }}
          >
            &gt;
          </button>
        </div>
      </div>

      <div style={{ width: '100%', overflow: 'hidden', padding: '10px 0' }}>
        <div
          ref={trackRef}
          style={{
            display: 'flex',
            gap: '30px',
            transition: 'transform 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)',
            transform: `translateX(${offset}px)`,
          }}
        >
          {products.map(p => (
            <Link
              key={p.id}
              to={`/product/${p.id}`}
              className="product-card-item group"
              style={{ minWidth: 280, width: 280, textDecoration: 'none', color: 'inherit' }}
            >
              <div className="product-img-wrapper">
                <img src={p.image} alt={p.name} />
              </div>
              <div className="product-details">
                <div className="product-card-header">
                  <span className="product-tag">{p.category}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <h3 className="product-card-title" style={{ margin: 0 }}>{p.name}</h3>
                  {p.ratingCount > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span style={{ fontSize: '0.7rem', color: '#999' }}>({p.ratingCount})</span>
                    </div>
                  )}
                </div>
                <div className="product-card-artisan-line">
                  <span className="product-card-shop">{p.shopName}</span>
                </div>
                <div className="product-card-footer">
                  <div className="product-card-price">{fmt(p.price)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect, useRef, useId, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mapSupabaseProduct, fmt, storedProductCategories } from '../lib/utils';
import type { Product } from '../types';
import { catalogDisplayPrice, summarizeCatalogVariations } from '../lib/catalogPresentation';

interface RecommendationsSectionProps {
  excludeProductIds?: string[];
  preferredCategories?: string[];
  preferredShopIds?: string[];
  title?: string;
  subtitle?: string;
  limit?: number;
  sameShopOnly?: boolean;
  viewAllHref?: string;
}

const EMPTY_PRODUCTS: Product[] = [];
const PRODUCT_COLUMNS = 'id, name, category, price, stock, image, model3d, materials, dimensions, height, opening_diameter, measurement_unit, technique, shop_id, shop_name, status, views, created_at, updated_at';

export default function RecommendationsSection({
  excludeProductIds = [], preferredCategories = [], preferredShopIds = [],
  title = 'You Might Also Like', subtitle, limit = 8, sameShopOnly = false, viewAllHref,
}: RecommendationsSectionProps) {
  const excludeKey = JSON.stringify(excludeProductIds);
  const categoriesKey = JSON.stringify(preferredCategories);
  const shopsKey = JSON.stringify(preferredShopIds);
  const requestKey = JSON.stringify([excludeKey, categoriesKey, shopsKey, limit, sameShopOnly]);
  const [result, setResult] = useState<{ key: string; products: Product[] } | null>(null);
  const loading = result?.key !== requestKey;
  const products = loading ? EMPTY_PRODUCTS : result.products;
  const scrollRef = useRef<HTMLDivElement>(null);
  const regionId = useId();
  const [scroll, setScroll] = useState({ ratio: 1, offset: 0, before: false, after: false });

  useEffect(() => {
    let active = true;
    async function fetchRecommendations() {
      const excluded: string[] = JSON.parse(excludeKey);
      const categories: string[] = JSON.parse(categoriesKey);
      const shops: string[] = JSON.parse(shopsKey);
      const excludeSet = new Set(excluded);
      let results: Product[] = [];
      const append = (rows: Parameters<typeof mapSupabaseProduct>[0][]) => {
        const existing = new Set(results.map(product => product.id));
        results = [...results, ...rows.map(mapSupabaseProduct).filter(product => !excludeSet.has(product.id) && !existing.has(product.id))];
      };
      try {
        if (sameShopOnly) {
          if (shops.length > 0) {
            const { data, error } = await supabase.from('products').select(PRODUCT_COLUMNS)
              .in('shop_id', shops).eq('status', 'active').order('created_at', { ascending: false })
              .limit(limit + excluded.length);
            if (error) throw error;
            if (data) append(data);
          }
        } else {
          // Preserve the existing category → shop → popular recommendation order.
          if (categories.length > 0) {
            const { data } = await supabase.from('products').select(PRODUCT_COLUMNS)
              .in('category', storedProductCategories(categories)).eq('status', 'active')
              .order('created_at', { ascending: false }).limit(limit + excluded.length);
            if (data) append(data);
          }
          if (results.length < limit && shops.length > 0) {
            const { data } = await supabase.from('products').select(PRODUCT_COLUMNS)
              .in('shop_id', shops).eq('status', 'active').order('created_at', { ascending: false })
              .limit(limit + excluded.length + 10);
            if (data) append(data);
          }
          if (results.length < limit) {
            const { data } = await supabase.from('products').select(PRODUCT_COLUMNS)
              .eq('status', 'active').order('views', { ascending: false }).limit(limit + excluded.length + 10);
            if (data) append(data);
          }
        }
        results = results.slice(0, limit);
        if (results.length > 0) {
          const ids = results.map(product => product.id);
          const [{ data: varRows }, { data: reviewRows }] = await Promise.all([
            supabase.from('product_variations').select('product_id, price, stock').in('product_id', ids),
            supabase.from('product_reviews').select('product_id, rating').in('product_id', ids),
          ]);
          const { prices, availability } = summarizeCatalogVariations(varRows || []);
          const ratings: Record<string, { total: number; count: number }> = {};
          for (const review of reviewRows || []) {
            ratings[review.product_id] ??= { total: 0, count: 0 };
            ratings[review.product_id].total += review.rating;
            ratings[review.product_id].count++;
          }
          results = results.map(product => ({
            ...product,
            catalogPrice: catalogDisplayPrice(product, prices[product.id]),
            inStock: availability[product.id] ?? (product.stock > 0),
            ratingAvg: ratings[product.id] ? ratings[product.id].total / ratings[product.id].count : product.ratingAvg,
            ratingCount: ratings[product.id]?.count ?? product.ratingCount,
          }));
        }
      } catch (error) {
        console.error('Recommendations load error:', error);
        results = [];
      }
      if (active) setResult({ key: requestKey, products: results });
    }
    void fetchRecommendations();
    return () => { active = false; };
  }, [excludeKey, categoriesKey, shopsKey, limit, sameShopOnly, requestKey]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || loading) return;
    const update = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const ratio = viewport.scrollWidth ? Math.min(1, viewport.clientWidth / viewport.scrollWidth) : 1;
      setScroll({ ratio, offset: max > 0 ? (1 - ratio) * Math.max(0, Math.min(1, viewport.scrollLeft / max)) : 0, before: viewport.scrollLeft > 1, after: max - viewport.scrollLeft > 1 });
    };
    viewport.scrollLeft = 0;
    update();
    viewport.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(viewport);
    const track = viewport.firstElementChild;
    if (track) observer?.observe(track);
    window.addEventListener('resize', update);
    return () => {
      viewport.removeEventListener('scroll', update);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [loading, products]);

  function move(direction: number) {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const track = viewport.firstElementChild;
    const gap = track ? parseFloat(getComputedStyle(track).columnGap) || 0 : 0;
    viewport.scrollBy({ left: direction * (viewport.clientWidth + gap), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  if (!loading && products.length === 0) return null;

  return (
    <section className="pdp-rail" aria-labelledby={`${regionId}-title`} aria-busy={loading}>
      <div className="pdp-rail-heading">
        <div><h2 id={`${regionId}-title`} className="pdp-section-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {viewAllHref && <Link to={viewAllHref}>View All Products<ChevronRight aria-hidden="true" /></Link>}
      </div>
      {loading ? <div className="pdp-rail-skeleton" role="status" aria-label={`Loading ${title} products`}><span /><span /><span /><span /></div> : <>
        <div ref={scrollRef} id={regionId} className="pdp-rail-viewport" role="region" aria-label={`${title} products`} tabIndex={0}>
          <div className="pdp-rail-track">
            {products.map(product => <Link key={product.id} to={`/product/${product.id}`} className="pdp-card">
              <div className="pdp-card-image"><img src={product.image} alt="" loading="lazy" />{product.category && <span>{product.category}</span>}</div>
              <div className="pdp-card-info">
                <h3 title={product.name}>{product.name}</h3>
                <p>{product.shopName}</p>
                <div className="pdp-card-price"><strong>{catalogDisplayPrice(product) === null ? 'Price unavailable' : fmt(catalogDisplayPrice(product)!)}</strong>{!product.inStock && <span className="product-card-out-of-stock">Out of stock</span>}</div>
                {product.ratingCount > 0 && <div className="pdp-card-rating" aria-label={`${product.ratingAvg.toFixed(1)} out of 5 stars, ${product.ratingCount} reviews`}><Star aria-hidden="true" />{product.ratingAvg.toFixed(1)}</div>}
              </div>
            </Link>)}
          </div>
        </div>
        {(scroll.before || scroll.after) && <div className="pdp-rail-controls">
          <button type="button" aria-label={`Previous ${title} products`} aria-controls={regionId} disabled={!scroll.before} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button>
          <div className="pdp-rail-progress" aria-hidden="true"><span style={{ '--rail-ratio': scroll.ratio, '--rail-offset': scroll.offset } as CSSProperties} /></div>
          <button type="button" aria-label={`Next ${title} products`} aria-controls={regionId} disabled={!scroll.after} onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button>
        </div>}
      </>}
    </section>
  );
}

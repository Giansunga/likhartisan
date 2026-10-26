import AssetImage from './AssetImage';
import { useState, useEffect, useRef, useId, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { mapSupabaseProduct, fmt } from '../lib/utils';
import type { Product } from '../types';
import { catalogDisplayPrice, summarizeCatalogVariations } from '../lib/catalogPresentation';

interface RecommendationsSectionProps {
  productId: string;
  shopScope: 'same' | 'different';
  title?: string;
  subtitle?: string;
  limit?: number;
  viewAllHref?: string;
}

const EMPTY_PRODUCTS: Product[] = [];
export default function RecommendationsSection({
  productId, shopScope,
  title = 'You Might Also Like', subtitle, limit = 8, viewAllHref,
}: RecommendationsSectionProps) {
  const requestKey = JSON.stringify([productId, shopScope, limit]);
  const [result, setResult] = useState<{ key: string; products: Product[] } | null>(null);
  const loading = result?.key !== requestKey;
  const products = loading ? EMPTY_PRODUCTS : result.products;
  const scrollRef = useRef<HTMLDivElement>(null);
  const regionId = useId();
  const [scroll, setScroll] = useState({ ratio: 1, offset: 0, before: false, after: false });

  useEffect(() => {
    let active = true;
    async function fetchRecommendations() {
      let results: Product[];
      try {
        const { data, error } = await supabase.rpc('get_product_suggestions', {
          p_product_id: productId, p_shop_scope: shopScope, p_limit: limit,
        });
        if (error) throw error;
        results = (data || []).map(mapSupabaseProduct);
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
  }, [productId, shopScope, limit, requestKey]);

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
              <div className="pdp-card-image"><AssetImage src={product.image} alt="" loading="lazy" />{product.category && <span>{product.category}</span>}</div>
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

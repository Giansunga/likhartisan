import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Product } from '../types';
import { loadFavorites, saveFavorites, mapSupabaseProduct } from '../lib/utils';

const categories = [
  { name: 'Vases', bg: '/images/vases_collection.png' },
  { name: 'Planters', bg: '/images/planters_collection.png' },
  { name: 'Jars', bg: '/images/jars_collection.png' },
  { name: 'Amphoras', bg: '/images/amphoras_collection.png' },
  { name: 'Tea Light Vases', bg: '/images/tealights_collection.png' },
];

export default function GalleryPage() {
  const [searchParams] = useSearchParams();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, number>>({});
  const [productRatings, setProductRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [activeCategory, setActiveCategory] = useState<string | null>(() => searchParams.get('category'));
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popularity');
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [designModalOpen, setDesignModalOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  function toggleFavorite(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }

  useEffect(() => {
    async function fetchProducts() {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Gallery fetch error:', error);
        return;
      }

      if (data) {
        const products = data.map((p: any) => mapSupabaseProduct(p));
        setAllProducts(products);

        const productIds = products.map(p => p.id);
        if (productIds.length > 0) {
          const { data: varData } = await supabase
            .from('product_variations')
            .select('product_id, price')
            .in('product_id', productIds)
            .not('price', 'is', null);

          if (varData) {
            const prices: Record<string, number> = {};
            for (const v of varData) {
              const price = Number(v.price);
              if (price > 0 && (!prices[v.product_id] || price < prices[v.product_id])) {
                prices[v.product_id] = price;
              }
            }
            setVariantPrices(prices);
          }

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
    }
    fetchProducts();
  }, []);

  const products = useMemo(() => {
    let list: Product[] = allProducts.filter(p => p.status === 'active');
    if (showFavorites) {
      list = list.filter(p => favorites.includes(p.id));
    }
    if (activeCategory) {
      list = list.filter(p => p.category === activeCategory);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'popularity': list.sort((a, b) => (productRatings[b.id]?.count ?? 0) - (productRatings[a.id]?.count ?? 0)); break;
      case 'price-asc': list.sort((a, b) => (variantPrices[a.id] ?? a.price) - (variantPrices[b.id] ?? b.price)); break;
      case 'price-desc': list.sort((a, b) => (variantPrices[b.id] ?? b.price) - (variantPrices[a.id] ?? a.price)); break;
      case 'name-asc': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [allProducts, activeCategory, search, sort, showFavorites, favorites, variantPrices, productRatings]);

  return (
    <div>
      {/* Banner */}
      <header className="gallery-header-banner">
        <div className="gallery-banner-bg" style={{ backgroundImage: 'url(/images/hero_1.png)' }} />
        <div className="gallery-banner-overlay" />
        <div className="max-w-[var(--container-width)] mx-auto px-6 relative z-[5] w-full">
          <div className="gallery-banner-content">
            <div className="breadcrumbs">
              <Link to="/">Home</Link>
              <span className="separator">/</span>
              <span className="current">Gallery</span>
            </div>
            <h1 className="gallery-title">Explore the beauty and craftsmanship of Santo Tomas pottery through curated collections.</h1>
          </div>
        </div>
      </header>

      {/* Category Zoom Grid */}
      <section className="py-[30px] bg-[var(--bg-primary)] border-b border-cream-secondary">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="category-zoom-grid">
            {categories.map(cat => (
              <div key={cat.name}
                onClick={() => setActiveCategory(activeCategory === cat.name ? null : cat.name)}
                className={`category-zoom-card ${activeCategory === cat.name ? 'active' : ''}`}>
                <div className="zoom-card-bg" style={{ backgroundImage: `url(${cat.bg})` }} />
                <div className="zoom-card-overlay" />
                <div className="zoom-card-content">
                  <span className="zoom-card-name">{cat.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Control Bar */}
      <section className="py-[30px] bg-[var(--bg-primary)]">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="control-bar">
            <div className="control-title-group">
              <h2 className="control-section-title" id="control-active-title">
                {activeCategory || 'All Crafts'}
              </h2>
              <Link to="/freeform" className="btn-design-yours">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Design Yours
              </Link>
            </div>

            <div className="control-action-group">
              <div className="search-bar-wrapper">
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <input type="text" placeholder="Search here..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {loggedIn && (
              <button
                onClick={() => setShowFavorites(!showFavorites)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
                  border: '1.5px solid ' + (showFavorites ? 'var(--primary-color)' : '#E8E0D8'),
                  borderRadius: '10px', background: showFavorites ? 'var(--primary-color)' : '#fff',
                  color: showFavorites ? '#fff' : '#666', fontSize: '0.88rem', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s',
                }}
              >
                <svg viewBox="0 0 24 24" fill={showFavorites ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                Favorites {favorites.length > 0 && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>({favorites.length})</span>}
              </button>
              )}
              <div className="sort-select-wrapper">
                <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort products">
                  <option value="popularity">Popularity</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A-Z</option>
                </select>
                <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <section style={{ paddingTop: '20px', paddingBottom: '140px', background: 'var(--bg-primary)' }}>
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          {products.length === 0 ? (
            <div className="gallery-empty-state">
              <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ width: 64, height: 64 }}>
                <path d="M8 3h8l1 4 3 3v8a3 3 0 01-3 3H7a3 3 0 01-3-3v-8l3-3 1-4z" />
                <path d="M8 7h8M9 21c1.5-2 4.5-2 6 0M9 11c1.5 1 4.5 1 6 0" />
              </svg>
              <h3>No crafts found</h3>
              <p>Try adjusting your search keywords, clearing active filters, or exploring a different category.</p>
              <button className="btn-reset-filters" onClick={() => { setActiveCategory(null); setSearch(''); }}>Clear All Filters</button>
            </div>
          ) : (
            <div className="product-grid">
              {products.map(p => (
                <Link key={p.id} to={`/product/${p.id}`} className="product-card-item group">
                  <div className="product-img-wrapper">
                    <img src={p.image} alt={p.name} />
                    {loggedIn && (
                    <button
                      onClick={(e) => toggleFavorite(e, p.id)}
                      style={{
                        position: 'absolute', top: '10px', right: '10px', zIndex: 5,
                        width: '34px', height: '34px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.9)', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        transition: 'transform 0.15s',
                      }}
                    >
                      <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}
                        fill={favorites.includes(p.id) ? '#E53935' : 'none'}
                        stroke={favorites.includes(p.id) ? '#E53935' : '#666'}
                        strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>
                    )}
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
                    <div className="product-card-artisan-line">
                      <span className="product-card-shop">{p.shopName}</span>
                    </div>
                    <div className="product-card-footer">
                      <div className="product-card-price">₱{(variantPrices[p.id] ?? p.price).toLocaleString()}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Design Yours Modal */}
      <div className={`modal-overlay ${designModalOpen ? 'active' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '580px' }}>
          <button className="modal-close" onClick={() => setDesignModalOpen(false)}>×</button>
          <h3 className="modal-title">Design Your Custom Pottery</h3>
          <p className="text-[0.92rem] text-brown-medium text-center leading-[1.5] -mt-4 mb-6">
            Collaborate directly with Santo Tomas master potters to bring your unique design to life.
          </p>

          <form onSubmit={e => { e.preventDefault(); }}>
            <div className="form-row">
              <div className="form-group">
                <label>Height (cm)</label>
                <input type="number" min="10" max="200" placeholder="e.g. 35" required />
              </div>
              <div className="form-group">
                <label>Diameter (cm)</label>
                <input type="number" min="5" max="150" placeholder="e.g. 20" required />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Clay Type</label>
                <select required>
                  <option value="Terracotta">Terracotta (Red Clay)</option>
                  <option value="Stoneware">Stoneware (Durable Brown)</option>
                  <option value="Porcelain">White Porcelain Clay</option>
                </select>
              </div>
              <div className="form-group">
                <label>Glaze Finish</label>
                <select required>
                  <option value="Unglazed">Unglazed (Matte Earthy)</option>
                  <option value="Matte Glazed">Matte Color Glazed</option>
                  <option value="Glossy Glazed">High-Gloss Glazed</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Choose Artisan Partner</label>
              <select required>
                <option value="Julio">Mang Julio (Traditional Clay Vessels)</option>
                <option value="Maria">Aling Maria (Master Glazer & Organic Colors)</option>
                <option value="Ben">Kuya Ben (Modern Geometric Sculptures)</option>
                <option value="Sarah">Ate Sarah (Cutouts & Tea Light Carvings)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Design Notes & Details</label>
              <textarea rows={3} placeholder="Describe engravings, colors, or shapes you want..." required />
            </div>
            <button type="submit" className="btn-form-submit">SUBMIT CUSTOM ORDER REQUEST</button>
          </form>
        </div>
      </div>
    </div>
  );
}

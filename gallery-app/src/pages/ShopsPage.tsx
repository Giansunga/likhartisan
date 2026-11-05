import './ListingPages.css';
import AssetImage from '../components/AssetImage';
import { useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useGallerySearch } from '../contexts/GallerySearchContext';
import { useShopDirectory } from '../contexts/ShopDirectoryContext';
import { searchShops } from '../lib/shopSearch';

export default function ShopsPage() {
  const directory = useShopDirectory();
  const { ensureLoaded } = directory;
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const { setBinding } = useGallerySearch();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const shops = useMemo(() => searchShops(directory.shops, query), [directory.shops, query]);
  const changeSearch = useCallback((value: string) => {
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      if (value) next.set('q', value);
      else next.delete('q');
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setSearchParams]);

  useLayoutEffect(() => {
    setBinding({ target: '/shops', value: query, onChange: changeSearch });
    return () => setBinding(null);
  }, [query, changeSearch, setBinding]);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  return (
    <div className="listing-page">
      <header className="listing-container listing-page-heading">
        <h1 className="listing-title">Shops</h1>
        <div className="shop-search-results-context">
          {directory.status === 'ready' && <p role="status">{shops.length} {shops.length === 1 ? 'shop' : 'shops'}{query.trim() ? ` for “${query.trim()}”` : ''}</p>}
          {query && <button type="button" className="shop-search-clear" onClick={() => changeSearch('')}>Clear search</button>}
        </div>
      </header>

      <section className="artisan-grid-section">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          {directory.status === 'idle' || directory.status === 'loading' ? (
            <p className="shop-search-state" role="status">Loading shops…</p>
          ) : directory.status === 'error' ? (
            <div className="shop-search-state" role="alert">
              <p>Shops couldn’t load. Please try again.</p>
              <button type="button" className="shop-search-clear" onClick={directory.retry}>Retry</button>
            </div>
          ) : shops.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-brown-medium text-lg">{query.trim() ? 'No shops match your search. Try a different shop name.' : 'No shops registered yet.'}</p>
            </div>
          ) : (
            <div className="artisan-grid">
              {shops.map(s => (
                <div key={s.id} className="artisan-card-grid">
                  <div className="artisan-cover">
                    <AssetImage src={s.banner || '/images/vases_collection.png'} alt={s.name} />
                  </div>
                  <div className="artisan-avatar-container">
                    {s.image ? (
                      <AssetImage src={s.image} alt={s.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <div className="w-full h-full bg-primary text-white flex items-center justify-center text-2xl font-bold rounded-full">
                        {s.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="artisan-details">
                    <h3 className="artisan-name-grid">{s.name}</h3>
                    <p className="artisan-location-grid">{s.location || 'Santo Tomas, Pampanga'}</p>
                    <p className="text-[0.95rem] text-brown-medium leading-[1.5] mb-5">{s.description || 'Artisan pottery shop'}</p>
                    <div className="artisan-actions">
                      <Link to={`/shop/${s.id}`} className="btn-view-shop">View Shop</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Can't Find What You're Looking For? Banner */}
      {!isMobile && (
      <section style={{ padding: '20px 24px 40px' }}>
        <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', borderRadius: '16px', overflow: 'hidden' }}>
          <img
            src="/images/custom-banner.png"
            alt="Can't find what you're looking for? Request a custom pottery piece from shops."
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      </section>
      )}
    </div>
  );
}

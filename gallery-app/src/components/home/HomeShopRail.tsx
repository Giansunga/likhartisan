import { ArrowLeft, ArrowRight, MapPin, Store } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export interface HomeShop {
  id: string;
  name: string;
  description: string;
  banner: string;
  image: string;
  location: string;
}

interface HomeShopRailProps {
  shops: HomeShop[];
  loading: boolean;
  error: boolean;
}

export default function HomeShopRail({ shops, loading, error }: HomeShopRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const max = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setEdges({ start: rail.scrollLeft <= 2, end: rail.scrollLeft >= max - 2 });
  }, []);

  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [shops.length, updateEdges]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * .78, 300), behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <section className="home-section home-shops" aria-labelledby="home-shops-title">
      <div className="home-container">
        <div className="home-section-heading home-section-heading--split">
          <div><span>Makers directory · Volume 01</span><h2 id="home-shops-title">Shops keeping the <em>craft in motion</em></h2></div>
          <div className="home-section-heading__actions">
            <div className="home-rail-controls" aria-label="Shop carousel controls">
              <button type="button" aria-label="Show previous shops" onClick={() => move(-1)} disabled={loading || edges.start}><ArrowLeft aria-hidden="true" /></button>
              <button type="button" aria-label="Show next shops" onClick={() => move(1)} disabled={loading || edges.end}><ArrowRight aria-hidden="true" /></button>
            </div>
            <Link to="/shops" className="home-text-link">All shops <ArrowRight aria-hidden="true" /></Link>
          </div>
        </div>

        {loading ? <div className="home-rail home-rail--skeleton" role="status" aria-label="Loading shops">{[0, 1, 2].map(index => <span key={index} />)}</div>
          : error ? <div className="home-rail-state" role="alert"><Store aria-hidden="true" /><p>Shops could not be loaded right now.</p><Link to="/shops">Browse all shops</Link></div>
          : shops.length === 0 ? <div className="home-rail-state"><Store aria-hidden="true" /><p>Participating shops will appear here soon.</p></div>
          : <div className="home-rail" ref={railRef} onScroll={updateEdges} tabIndex={0} aria-label="Participating pottery shops">
            {shops.map((shop, index) => <article className="home-shop-card" key={shop.id}>
              <div className="home-shop-card__image"><img src={shop.banner || '/images/shops-hero.PNG'} alt="" loading="lazy" onError={event => { event.currentTarget.src = '/images/shops-hero.PNG'; }} /></div>
              <div className="home-shop-card__body">
                <div className="home-shop-card__mark"><span>{shop.name.charAt(0).toUpperCase()}</span>{shop.image && <img src={shop.image} alt="" loading="lazy" onError={event => event.currentTarget.remove()} />}</div>
                <span className="home-shop-card__issue">Shop {String(index + 1).padStart(2, '0')}</span>
                <p className="home-shop-card__location"><MapPin aria-hidden="true" />{shop.location || 'Santo Tomas, Pampanga'}</p>
                <h3>{shop.name}</h3>
                <p>{shop.description || 'Discover handmade pottery and locally made pieces from this participating shop.'}</p>
                <Link to={`/shop/${shop.id}`} className="home-inline-link">Visit shop <ArrowRight aria-hidden="true" /></Link>
              </div>
            </article>)}
          </div>}
      </div>
    </section>
  );
}

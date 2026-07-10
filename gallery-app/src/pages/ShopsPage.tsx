import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Shop {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  description: string;
  banner: string;
  image: string;
  location: string;
}

export default function ShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);

  useEffect(() => {
    async function fetchShops() {
      const { data } = await supabase.from('shops').select('*').order('name');
      if (data) setShops(data);
    }
    fetchShops();
  }, []);

  return (
    <div>
      <header className="gallery-header-banner">
        <div className="gallery-banner-bg" style={{ backgroundImage: 'url(/images/shops-hero.PNG)' }} />
        <div className="gallery-banner-overlay" />
        <div className="max-w-[var(--container-width)] mx-auto px-6 relative z-[5] w-full">
          <div className="gallery-banner-content">
            <div className="breadcrumbs">
              <Link to="/">Home</Link>
              <span className="separator">/</span>
              <span className="current">Shops</span>
            </div>
            <h1 className="gallery-title">Explore Our Shops</h1>
            <p className="text-[1.2rem] text-white/85 mt-4 max-w-[600px] leading-[1.6]">
              Discover the local pottery shops of Santo Tomas and their incredible creations.
            </p>
          </div>
        </div>
      </header>

      <section className="artisan-grid-section">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          {shops.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-brown-medium text-lg">No shops registered yet.</p>
            </div>
          ) : (
            <div className="artisan-grid">
              {shops.map(s => (
                <div key={s.id} className="artisan-card-grid">
                  <div className="artisan-cover">
                    <img src={s.banner || '/images/vases_collection.png'} alt={s.name} />
                  </div>
                  <div className="artisan-avatar-container">
                    {s.image ? (
                      <img src={s.image} alt={s.name} className="w-full h-full object-cover rounded-full" />
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
      <section style={{ padding: '20px 24px 40px' }}>
        <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', borderRadius: '16px', overflow: 'hidden' }}>
          <img
            src="/images/custom-banner.png"
            alt="Can't find what you're looking for? Request a custom pottery piece from shops."
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      </section>
    </div>
  );
}

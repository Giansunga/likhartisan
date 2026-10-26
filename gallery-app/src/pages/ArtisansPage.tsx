import ArtisanCard from '../components/ArtisanCard';
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ArtisanRow {
  id: string;
  shop_id: string | null;
  name: string;
  specialty: string;
  experience: string;
  location: string;
  description: string;
  cover_image: string;
  shop_name: string;
  works: number;
}

export default function ArtisansPage() {
  const [artisans, setArtisans] = useState<ArtisanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArtisans() {
      const { data: artisanData } = await supabase
        .from('artisans')
        .select('*')
        .order('created_at', { ascending: false });

      if (!artisanData || artisanData.length === 0) {
        setArtisans([]);
        setLoading(false);
        return;
      }

      const shopIds = [...new Set(artisanData.map((a: ArtisanRow) => a.shop_id).filter((id): id is string => Boolean(id)))];
      let shopMap = new Map<string, string>();
      const productCounts = new Map<string, number>();

      if (shopIds.length > 0) {
        const { data: shopData } = await supabase.from('shops').select('id, name').in('id', shopIds);
        if (shopData) shopMap = new Map(shopData.map((s: { id: string; name: string }) => [s.id, s.name]));

        const countResults = await Promise.all(
          shopIds.map(sid =>
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('shop_id', sid).eq('status', 'active')
          )
        );
        shopIds.forEach((sid, i) => {
          productCounts.set(sid, countResults[i].count || 0);
        });
      }

      setArtisans(artisanData.map((a: ArtisanRow) => ({
        id: a.id,
        shop_id: a.shop_id,
        name: a.name,
        specialty: a.specialty,
        experience: a.experience,
        location: a.location,
        description: a.description,
        cover_image: a.cover_image,
        shop_name: shopMap.get(a.shop_id || '') || '',
        works: productCounts.get(a.shop_id || '') || 0,
      })));
      setLoading(false);
    }
    fetchArtisans();
  }, []);

  return (
    <div className="seasonal-pattern-page">
      <header className="gallery-header-banner">
        <div className="gallery-banner-bg" style={{ backgroundImage: 'url(/images/artisans-hero.PNG)' }} />
        <div className="gallery-banner-overlay" />
        <div className="max-w-[var(--container-width)] mx-auto px-6 relative z-[5] w-full">
          <div className="gallery-banner-content">
            <div className="breadcrumbs">
              <Link to="/">Home</Link>
              <span className="separator">/</span>
              <span className="current">Artisans</span>
            </div>
            <h1 className="gallery-title system-hero-title system-hero-title--banner">Meet the Artisans of Santo Tomas</h1>
            <p className="text-[1.2rem] text-white/85 mt-4 max-w-[600px] leading-[1.6]">
              Preserving the tradition of pottery making through generations of skill, passion, and dedication to the craft.
            </p>
          </div>
        </div>
      </header>

      <section className="artisan-grid-section">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          {loading ? (
            <div className="text-center py-16 text-brown-medium">Loading artisans...</div>
          ) : artisans.length === 0 ? (
            <div className="text-center py-16">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-20 h-20 mx-auto mb-6 text-brown-light/40">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <p className="text-brown-medium text-lg font-medium">No artisans yet</p>
              <p className="text-brown-light text-sm mt-1">Artisans added by the admin will appear here</p>
            </div>
          ) : (
            <div className="artisan-cards">
              {artisans.map((a) => (
                <ArtisanCard key={a.id} artisan={a} shop={{ id: a.shop_id, name: a.shop_name }} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

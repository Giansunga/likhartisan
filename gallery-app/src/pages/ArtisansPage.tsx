import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface ArtisanRow {
  id: string;
  shop_id: string;
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

      const shopIds = [...new Set(artisanData.map((a: any) => a.shop_id).filter(Boolean))];
      let shopMap = new Map<string, string>();
      let productCounts = new Map<string, number>();

      if (shopIds.length > 0) {
        const { data: shopData } = await supabase.from('shops').select('id, name').in('id', shopIds);
        if (shopData) shopMap = new Map(shopData.map((s: any) => [s.id, s.name]));

        const countResults = await Promise.all(
          shopIds.map(sid =>
            supabase.from('products').select('id', { count: 'exact', head: true }).eq('shop_id', sid).eq('status', 'active')
          )
        );
        shopIds.forEach((sid, i) => {
          productCounts.set(sid, countResults[i].count || 0);
        });
      }

      setArtisans(artisanData.map((a: any) => ({
        id: a.id,
        shop_id: a.shop_id,
        name: a.name,
        specialty: a.specialty,
        experience: a.experience,
        location: a.location,
        description: a.description,
        cover_image: a.cover_image,
        shop_name: shopMap.get(a.shop_id) || '',
        works: productCounts.get(a.shop_id) || 0,
      })));
      setLoading(false);
    }
    fetchArtisans();
  }, []);

  return (
    <div>
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
            <h1 className="gallery-title">Meet the Artisans of Santo Tomas</h1>
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
            <div className="flex flex-wrap gap-[30px] justify-start">
              {artisans.map((a) => (
                <div key={a.id} className="w-[calc(25%-22.5px)] min-w-[280px] bg-white rounded-[15px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] overflow-hidden border border-black/3 flex flex-col group hover:-translate-y-2 hover:shadow-[0_10px_25px_rgba(0,0,0,0.12)] hover:border-primary/10 transition-all cursor-pointer">
                  <div className="h-[210px] overflow-hidden">
                    <img src={a.cover_image || '/images/hero_1.png'} alt={a.name} className="w-full h-full object-cover transition-all duration-[0.6s] group-hover:scale-105" />
                  </div>
                  <div className="p-5 flex flex-col flex-grow">
                    <h4 className="text-[1.25rem] font-bold text-brown-dark mb-1">{a.name}</h4>
                    {a.specialty && <p className="text-[0.95rem] font-semibold text-primary mb-3">{a.specialty}</p>}
                    <div className="w-[36px] h-[3px] bg-primary mb-3.5" />
                    <p className="text-[0.85rem] text-brown-medium leading-[1.6] mb-5 flex-grow">{a.description}</p>
                    <div className="flex gap-3 items-center mt-auto">
                      {a.experience && (
                        <span className="text-[0.75rem] font-semibold text-brown-light bg-cream-secondary px-2.5 py-1 rounded-[6px]">{a.experience}</span>
                      )}
                      {a.location && (
                        <span className="text-[0.75rem] font-semibold text-brown-light bg-cream-secondary px-2.5 py-1 rounded-[6px]">{a.location}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

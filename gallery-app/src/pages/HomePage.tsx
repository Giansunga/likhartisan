import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import FreeformScrollSection from '../components/freeform/FreeformScrollSection';

const VIDEO_PARTS = ['/videos/part1.mp4', '/videos/part2.mp4', '/videos/part3.mp4'];

interface HomeArtisan {
  name: string;
  specialty: string;
  experience: string;
  location: string;
  bio: string;
  cover: string;
  shop_id: string;
}

export default function HomePage() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [counted, setCounted] = useState(false);
  const { user, loading } = useAuth();
  const authChecked = !loading;
  const statsRef = useRef<HTMLDivElement>(null);
  const [artisansOffset, setArtisansOffset] = useState(0);
  const artisanTrackRef = useRef<HTMLDivElement>(null);
  const [artisansData, setArtisansData] = useState<HomeArtisan[]>([]);
  const [reviewsData, setReviewsData] = useState<{ id: string; userName: string; rating: number; body: string; productName: string; createdAt: string }[]>([]);

  // Sequential video player state
  const [activeIdx, setActiveIdx] = useState(0);
  const vidRef = useRef<HTMLVideoElement>(null);

  const handleEnded = useCallback(() => {
    setActiveIdx(prev => (prev + 1) % VIDEO_PARTS.length);
  }, []);

  useEffect(() => {
    const vid = vidRef.current;
    if (!vid) return;
    vid.src = VIDEO_PARTS[activeIdx];
    vid.load();
    vid.play().catch(() => {});
  }, [activeIdx]);

  useEffect(() => {
    async function fetchArtisans() {
      const { data } = await supabase.from('artisans').select('*').order('created_at', { ascending: false });
      if (data) {
        setArtisansData(data.map((a: any) => ({
          name: a.name,
          specialty: a.specialty || '',
          experience: a.experience || '',
          location: a.location || '',
          bio: a.description || '',
          cover: a.cover_image || '/images/artisan_1.png',
          shop_id: a.shop_id || '',
        })));
      }
    }
    fetchArtisans();

    async function fetchReviews() {
      const { data: reviews } = await supabase
        .from('product_reviews')
        .select('id, user_name, rating, body, created_at, product_id')
        .order('created_at', { ascending: false })
        .limit(20);
      if (!reviews || reviews.length === 0) {
        setReviewsData([
          { id: '1', userName: 'Maria Santos', rating: 5, body: 'Beautiful handcrafted vase! The quality is outstanding and the artisan really put their heart into this piece. I am very happy with my purchase.', productName: 'Malaking Vase', createdAt: '' },
          { id: '2', userName: 'Juan Dela Cruz', rating: 5, body: 'Amazing pottery shop! The products are authentic and the craftsmanship is top-notch. Delivery was also fast and the item arrived safely.', productName: 'Clay Planter', createdAt: '' },
          { id: '3', userName: 'Ana Reyes', rating: 4, body: 'I love supporting local artisans. This shop offers wonderful pieces that showcase the rich culture of Santo Tomas. Highly recommended!', productName: 'Tea Light Holder', createdAt: '' },
          { id: '4', userName: 'Carlos Garcia', rating: 5, body: 'Excellent quality and beautiful design. The artisan was very responsive and helpful. Will definitely order again!', productName: 'Ceramic Jar', createdAt: '' },
          { id: '5', userName: 'Elena Mendoza', rating: 5, body: 'Such a unique and meaningful gift. My family loved it! The attention to detail is remarkable. Thank you LikhArtisan for this platform.', productName: 'Decorative Plate', createdAt: '' },
        ]);
        return;
      }
      const productIds = [...new Set(reviews.map((r: any) => r.product_id))];
      const { data: products } = await supabase.from('products').select('id, name').in('id', productIds);
      const productMap: Record<string, string> = {};
      if (products) products.forEach((p: any) => { productMap[p.id] = p.name; });
      setReviewsData(reviews.map((r: any) => ({
        id: r.id,
        userName: r.user_name || 'Anonymous',
        rating: r.rating,
        body: r.body || '',
        productName: productMap[r.product_id] || 'Product',
        createdAt: r.created_at,
      })));
    }
    fetchReviews();
  }, []);

  useEffect(() => {
    const el = statsRef.current;
    if (!el || counted) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !counted) {
        setCounted(true);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [counted]);

  const [statsVisible, setStatsVisible] = useState(false);
  useEffect(() => {
    if (counted) setStatsVisible(true);
  }, [counted]);

  const slideArtisan = (dir: number) => {
    const track = artisanTrackRef.current;
    if (!track) return;
    const card = track.querySelector('.artisan-card') as HTMLElement;
    if (!card) return;
    const w = card.offsetWidth + 30;
    const maxScroll = -(track.scrollWidth - track.parentElement!.offsetWidth);
    let offset = artisansOffset - dir * w;
    if (offset > 0) offset = 0;
    if (offset < maxScroll) offset = maxScroll;
    setArtisansOffset(offset);
  };

  return (
    <div>
      {/* ── HERO VIDEO ── */}
      <header className="hero-video-section">
        <video
          ref={vidRef}
          className="hero-video"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={handleEnded}
        >
          <source src={VIDEO_PARTS[0]} type="video/mp4" />
        </video>
        <div className="hero-video-overlay"></div>
        <div className="hero-video-content">
          <h1 className="hero-video-title hero-fade-up" style={{ animationDelay: '0.3s' }}>
            Explore the Local Pottery<br />Industry in Santo Tomas
          </h1>
          <Link to="/gallery" className="hero-video-btn hero-fade-up" style={{ animationDelay: '0.6s' }}>
            Explore
          </Link>
        </div>
      </header>

      {/* ── HISTORY SECTION ── */}
      <section className="py-[100px] bg-[var(--bg-primary)]">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-20 items-center">
            <div className="flex flex-col gap-6">
              <h2 className="section-title">A Tradition Shaped<br /><span>Through Generations</span></h2>
              <p className="text-[1.125rem] text-brown-dark leading-[1.6]">
                Santo Tomas, Pampanga is known as the <span className="font-bold text-primary">Pottery Capital of the Philippines</span>. For centuries, local artisans have turned simple clay into remarkable works of art – preserving techniques passed down through generations and shaping a legacy of craftsmanship that continues to thrive today.
              </p>
              <div className="grid grid-cols-2 gap-6 mt-4">
                <div className="flex flex-col gap-3">
                  <div className="w-[70px] h-[70px] rounded-full bg-cream-tertiary flex items-center justify-center text-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
                      <path d="M12 8V12L15 15" strokeLinecap="round" /><circle cx="12" cy="12" r="9" />
                    </svg>
                  </div>
                  <h4 className="text-[1.25rem] font-bold text-brown-dark">Rich History</h4>
                  <p className="text-[0.95rem] text-brown-medium leading-[1.5]">Rooted in pre-colonial traditions and refined through generations.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="w-[70px] h-[70px] rounded-full bg-cream-tertiary flex items-center justify-center text-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
                      <path d="M4.5 16.5C4.5 16.5 6 12 12 12C18 12 19.5 16.5 19.5 16.5" strokeLinecap="round" />
                      <path d="M12 12V3" strokeLinecap="round" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <h4 className="text-[1.25rem] font-bold text-brown-dark">Cultural Significance</h4>
                  <p className="text-[0.95rem] text-brown-medium leading-[1.5]">Pottery reflects the identity, creativity, and heritage of the Kapampangans.</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 grid-rows-12 h-[640px] gap-0 relative">
              <div className="col-span-6 row-span-12 rounded-[10px] overflow-hidden shadow-[var(--shadow-md)] transition-all duration-[0.6s] hover:-translate-y-2 hover:scale-[1.02] hover:shadow-[var(--shadow-lg)] hover:z-10">
                <img src="/images/hero_1.png" alt="" className="w-full h-full object-cover transition-all duration-[0.6s] hover:scale-105" style={{ transform: 'scaleX(-1)' }} />
              </div>
              <div className="col-span-6 row-span-6 ml-5 mb-2.5 rounded-[10px] overflow-hidden shadow-[var(--shadow-md)] transition-all duration-[0.6s] hover:-translate-y-2 hover:scale-[1.02] hover:shadow-[var(--shadow-lg)] hover:z-10">
                <img src="/images/artisan_1.png" alt="" className="w-full h-full object-cover transition-all duration-[0.6s] hover:scale-105" />
              </div>
              <div className="col-span-6 row-span-6 col-start-7 row-start-7 ml-5 mt-2.5 rounded-[10px] overflow-hidden shadow-[var(--shadow-md)] transition-all duration-[0.6s] hover:-translate-y-2 hover:scale-[1.02] hover:shadow-[var(--shadow-lg)] hover:z-10">
                <img src="/images/history_bottom_right.png" alt="" className="w-full h-full object-cover transition-all duration-[0.6s] hover:scale-105" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS SECTION ── */}
      <section className="py-15 bg-cream-secondary" ref={statsRef} id="stats-banner">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="grid grid-cols-[1.1fr_1fr] gap-15 items-center max-md:grid-cols-1 max-md:text-center max-md:gap-10">
            <p className="font-serif text-[1.85rem] leading-[1.35] text-brown-dark">
              More than just pottery, it&rsquo;s a destination of <span className="text-primary font-semibold">culture</span>, <span className="text-primary font-semibold">creativity</span>, and <span className="text-primary font-semibold">community</span>.
            </p>
            <div className="flex justify-between gap-6 max-md:flex-wrap max-md:justify-center">
              {[
                { target: 50, label: 'LOCAL ARTISANS', suffix: '+' },
                { target: 200, label: 'YEARS OF TRADITION', suffix: '+' },
                { target: 10000, label: 'POTTERY CREATIONS', suffix: '+' },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-3 flex-1 min-w-[120px]">
                  <div className="w-[100px] h-[100px] rounded-full bg-cream-tertiary flex items-center justify-center font-serif text-3xl font-bold text-primary shadow-[var(--shadow-sm)] transition-all hover:scale-108 hover:bg-primary hover:text-white hover:shadow-[var(--shadow-md)]">
                    {statsVisible ? <CountUp target={s.target} suffix={s.suffix} /> : '0'}
                  </div>
                  <span className="text-[0.85rem] font-bold tracking-[0.05em] text-brown-dark">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED COLLECTIONS ── */}
      <section className="py-12 bg-[var(--bg-primary)]">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="section-title">Explore <span>Featured Collections</span></h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { name: 'Vases', img: '/images/vases_collection.png', desc: 'Beautifully handcrafted pottery pieces designed to showcase timeless elegance, traditional craftsmanship, and the artistic heritage of Santo Tomas\'s local artisans.', link: '/gallery?category=Vases' },
              { name: 'Amphoras', img: '/images/amphoras_collection.png', desc: 'Classic handcrafted pottery pieces inspired by traditional forms, reflecting cultural significance, detailed craftsmanship, and enduring artistic tradition.', link: '/gallery?category=Amphoras' },
              { name: 'Tea Light Vases', img: '/images/tealights_collection.png', desc: 'Carefully crafted pottery pieces designed to create a warm and inviting ambiance while showcasing the beauty of traditional artisan craftsmanship.', link: '/gallery?category=Tea%20Light%20Vases' },
            ].map((c, i) => (
              <div key={i} className="bg-white rounded-[10px] overflow-hidden shadow-[var(--shadow-sm)] border border-black/3 flex flex-col group hover:-translate-y-2.5 hover:shadow-[var(--shadow-lg)] hover:border-primary/15 transition-all duration-[0.3s]">
                <div className="h-[320px] overflow-hidden">
                  <img src={c.img} alt={c.name} className="w-full h-full object-cover transition-all duration-[0.6s] group-hover:scale-105" />
                </div>
                <div className="p-[30px_24px] flex flex-col items-center text-center flex-grow">
                  <h3 className="font-serif text-[1.75rem] font-semibold text-primary mb-3">{c.name}</h3>
                  <p className="text-[0.95rem] text-brown-medium leading-[1.6] mb-6 flex-grow">{c.desc}</p>
                  <Link to={c.link}
                    className="bg-primary text-white font-semibold text-[0.95rem] tracking-[0.05em] py-3 px-9 rounded-[10px] shadow-[var(--shadow-sm)] max-w-[180px] w-full group-hover:bg-accent group-hover:shadow-[0_4px_12px_rgba(193,87,13,0.3)] transition-all">
                    EXPLORE
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FREEFORM POTTERY DESIGNER ── */}
      <FreeformScrollSection isMobile={isMobile} />

      {/* ── THOMASIAN ARTISANS CAROUSEL ── */}
      <section className="py-16 bg-[var(--bg-primary)] overflow-hidden">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="flex justify-between items-end mb-8 max-md:flex-col max-md:items-center max-md:gap-5 max-md:text-center">
            <h2 className="section-title mb-0">Thomasian <span>Artisans</span></h2>
            <div className="flex gap-4">
              <button onClick={() => slideArtisan(1)} className="w-12 h-12 rounded-full bg-cream-secondary text-primary flex items-center justify-center shadow-[var(--shadow-sm)] hover:bg-primary hover:text-white hover:scale-105 transition-all">
                <svg fill="none" viewBox="0 0 24 24" className="w-5 h-5 stroke-current stroke-[2.5px]"><path d="M15 19L8 12L15 5" /></svg>
              </button>
              <button onClick={() => slideArtisan(-1)} className="w-12 h-12 rounded-full bg-cream-secondary text-primary flex items-center justify-center shadow-[var(--shadow-sm)] hover:bg-primary hover:text-white hover:scale-105 transition-all">
                <svg fill="none" viewBox="0 0 24 24" className="w-5 h-5 stroke-current stroke-[2.5px]"><path d="M9 5L16 12L9 19" /></svg>
              </button>
            </div>
          </div>

          <div className="w-full overflow-hidden px-[5px] py-[15px]">
            <div ref={artisanTrackRef} className="flex gap-[30px] transition-transform duration-[0.6s] ease-[cubic-bezier(0.25,1,0.5,1)]"
              style={{ transform: `translateX(${artisansOffset}px)` }}>
              {artisansData.map((a, i) => (
                <div key={i} className="artisan-card min-w-[280px] w-[calc(25%-22.5px)] bg-white rounded-[15px] shadow-[0_4px_15px_rgba(0,0,0,0.06)] overflow-hidden border border-black/3 shrink-0 flex flex-col group hover:-translate-y-2 hover:shadow-[0_10px_25px_rgba(0,0,0,0.12)] hover:border-primary/10 transition-all cursor-pointer">
                  <div className="h-[210px] overflow-hidden">
                    <img src={a.cover} alt={a.name} className="w-full h-full object-cover transition-all duration-[0.6s] group-hover:scale-105" />
                  </div>
                  <div className="p-5 flex flex-col flex-grow">
                    <h4 className="text-[1.25rem] font-bold text-brown-dark mb-1">{a.name}</h4>
                    {a.specialty && <p className="text-[0.95rem] font-semibold text-primary mb-3">{a.specialty}</p>}
                    <div className="w-[36px] h-[3px] bg-primary mb-3.5" />
                    <p className="text-[0.85rem] text-brown-medium leading-[1.6] mb-5 flex-grow">{a.bio}</p>
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
          </div>

          <div className="flex justify-center mt-10">
            <Link to="/artisans"
              className="flex items-center gap-3 bg-primary text-white text-base font-semibold tracking-[0.05em] py-3 px-9 rounded-[10px] shadow-[var(--shadow-sm)] hover:bg-accent hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] transition-all">
              VIEW ALL ARTISANS
              <svg viewBox="0 0 17 10" fill="none" stroke="currentColor" className="w-[18px] h-3 group-hover:translate-x-1 transition-all">
                <path d="M0 5H15M15 5L10 0M15 5L10 10" strokeLinecap="round" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── EXPERIENCE SECTION ── */}
      <section className="py-12 bg-[var(--bg-primary)]">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="section-title">Experience <span>The Pottery Capital of the Philippines</span></h2>
          </div>
          <div className="flex flex-col gap-[30px]">
            {[
              { title: 'Learn About Local Pottery', img: '/images/learn_about_local_pottery.jpg', link: '/about' },
              { title: 'Connect with Local Artisans', img: '/images/connect_with_local_artisans.jpg', link: '/artisans' },
              { title: 'Explore Local Pottery Shops', img: '/images/explore_local_pottery.jpg', link: '/shops' },
            ].map((e, i) => (
              <Link key={i} to={e.link}
                className="relative h-[275px] rounded-[15px] overflow-hidden shadow-[var(--shadow-md)] group hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] transition-all duration-[0.6s]">
                <div className="absolute inset-0 bg-gradient-to-br from-black/10 to-black/70 z-[2] transition-all group-hover:from-black/[0.05] group-hover:to-black/85" />
                <img src={e.img} alt="" className="w-full h-full object-cover transition-all duration-[0.6s] group-hover:scale-105" />
                <div className={`absolute z-[5] text-white flex items-center ${isMobile ? 'bottom-5 left-5 right-5 gap-3' : 'bottom-[30px] right-10 gap-5'}`}>
                  <h3 className={`${isMobile ? 'text-xl' : 'text-3xl'} font-semibold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]`}>{e.title}</h3>
                  <div className={`${isMobile ? 'w-9 h-9' : 'w-12 h-12'} rounded-full flex items-center justify-center text-white transition-all group-hover:scale-110 flex-shrink-0`}>
                    <svg viewBox="0 0 51 38" fill="none" className="w-8 h-6 stroke-current stroke-[4px] transition-all group-hover:translate-x-1.5">
                      <path d="M0 19H45M45 19L30 4M45 19L30 34" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── REVIEWS SECTION ── */}
      {reviewsData.length > 0 && (
        <section style={{ padding: '60px 0 50px', background: 'var(--bg-primary)' }}>
          <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: '0 24px' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.2rem', fontWeight: 700, color: '#333', textAlign: 'center', marginBottom: '40px' }}>
              What Our <span style={{ color: 'var(--accent-color)' }}>Customers</span> Say
            </h2>
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  overflowX: 'auto',
                  scrollBehavior: 'smooth',
                  paddingBottom: '12px',
                  paddingTop: '6px',
                  msOverflowStyle: 'none',
                  scrollbarWidth: 'none',
                  WebkitMaskImage: 'linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)',
                  maskImage: 'linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent)',
                } as any}
              >
                <div className="animate-review-marquee">
                  {[...reviewsData, ...reviewsData, ...reviewsData].map((rev, i) => (
                    <div key={`${rev.id}-${i}`} style={{ minWidth: '300px', maxWidth: '340px', flex: '0 0 auto', background: '#fff', border: '1px solid #E8E0D8', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'transform 0.25s ease, box-shadow 0.25s ease' }} className="hover:-translate-y-1 hover:shadow-md">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#E8E0D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-color)' }}>{rev.userName.charAt(0).toUpperCase()}</span>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#333', fontFamily: 'var(--font-sans)' }}>{rev.userName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--accent-color)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>{rev.productName}</span>
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} width="14" height="14" viewBox="0 0 24 24" fill={star <= rev.rating ? '#F59E0B' : 'none'} stroke={star <= rev.rating ? '#F59E0B' : '#D1D5DB'} strokeWidth="1.5">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <span style={{ position: 'absolute', top: '-4px', left: '-2px', fontSize: '1.8rem', color: 'var(--accent-color)', fontFamily: 'Georgia, serif', lineHeight: 1, opacity: 0.3 }}>"</span>
                        <p style={{ fontSize: '0.85rem', color: '#666', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-sans)', paddingTop: '12px' }}>{rev.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── SUPPORT LOCAL BANNER ── */}
      <section style={{ padding: '0 0 60px', background: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: 'var(--container-width)', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', aspectRatio: isMobile ? '1 / 1' : undefined, borderRadius: '16px', overflow: 'hidden', background: '#FAF5EF', minHeight: isMobile ? undefined : '220px' }}>
            <div style={{ flex: isMobile ? '0 0 50%' : '0 0 40%', position: 'relative', overflow: 'hidden' }}>
              <img src="/images/pottery-collage.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, padding: isMobile ? '20px' : '40px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: isMobile ? '1.3rem' : '1.8rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
                <span style={{ color: 'var(--accent-color)' }}>Support Local.</span>{' '}
                <span style={{ color: '#333' }}>Preserve Tradition</span>
              </h2>
              <p style={{ fontSize: isMobile ? '0.85rem' : '0.95rem', color: '#666', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-sans)', maxWidth: isMobile ? '34ch' : undefined }}>
                Every purchase helps our local artisans continue their craft and pass it to the future generation.
              </p>
              <Link to="/shops" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: isMobile ? '-12px' : '8px', padding: isMobile ? '8px 20px' : '10px 28px', background: 'var(--primary-color)', color: '#fff', borderRadius: '8px', fontSize: isMobile ? '0.82rem' : '0.9rem', fontWeight: 600, fontFamily: 'var(--font-sans)', textDecoration: 'none', alignSelf: isMobile ? 'center' : 'flex-start', transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                  <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
                </svg>
                Shop Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA SECTION (hidden for logged-in users) ── */}
      {authChecked && !user && (
        <section className="relative py-[120px] max-md:py-16 bg-black text-center overflow-hidden">
          <div className="absolute inset-0 bg-cover bg-center blur-[2px] brightness-[0.4] scale-105"
            style={{ backgroundImage: 'url(/images/vases_collection.png)' }} />
          <div className="relative z-[5] max-w-[900px] mx-auto px-6 text-cream-secondary flex flex-col items-center gap-5">
            <h2 className="font-serif text-[3rem] font-medium text-cream-secondary max-md:text-[2.15rem]">Ready to Explore Santo Tomas?</h2>
            <p className="text-[1.25rem] leading-[1.6] opacity-90 max-md:text-[1.1rem]">Discover local artisans, browse handcrafted pottery collections, and experience the town's rich pottery heritage through LikhArtisan.</p>
            <p className="text-[0.9rem] font-light opacity-80 mb-4">Create your free account and start exploring today.</p>
            <button onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signup' } }))}
              className="bg-cream-secondary text-primary text-[1.1rem] font-semibold tracking-[0.05em] py-3.5 px-11 rounded-[10px] shadow-[0_4px_15px_rgba(0,0,0,0.3)] hover:bg-white hover:text-accent hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] transition-all">
              CREATE ACCOUNT
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function CountUp({ target, suffix }: { target: number; suffix: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const duration = 2000;
    const increment = target > 1000 ? Math.ceil(target / (duration / 15)) : 1;
    const stepTime = Math.max(Math.floor(duration / target), 15);
    const timer = setInterval(() => {
      setVal(prev => {
        const next = prev + increment;
        if (next >= target) { clearInterval(timer); return target; }
        return next;
      });
    }, stepTime);
    return () => clearInterval(timer);
  }, [target]);

  if (target === 10000) return <>{val.toLocaleString()}{suffix}</>;
  return <>{val}{suffix}</>;
}

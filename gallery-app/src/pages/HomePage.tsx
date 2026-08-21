import { ArrowRight, BookOpen, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HomeReviewRail, { type HomeReview } from '../components/home/HomeReviewRail';
import HomeShopRail, { type HomeShop } from '../components/home/HomeShopRail';
import FreeformScrollSection from '../components/freeform/FreeformScrollSection';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './HomePage.css';

const HERO_VIDEO = '/videos/LikhArtisan.mp4';

interface CollectionFeature {
  name: string;
  image: string;
  description: string;
}

interface EditorialChapter {
  number: string;
  kicker: string;
  title: string;
  excerpt: string;
  href: string;
}

const COLLECTIONS: CollectionFeature[] = [
  { name: 'Vases', image: '/images/gallery-category-vases-v2.webp', description: 'Sculptural forms for everyday spaces.' },
  { name: 'Planters', image: '/images/gallery-category-planters-v2.webp', description: 'Made to let growing things thrive.' },
  { name: 'Jars', image: '/images/gallery-category-jars-v2.webp', description: 'Useful vessels with a handmade soul.' },
  { name: 'Amphoras', image: '/images/amphoras_collection.png', description: 'Classic silhouettes shaped by tradition.' },
  { name: 'Tea Light Vases', image: '/images/tealights_collection.png', description: 'Small pieces that hold a warm glow.' },
];

const EDITORIAL_CHAPTERS: EditorialChapter[] = [
  {
    number: '01',
    kicker: 'Origins',
    title: 'Why LikhArtisan exists',
    excerpt: 'A local craft deserves a clearer, more useful path online.',
    href: '/about#origin',
  },
  {
    number: '02',
    kicker: 'Heritage',
    title: 'A working local tradition',
    excerpt: 'Meet the practice and place behind Santo Tomas pottery.',
    href: '/about#heritage',
  },
  {
    number: '03',
    kicker: 'The digital bridge',
    title: 'From discovery to a maker',
    excerpt: 'See how the gallery, 3D tools, and shops connect.',
    href: '/about#platform',
  },
];

const SAMPLE_REVIEWS: HomeReview[] = [
  { id: 'sample-1', userName: 'Maria Santos', rating: 5, body: 'Beautiful handcrafted vase! The quality is outstanding and the artisan really put their heart into this piece. I am very happy with my purchase.', productName: 'Malaking Vase', createdAt: '' },
  { id: 'sample-2', userName: 'Juan Dela Cruz', rating: 5, body: 'Amazing pottery shop! The products are authentic and the craftsmanship is top-notch. Delivery was also fast and the item arrived safely.', productName: 'Clay Planter', createdAt: '' },
  { id: 'sample-3', userName: 'Ana Reyes', rating: 4, body: 'I love supporting local artisans. This shop offers wonderful pieces that showcase the rich culture of Santo Tomas. Highly recommended!', productName: 'Tea Light Holder', createdAt: '' },
  { id: 'sample-4', userName: 'Carlos Garcia', rating: 5, body: 'Excellent quality and beautiful design. The artisan was very responsive and helpful. Will definitely order again!', productName: 'Ceramic Jar', createdAt: '' },
];

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [shops, setShops] = useState<HomeShop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState(false);
  const [reviews, setReviews] = useState<HomeReview[]>([]);

  useEffect(() => {
    let active = true;
    async function loadLandingData() {
      const shopRequest = supabase.from('shops').select('id, name, description, banner, image, location').order('name');
      const reviewRequest = supabase.from('product_reviews').select('id, user_name, rating, body, created_at, product_id').order('created_at', { ascending: false }).limit(20);
      const [shopResult, reviewResult] = await Promise.all([shopRequest, reviewRequest]);
      if (!active) return;
      if (shopResult.error) setShopsError(true);
      else setShops((shopResult.data ?? []).map((shop: HomeShop) => ({ id: shop.id, name: shop.name, description: shop.description || '', banner: shop.banner || '', image: shop.image || '', location: shop.location || '' })));
      setShopsLoading(false);
      if (reviewResult.error || !reviewResult.data?.length) { setReviews(SAMPLE_REVIEWS); return; }
      const productIds = [...new Set(reviewResult.data.map((review: { product_id: string }) => review.product_id).filter(Boolean))];
      const productResult = productIds.length ? await supabase.from('products').select('id, name').in('id', productIds) : { data: [] };
      if (!active) return;
      const productNames = new Map((productResult.data ?? []).map((product: { id: string; name: string }) => [product.id, product.name]));
      setReviews(reviewResult.data.map((review: { id: string; user_name: string | null; rating: number; body: string | null; created_at: string; product_id: string }) => ({ id: review.id, userName: review.user_name || 'Anonymous', rating: review.rating, body: review.body || '', productName: productNames.get(review.product_id) || 'Pottery piece', createdAt: review.created_at })));
    }
    void loadLandingData();
    return () => { active = false; };
  }, []);

  return <div className="home-page">
    {/* Hero video: intentionally unchanged. */}
    <header className="hero-video-section"><video className="hero-video" autoPlay muted loop playsInline preload="auto"><source src={HERO_VIDEO} type="video/mp4" /></video><div className="hero-video-overlay"></div><div className="hero-video-content"><h1 className="hero-video-title system-hero-title system-hero-title--display hero-fade-up" style={{ animationDelay: '0.3s' }}>Explore the Local Pottery<br />Industry in Santo Tomas</h1><Link to="/gallery" className="hero-video-btn hero-fade-up" style={{ animationDelay: '0.6s' }}>Explore</Link></div></header>

    <section className="home-section home-editorial-intro" aria-labelledby="home-editorial-title">
      <div className="home-container">
        <div className="home-folio"><span>Field Notes · Issue 01</span><span>Santo Tomas, Pampanga</span></div>
        <div className="home-editorial-intro__grid">
          <div className="home-editorial-intro__copy">
            <span className="home-kicker">The pottery capital of the Philippines</span>
            <h2 id="home-editorial-title">Where earth becomes <em>inheritance.</em></h2>
            <p className="home-editorial-intro__lede">In Santo Tomas, pottery is not simply an object. It is a working tradition—formed through repetition, patience, and knowledge passed from one pair of hands to another.</p>
            <blockquote>“Technology is the bridge—not the author of the craft.”</blockquote>
            <Link to="/about#origin" className="home-text-link">Read the full story <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="home-editorial-intro__photos">
            <figure className="home-editorial-photo home-editorial-photo--lead"><img src="/images/hero_1.jpg" alt="Rows of finished clay pots in a Santo Tomas workshop" loading="lazy" /><figcaption>Finished and drying forms gathered inside a local pottery workshop.</figcaption></figure>
            <figure className="home-editorial-photo home-editorial-photo--detail"><img src="/images/history_bottom_right.jpg" alt="A potter shaping a large clay vessel" loading="lazy" /><figcaption>Every surface begins with practiced hands.</figcaption></figure>
          </div>
        </div>
        <dl className="home-editorial-details">
          <div><dt>Place</dt><dd><strong>Rooted in Santo Tomas</strong><span>Pampanga, Philippines</span></dd></div>
          <div><dt>Practice</dt><dd><strong>Formed through skilled hands</strong><span>Shaped, finished, and shared locally</span></dd></div>
          <div><dt>Purpose</dt><dd><strong>Made easier to discover</strong><span>Stories, shops, objects, and custom ideas</span></dd></div>
        </dl>
      </div>
    </section>

    <section className="home-section home-chapters" aria-labelledby="home-chapters-title"><div className="home-container"><div className="home-section-heading home-section-heading--split"><div><span>Inside the story</span><h2 id="home-chapters-title">Continue reading in <em>About</em></h2></div><p>Three short chapters connect the place, its practice, and the digital tools built around it.</p></div><ol className="home-chapter-grid">{EDITORIAL_CHAPTERS.map(chapter => <li key={chapter.number}><Link to={chapter.href}><span className="home-chapter__number">{chapter.number}</span><small>{chapter.kicker}</small><h3>{chapter.title}</h3><p>{chapter.excerpt}</p><i>Read chapter <ArrowRight aria-hidden="true" /></i></Link></li>)}</ol></div></section>

    <section className="home-section home-collections" aria-labelledby="home-collections-title"><div className="home-container"><div className="home-section-heading home-section-heading--split"><div><span>Objects · Volume 01</span><h2 id="home-collections-title">Pottery for <em>everyday rituals</em></h2></div><p>From sculptural vessels to small moments of light, find a piece that feels at home with you.</p></div><div className="home-collection-grid">{COLLECTIONS.map((collection, index) => <Link key={collection.name} to={`/gallery?category=${encodeURIComponent(collection.name)}`} className={`home-collection-card home-collection-card--${index + 1}`}><img src={collection.image} alt="" loading="lazy" /><b>0{index + 1}</b><span>{collection.name}</span><small>{collection.description}</small><i>View collection <ArrowRight aria-hidden="true" /></i></Link>)}</div><Link to="/gallery" className="home-text-link home-text-link--center">Browse the full gallery <ArrowRight aria-hidden="true" /></Link></div></section>

    <HomeShopRail shops={shops} loading={shopsLoading} error={shopsError} />

    {/* Freeform scroller: intentionally unchanged, repositioned as the design feature. */}
    <FreeformScrollSection />

    <HomeReviewRail reviews={reviews} />

    <section className="home-section home-closing" aria-labelledby="home-closing-title"><div className="home-container"><div className="home-closing__panel"><div className="home-closing__image"><img src="/images/explore_local_pottery.jpg" alt="Handmade pottery displayed in Santo Tomas" loading="lazy" /><span>Back cover · Santo Tomas</span></div><div className="home-closing__copy"><span className="home-kicker">Keep local craft in motion</span><h2 id="home-closing-title">Bring home a piece<br />of <em>Santo Tomas.</em></h2><p>Every piece connects you to a living craft tradition and the people continuing it with care.</p><div className="home-button-row"><Link to="/gallery" className="home-button home-button--primary"><ShoppingBag aria-hidden="true" />Shop handcrafted pottery</Link><Link to="/about" className="home-button home-button--quiet"><BookOpen aria-hidden="true" />Read the full story</Link></div>{!authLoading && !user && <button type="button" className="home-account-link" onClick={() => window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signup' } }))}>Create a free account <ArrowRight aria-hidden="true" /></button>}</div></div></div></section>
  </div>;
}

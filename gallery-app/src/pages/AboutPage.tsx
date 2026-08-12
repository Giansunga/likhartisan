import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Box, HandHeart, Palette, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Artisan {
  id: string;
  shop_id: string | null;
  name: string;
  specialty: string;
  location: string;
  description: string;
  cover_image: string;
}

const platformSteps = [
  {
    number: '01',
    title: 'Discover local work',
    description: 'Browse pottery listed by participating shops and makers in Santo Tomas.',
    link: '/gallery',
    label: 'Explore the gallery',
    icon: Search,
  },
  {
    number: '02',
    title: 'See the details',
    description: 'Review product information and inspect available pieces through interactive 3D viewing.',
    link: '/gallery',
    label: 'View pottery',
    icon: Box,
  },
  {
    number: '03',
    title: 'Shape an idea',
    description: 'Use the design studio to explore forms, finishes, decoration, and attachments.',
    link: '/freeform',
    label: 'Open the design studio',
    icon: Palette,
  },
  {
    number: '04',
    title: 'Continue with a maker',
    description: 'Choose a participating shop or send a design request for a custom conversation.',
    link: '/shops',
    label: 'Find a shop',
    icon: HandHeart,
  },
];

const commitments = [
  {
    number: '01',
    title: 'Tell the story carefully',
    description: 'We separate documented local history from marketing language and avoid inventing claims about the craft.',
  },
  {
    number: '02',
    title: 'Keep the maker visible',
    description: 'Artisan names, specialties, shops, and stories stay connected to the work they choose to present.',
  },
  {
    number: '03',
    title: 'Make discovery useful',
    description: 'Every feature should help people understand a piece, find a participating shop, or begin a thoughtful custom idea.',
  },
];

export default function AboutPage() {
  const prefersReducedMotion = useReducedMotion();
  const [artisans, setArtisans] = useState<Artisan[]>([]);
  const [loadingArtisans, setLoadingArtisans] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchArtisans() {
      const { data } = await supabase
        .from('artisans')
        .select('id, shop_id, name, specialty, location, description, cover_image')
        .order('created_at', { ascending: false })
        .limit(3);

      if (!cancelled) {
        setArtisans(data ?? []);
        setLoadingArtisans(false);
      }
    }

    fetchArtisans();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    const metadata = [
      ['meta[name="description"]', 'LikhArtisan connects Santo Tomas pottery, participating local shops, artisan profiles, and an interactive 3D design experience.'],
      ['meta[property="og:title"]', 'About LikhArtisan — Santo Tomas Pottery, Made Discoverable'],
      ['meta[property="og:description"]', 'Meet the makers, understand the local craft, and see how LikhArtisan connects pottery with digital discovery and custom design.'],
      ['meta[property="og:url"]', `${window.location.origin}/about`],
      ['meta[name="twitter:title"]', 'About LikhArtisan — Santo Tomas Pottery, Made Discoverable'],
      ['meta[name="twitter:description"]', 'Meet the makers and discover how LikhArtisan connects Santo Tomas pottery with digital discovery and custom design.'],
    ].map(([selector, value]) => {
      const element = document.querySelector<HTMLMetaElement>(selector);
      const previous = element?.content;
      if (element) element.content = value;
      return { element, previous };
    });
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.href;

    document.title = 'About LikhArtisan — Santo Tomas Pottery, Made Discoverable';
    if (canonical) canonical.href = `${window.location.origin}/about`;

    return () => {
      document.title = previousTitle;
      metadata.forEach(({ element, previous }) => {
        if (element && previous !== undefined) element.content = previous;
      });
      if (canonical && previousCanonical) canonical.href = previousCanonical;
    };
  }, []);

  const reveal = {
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: prefersReducedMotion ? 0 : 0.62, ease: 'easeOut' as const },
  };

  return (
    <div className="about-page">
      <header className="about-hero">
        <img
          src="/images/artisan_1.jpg"
          alt="Two pottery workers shaping a large clay vessel in a workshop"
          className="about-hero__image"
          fetchPriority="high"
        />
        <div className="about-hero__overlay" aria-hidden="true" />
        <div className="about-container about-hero__content">
          <motion.div {...reveal} className="about-hero__copy">
            <p className="about-eyebrow about-eyebrow--light">Santo Tomas, Pampanga · Pottery and digital craft</p>
            <h1 className="system-hero-title system-hero-title--editorial">Made by hand in Santo Tomas. <em>Made discoverable.</em></h1>
            <p className="about-hero__lede">
              LikhArtisan brings local pottery, participating shops, and a 3D design experience into one place—so every piece can lead back to the people and practice behind it.
            </p>
            <div className="about-actions">
              <Link to="/gallery" className="about-button about-button--primary">
                Explore the gallery <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/artisans" className="about-button about-button--ghost">
                Meet the makers
              </Link>
            </div>
          </motion.div>
        </div>
      </header>

      <main>
        <section className="about-section about-origin" aria-labelledby="about-origin-title">
          <div className="about-container about-origin__grid">
            <motion.figure {...reveal} className="about-photo about-origin__photo">
              <img
                src="/images/connect_with_local_artisans.jpg"
                alt="Pottery workers shaping and finishing large clay vessels inside a workshop"
                loading="lazy"
              />
              <figcaption>Craft is learned in the workshop, through practice, patience, and shared knowledge.</figcaption>
            </motion.figure>

            <motion.div {...reveal} className="about-origin__copy">
              <p className="about-eyebrow">Why LikhArtisan exists</p>
              <h2 id="about-origin-title">A local craft deserves a clearer path online.</h2>
              <p className="about-lede">
                LikhArtisan is an interactive pottery marketplace and design system built around the pottery community of Santo Tomas, Pampanga.
              </p>
              <p>
                The idea is practical: make participating shops easier to find, let customers understand more before purchasing, and give custom ideas a clearer path from screen to maker. Technology is the bridge—not the author of the craft.
              </p>
              <blockquote>
                “The digital experience should make the maker more visible, not replace the maker.”
              </blockquote>
            </motion.div>
          </div>
        </section>

        <section className="about-section about-heritage" aria-labelledby="about-heritage-title">
          <div className="about-container about-heritage__grid">
            <motion.div {...reveal} className="about-heritage__copy">
              <p className="about-eyebrow about-eyebrow--clay">A working local tradition</p>
              <h2 id="about-heritage-title">Pottery is part of the working identity of Santo Tomas.</h2>
              <p className="about-lede">
                Municipal sources document pottery making as a local industry and identify its artisan communities as a cultural and tourism asset.
              </p>
              <p>
                LikhArtisan treats that context with care. The platform does not claim to define the tradition; it creates another way for people to encounter the work, learn who made it, and explore what participating shops offer today.
              </p>
              <div className="about-source-note">
                <span>Read the local sources</span>
                <a href="https://stotomaspampangagov.ph/pottery-making/" target="_blank" rel="noreferrer">
                  Municipality pottery-making page <ArrowRight aria-hidden="true" />
                </a>
                <a href="https://stotomaspampangagov.ph/chilsexu/2023/07/CDP-2023-2029.pdf" target="_blank" rel="noreferrer">
                  Municipal development plan <ArrowRight aria-hidden="true" />
                </a>
              </div>
            </motion.div>

            <motion.div {...reveal} className="about-heritage__photos">
              <figure className="about-heritage__photo-main">
                <img src="/images/hero_1.jpg" alt="Rows of finished and drying clay pots in a pottery workshop" loading="lazy" />
              </figure>
              <figure className="about-heritage__photo-detail">
                <img src="/images/history_bottom_right.jpg" alt="A potter shaping a large clay vessel on a wheel" loading="lazy" />
              </figure>
              <p>From shaping a single vessel to preparing rows of finished work, each stage remains rooted in skilled hands.</p>
            </motion.div>
          </div>
        </section>

        <section className="about-section about-platform" aria-labelledby="about-platform-title">
          <div className="about-container">
            <motion.div {...reveal} className="about-section-heading">
              <p className="about-eyebrow">The digital bridge</p>
              <h2 id="about-platform-title">From first look to a conversation with a maker.</h2>
              <p>Four connected tools help visitors move from discovery to a more informed, personal next step.</p>
            </motion.div>

            <div className="about-steps">
              {platformSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <motion.article
                    key={step.number}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.5, delay: prefersReducedMotion ? 0 : index * 0.08 }}
                    className="about-step"
                  >
                    <div className="about-step__topline">
                      <span>{step.number}</span>
                      <Icon aria-hidden="true" />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    <Link to={step.link}>
                      {step.label} <ArrowRight aria-hidden="true" />
                    </Link>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="about-section about-makers" aria-labelledby="about-makers-title">
          <div className="about-container">
            <motion.div {...reveal} className="about-makers__heading">
              <div>
                <p className="about-eyebrow">People behind the pieces</p>
                <h2 id="about-makers-title">Meet participating artisans.</h2>
              </div>
              <Link to="/artisans" className="about-text-link">
                View the artisan directory <ArrowRight aria-hidden="true" />
              </Link>
            </motion.div>

            {loadingArtisans ? (
              <div className="about-maker-grid" role="status" aria-label="Loading artisan profiles">
                {[0, 1, 2].map((item) => <div key={item} className="about-maker-card about-maker-card--loading" />)}
              </div>
            ) : artisans.length > 0 ? (
              <div className="about-maker-grid">
                {artisans.map((artisan, index) => {
                  const destination = artisan.shop_id ? `/shop/${artisan.shop_id}` : '/artisans';
                  return (
                    <motion.article
                      key={artisan.id}
                      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.15 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.52, delay: prefersReducedMotion ? 0 : index * 0.08 }}
                      className="about-maker-card"
                    >
                      <Link to={destination} aria-label={`View ${artisan.name}${artisan.shop_id ? "'s shop" : ' in the artisan directory'}`}>
                        <div className="about-maker-card__image">
                          <img
                            src={artisan.cover_image || '/images/artisan_1.jpg'}
                            alt={artisan.cover_image ? `${artisan.name}, participating pottery artisan` : ''}
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.src = '/images/artisan_1.jpg';
                              event.currentTarget.alt = '';
                            }}
                          />
                        </div>
                        <div className="about-maker-card__body">
                          <p className="about-maker-card__location">{artisan.location || 'Santo Tomas, Pampanga'}</p>
                          <h3>{artisan.name}</h3>
                          <p className="about-maker-card__specialty">{artisan.specialty || 'Pottery artisan'}</p>
                          {artisan.description && <p className="about-maker-card__description">{artisan.description}</p>}
                          <span>View profile <ArrowRight aria-hidden="true" /></span>
                        </div>
                      </Link>
                    </motion.article>
                  );
                })}
              </div>
            ) : (
              <motion.div {...reveal} className="about-makers__empty">
                <p className="about-eyebrow">Profiles in progress</p>
                <h3>Artisan stories will appear as participating profiles are documented.</h3>
                <p>In the meantime, explore the shops and pottery currently available through LikhArtisan.</p>
                <Link to="/shops" className="about-button about-button--primary">
                  Explore shops <ArrowRight aria-hidden="true" />
                </Link>
              </motion.div>
            )}
          </div>
        </section>

        <section className="about-section about-commitments" aria-labelledby="about-commitments-title">
          <div className="about-container">
            <motion.div {...reveal} className="about-section-heading about-section-heading--left">
              <p className="about-eyebrow">Our commitments</p>
              <h2 id="about-commitments-title">A platform should earn trust through what it can show.</h2>
            </motion.div>
            <div className="about-commitment-grid">
              {commitments.map((commitment, index) => (
                <motion.article
                  key={commitment.number}
                  initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.48, delay: prefersReducedMotion ? 0 : index * 0.08 }}
                >
                  <span>{commitment.number}</span>
                  <h3>{commitment.title}</h3>
                  <p>{commitment.description}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-closing" aria-labelledby="about-closing-title">
          <div className="about-closing__texture" aria-hidden="true" />
          <motion.div {...reveal} className="about-container about-closing__content">
            <p className="about-eyebrow about-eyebrow--light">Start with what draws you in</p>
            <h2 id="about-closing-title">A finished piece, a local shop, or an idea of your own.</h2>
            <p>Explore Santo Tomas pottery through the path that feels most useful to you.</p>
            <div className="about-actions about-actions--center">
              <Link to="/gallery" className="about-button about-button--light">
                Shop pottery <ArrowRight aria-hidden="true" />
              </Link>
              <Link to="/freeform" className="about-button about-button--ghost">
                Design a custom piece
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}

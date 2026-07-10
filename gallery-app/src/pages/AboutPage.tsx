import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const team = [
  { name: 'Mang Julio', role: 'Master Potter', img: '/images/artisan_1.png', bio: '35+ years crafting traditional clay vessels.' },
  { name: 'Aling Maria', role: 'Glaze Specialist', img: '/images/hero_1.png', bio: 'Organic glaze recipes passed through generations.' },
  { name: 'Kuya Ben', role: 'Modern Sculptor', img: '/images/artisan_1.png', bio: 'Blending modern design with traditional clay.' },
];

const milestones = [
  { year: '2020', title: 'Founded', desc: 'LikhArtisan was born to bridge artisans with the digital world.' },
  { year: '2021', title: '3D Viewer', desc: 'Launched interactive 3D pottery product viewer.' },
  { year: '2023', title: 'Community', desc: 'Over 50 local artisans onboarded to the platform.' },
  { year: '2025', title: 'Global Reach', desc: 'Expanded shipping and reached international customers.' },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero Banner */}
      <header className="gallery-header-banner">
        <div className="gallery-banner-bg" style={{ backgroundImage: 'url(/images/hero_1.png)' }} />
        <div className="gallery-banner-overlay" />
        <div className="max-w-[var(--container-width)] mx-auto px-6 relative z-[5] w-full">
          <div className="gallery-banner-content">
            <div className="breadcrumbs">
              <Link to="/">Home</Link>
              <span className="separator">/</span>
              <span className="current">About</span>
            </div>
            <h1 className="gallery-title">About LikhArtisan</h1>
            <p className="text-[1.2rem] text-white/85 mt-4 max-w-[600px] leading-[1.6]">
              Preserving Filipino pottery heritage through technology.
            </p>
          </div>
        </div>
      </header>

      {/* Mission Section */}
      <section className="py-16 md:py-24 bg-cream">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-brown-dark mb-6">Our Mission</h2>
              <p className="text-brown-medium text-lg leading-relaxed mb-4">
                LikhArtisan is an interactive 3D pottery design and order management web system built for local artisans
                in Santo Tomas, Pampanga. Our platform bridges the gap between traditional Filipino craftsmanship and
                modern e-commerce technology.
              </p>
              <p className="text-brown-medium text-lg leading-relaxed">
                Through our 3D product viewer, customers can inspect pottery pieces from every angle before making a purchase,
                ensuring they fully appreciate the craftsmanship and detail that goes into each piece.
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              className="rounded-2xl overflow-hidden shadow-lg">
              <img src="/images/vases_collection.png" alt="Pottery collection" className="w-full h-[400px] object-cover" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Milestones */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="font-serif text-3xl md:text-4xl font-bold text-brown-dark text-center mb-14">Our Journey</motion.h2>
          <div className="grid md:grid-cols-4 gap-8">
            {milestones.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }} className="text-center">
                <div className="text-4xl font-bold text-primary mb-2">{m.year}</div>
                <h3 className="font-serif text-xl font-semibold text-brown-dark mb-2">{m.title}</h3>
                <p className="text-brown-medium">{m.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-16 md:py-24 bg-cream">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="font-serif text-3xl md:text-4xl font-bold text-brown-dark text-center mb-14">Meet Our Artisans</motion.h2>
          <div className="grid md:grid-cols-3 gap-10">
            {team.map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }} className="bg-white rounded-2xl shadow-md overflow-hidden text-center">
                <div className="h-56 overflow-hidden">
                  <img src={t.img} alt={t.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-6">
                  <h3 className="font-serif text-xl font-bold text-brown-dark">{t.name}</h3>
                  <p className="text-primary font-medium text-sm uppercase tracking-wider mt-1">{t.role}</p>
                  <p className="text-brown-medium mt-3">{t.bio}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Craft Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-[var(--container-width)] mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              className="rounded-2xl overflow-hidden shadow-lg order-2 md:order-1">
              <img src="/images/jars_collection.png" alt="Handcrafted pottery" className="w-full h-[400px] object-cover" />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
              className="order-1 md:order-2">
              <h2 className="font-serif text-3xl md:text-4xl font-bold text-brown-dark mb-6">The Craft</h2>
              <p className="text-brown-medium text-lg leading-relaxed mb-4">
                Each piece of pottery from Santo Tomas tells a story of tradition, skill, and dedication.
                Our artisans use techniques passed down through generations, working with locally sourced clay
                to create everything from utilitarian cookware to decorative art pieces.
              </p>
              <p className="text-brown-medium text-lg leading-relaxed">
                We are committed to preserving the rich pottery heritage of Pampanga by providing artisans with a digital
                platform to showcase and sell their work to a wider audience.
              </p>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

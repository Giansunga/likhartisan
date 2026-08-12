import { UserRound } from 'lucide-react';
import type { ShopArtisan } from './shopStorefront';

interface ShopMakersSectionProps {
  artisans: ShopArtisan[];
  artisanCount: number;
}

export default function ShopMakersSection({ artisans, artisanCount }: ShopMakersSectionProps) {
  return (
    <section className="shop-section shop-makers" id="shop-makers" aria-labelledby="shop-makers-title">
      <div className="shop-container">
        <div className="shop-section__heading">
          <div>
            <p className="shop-kicker">People behind the pottery</p>
            <h2 id="shop-makers-title">Meet the makers</h2>
            <p>{artisanCount ? `${artisanCount} local ${artisanCount === 1 ? 'artisan contributes' : 'artisans contribute'} to this shop.` : 'Artisan profiles will be added as the shop grows.'}</p>
          </div>
        </div>
        {artisans.length ? (
          <div className="shop-maker-grid">
            {artisans.map(artisan => (
              <article className="shop-maker-card" key={artisan.id}>
                <div className="shop-maker-card__image">
                  {artisan.cover_image ? <img src={artisan.cover_image} alt={artisan.name} loading="lazy" /> : <UserRound aria-hidden="true" />}
                </div>
                <div className="shop-maker-card__body">
                  <p>{artisan.specialty || 'Pottery artisan'}</p>
                  <h3>{artisan.name}</h3>
                  {artisan.description ? <span>{artisan.description}</span> : null}
                  {artisan.experience ? <small>{artisan.experience} experience</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="shop-empty-state shop-empty-state--compact">
            <UserRound aria-hidden="true" />
            <h3>Maker profiles coming soon</h3>
          </div>
        )}
      </div>
    </section>
  );
}

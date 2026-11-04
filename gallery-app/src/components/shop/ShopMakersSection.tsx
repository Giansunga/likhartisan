import ArtisanCard from '../ArtisanCard';
import { UserRound } from 'lucide-react';
import type { ShopArtisan } from './shopStorefront';

interface ShopMakersSectionProps {
  artisans: ShopArtisan[];
  shop?: { id: string; name: string };
}

export default function ShopMakersSection({ artisans, shop }: ShopMakersSectionProps) {
  return (
    <section className="shop-section shop-makers" id="shop-makers" aria-labelledby="shop-makers-title">
      <div className="shop-container">
        <div className="shop-section__heading">
          <div>
            <p className="shop-kicker">People behind the pottery</p>
            <h2 id="shop-makers-title">Meet the makers</h2>
          </div>
        </div>
        {artisans.length ? (
          <div className="artisan-cards">
            {artisans.map(artisan => (
              <ArtisanCard key={artisan.id} artisan={artisan} shop={shop} />
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

import { CalendarDays, Mail, MapPinned, Store } from 'lucide-react';
import { useState } from 'react';
import type { ShopProfile } from './shopStorefront';
import { getStoryParagraphs } from './shopStorefront';

interface ShopStorySectionProps {
  shop: ShopProfile;
  membershipYear: number | null;
}

export default function ShopStorySection({ shop, membershipYear }: ShopStorySectionProps) {
  const [showMap, setShowMap] = useState(false);
  const paragraphs = getStoryParagraphs(shop);

  return (
    <section className="shop-section shop-story" id="shop-story" aria-labelledby="shop-story-title">
      <div className="shop-container shop-story__grid">
        <div className="shop-story__copy">
          <p className="shop-kicker">Behind the work</p>
          <h2 id="shop-story-title">Our story</h2>
          {paragraphs.length ? paragraphs.map((paragraph, index) => <p key={`${paragraph.slice(0, 24)}-${index}`}>{paragraph}</p>) : (
            <p>{shop.name} is part of LikhArtisan’s community of pottery shops in Santo Tomas, Pampanga.</p>
          )}
        </div>

        <aside className="shop-information" aria-labelledby="shop-information-title">
          <div className="shop-information__heading">
            <Store aria-hidden="true" />
            <div><p className="shop-kicker">Plan your visit</p><h3 id="shop-information-title">Shop information</h3></div>
          </div>
          <dl>
            {shop.location ? <div><dt><MapPinned aria-hidden="true" /> Location</dt><dd>{shop.location}</dd></div> : null}
            {shop.email ? <div><dt><Mail aria-hidden="true" /> Contact</dt><dd><a href={`mailto:${shop.email}`}>{shop.email}</a></dd></div> : null}
            {membershipYear ? <div><dt><CalendarDays aria-hidden="true" /> LikhArtisan member</dt><dd>Since {membershipYear}</dd></div> : null}
          </dl>
          {shop.location ? (
            <>
              <button className="shop-map-toggle" type="button" aria-expanded={showMap} onClick={() => setShowMap(current => !current)}>
                <MapPinned aria-hidden="true" /> {showMap ? 'Hide map' : 'View on map'}
              </button>
              {showMap ? (
                <div className="shop-map">
                  <iframe
                    title={`${shop.name} location`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(shop.location)}&output=embed`}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

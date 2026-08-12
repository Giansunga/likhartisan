import { Heart, LoaderCircle, MapPin, MessageCircle, Package, Store, Users } from 'lucide-react';
import type { ShopProfile } from './shopStorefront';

interface ShopHeroProps {
  shop: ShopProfile;
  productCount: number;
  followerCount: number;
  artisanCount: number;
  membershipYear: number | null;
  following: boolean;
  followPending: boolean;
  messagePending: boolean;
  onFollow: () => void;
  onMessage: () => void;
}

export default function ShopHero({
  shop,
  productCount,
  followerCount,
  artisanCount,
  membershipYear,
  following,
  followPending,
  messagePending,
  onFollow,
  onMessage,
}: ShopHeroProps) {
  return (
    <>
      <header className="shop-hero">
        <div className="shop-hero__media" aria-hidden={!shop.banner}>
          <img
            src={shop.banner || '/images/vases_collection.png'}
            alt={shop.banner ? `${shop.name} shop cover` : ''}
            fetchPriority="high"
          />
        </div>
        <div className="shop-hero__overlay" />
        <div className="shop-container shop-hero__content">
          <div className="shop-hero__identity">
            <div className="shop-hero__avatar">
              {shop.image ? <img src={shop.image} alt={`${shop.name} profile`} /> : <Store aria-hidden="true" />}
            </div>
            <div className="shop-hero__copy">
              <p className="shop-hero__eyebrow">Local pottery shop</p>
              <h1 className="system-hero-title system-hero-title--profile">{shop.name}</h1>
              {shop.description ? <p className="shop-hero__tagline">{shop.description}</p> : null}
              {shop.location ? <p className="shop-hero__location"><MapPin aria-hidden="true" /> {shop.location}</p> : null}
              <div className="shop-hero__actions">
                <a className="shop-button shop-button--primary" href="#shop-products">
                  <Package aria-hidden="true" /> Browse pieces
                </a>
                <button
                  className={`shop-button shop-button--follow${following ? ' is-following' : ''}`}
                  type="button"
                  aria-pressed={following}
                  disabled={followPending}
                  onClick={onFollow}
                >
                  {followPending ? <LoaderCircle className="shop-spin" aria-hidden="true" /> : <Heart fill={following ? 'currentColor' : 'none'} aria-hidden="true" />}
                  {following ? 'Following' : 'Follow'}
                </button>
                <button className="shop-button shop-button--secondary" type="button" disabled={messagePending} onClick={onMessage}>
                  {messagePending ? <LoaderCircle className="shop-spin" aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
                  Message shop
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="shop-metrics" aria-label="Shop overview">
        <div className="shop-container">
          <dl>
            <div><dt>Active pieces</dt><dd>{productCount}</dd></div>
            <div><dt>Followers</dt><dd>{followerCount}</dd></div>
            <div><dt>Local makers</dt><dd>{artisanCount}</dd></div>
            <div><dt>Member since</dt><dd>{membershipYear ?? '—'}</dd></div>
          </dl>
          <div className="shop-metrics__note"><Users aria-hidden="true" /> Made by participating Santo Tomas artisans</div>
        </div>
      </section>
    </>
  );
}

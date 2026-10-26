import AssetImage from '../AssetImage';
import { ArrowRight, PackageOpen, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/utils';
import type { Product } from '../../types';
import { getProductDisplayPrice, type RatingSummary } from './shopStorefront';

interface ShopProductsSectionProps {
  shopId: string;
  shopName: string;
  products: Product[];
  productCount: number;
  prices: Record<string, number>;
  availability: Record<string, boolean>;
  ratings: Record<string, RatingSummary>;
}

export default function ShopProductsSection({ shopId, shopName, products, productCount, prices, availability, ratings }: ShopProductsSectionProps) {
  return (
    <section className="shop-section shop-products" id="shop-products" aria-labelledby="shop-products-title">
      <div className="shop-container">
        <div className="shop-section__heading">
          <div>
            <p className="shop-kicker">The collection</p>
            <h2 id="shop-products-title">Featured pieces</h2>
            <p>Explore recent pottery offered by {shopName}.</p>
          </div>
          {productCount > products.length ? (
            <Link className="shop-text-link" to={`/gallery?shop=${encodeURIComponent(shopId)}`}>
              View all {productCount} pieces <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        {products.length ? (
          <div className="shop-product-grid">
            {products.map(product => {
              const rating = ratings[product.id];
              const displayPrice = getProductDisplayPrice(product, prices[product.id]);
              return (
                <Link className="shop-product-card" to={`/product/${product.id}`} key={product.id}>
                  <div className="shop-product-card__image">
                    {product.image ? <AssetImage src={product.image} alt={product.name} loading="lazy" /> : <PackageOpen aria-hidden="true" />}
                    {product.category ? <span>{product.category}</span> : null}
                  </div>
                  <div className="shop-product-card__body">
                    <h3>{product.name}</h3>
                    <div className="shop-product-card__meta">
                      <strong>{displayPrice === null ? 'Price unavailable' : fmt(displayPrice)}</strong>
                      {!(availability[product.id] ?? (product.stock > 0)) && <span className="product-card-out-of-stock">Out of stock</span>}
                    </div>
                    {rating ? <div className="shop-product-card__rating" aria-label={`${rating.avg.toFixed(1)} out of 5 from ${rating.count} reviews`}><Star fill="currentColor" aria-hidden="true" /> {rating.avg.toFixed(1)} <small>({rating.count})</small></div> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="shop-empty-state">
            <PackageOpen aria-hidden="true" />
            <h3>New work is coming soon</h3>
            <p>This shop has no active pieces available right now.</p>
          </div>
        )}
      </div>
    </section>
  );
}

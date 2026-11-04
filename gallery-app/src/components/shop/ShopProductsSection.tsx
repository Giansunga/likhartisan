import AssetImage from '../AssetImage';
import { PackageOpen, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fmt } from '../../lib/utils';
import type { Product } from '../../types';
import Pagination from '../Pagination';
import { getProductDisplayPrice, type RatingSummary } from './shopStorefront';

interface ShopProductsSectionProps {
  shopName: string;
  products: Product[];
  productCount: number;
  prices: Record<string, number>;
  availability: Record<string, boolean>;
  ratings: Record<string, RatingSummary>;
  page: number;
  pageSize: number;
  pagePending: boolean;
  pageError: boolean;
  onPageChange: (page: number) => void;
}

export default function ShopProductsSection({
  shopName, products, productCount, prices, availability, ratings, page, pageSize, pagePending, pageError, onPageChange,
}: ShopProductsSectionProps) {
  return (
    <section className="shop-section shop-products" id="shop-products" aria-labelledby="shop-products-title">
      <div className="shop-container">
        <div className="shop-section__heading">
          <p className="shop-kicker">The collection</p>
          <h2 id="shop-products-title">Featured pieces</h2>
          <p>Explore recent pottery offered by {shopName}.</p>
        </div>

        {products.length ? (
          <div className="shop-product-grid" aria-busy={pagePending}>
            {products.map(product => {
              const rating = ratings[product.id];
              const displayPrice = getProductDisplayPrice(product, prices[product.id]);
              return (
                <Link className="shop-product-card" to={`/product/${product.id}`} key={product.id}>
                  <div className="shop-product-card__image">
                    <AssetImage src={product.image} alt={product.name} loading="lazy" />
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
        {pageError && <p className="shop-product-page-status" role="alert">This page couldn’t load. Select the page again to retry.</p>}
        {pagePending && <p className="shop-product-page-status" role="status">Loading pieces…</p>}
        {productCount > pageSize && (
          <fieldset className="shop-product-pagination" aria-label="Shop product pages" disabled={pagePending}>
            <Pagination page={page} totalPages={Math.ceil(productCount / pageSize)} total={productCount} pageSize={pageSize} onPageChange={onPageChange} />
          </fieldset>
        )}
      </div>
    </section>
  );
}

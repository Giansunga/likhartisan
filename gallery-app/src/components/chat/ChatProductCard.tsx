import { Link } from 'react-router-dom';
import type { LikhAIProductCard } from '../../types/likhai';

const FALLBACK = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F2EAE1"/><path d="M28 14c-6 0-10 5-10 11 0 6 4 9 4 13h12c0-4 4-7 4-13 0-6-4-11-10-11z" fill="#C9B7A6"/></svg>',
);

export default function ChatProductCard({ product }: { product: LikhAIProductCard }) {
  return (
    <Link to={product.href} className="likhai-card likhai-product-card" aria-label={`View ${product.name}`}>
      <img
        src={product.image?.trim() || FALLBACK}
        alt=""
        className="likhai-card__image"
        onError={event => { event.currentTarget.src = FALLBACK; }}
      />
      <div className="likhai-card__content">
        <strong>{product.name}</strong>
        <span>{[product.category, product.materials].filter(Boolean).join(' · ')}</span>
        <strong className="likhai-card__price">₱{Number(product.price || 0).toLocaleString()}</strong>
      </div>
      <span aria-hidden="true">View →</span>
    </Link>
  );
}

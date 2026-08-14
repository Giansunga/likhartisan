import { Link } from 'react-router-dom';
import type { LikhAIShopCard } from '../../types/likhai';

export default function ChatShopCard({ shop }: { shop: LikhAIShopCard }) {
  return (
    <Link to={shop.href} className="likhai-card likhai-shop-card" aria-label={`View ${shop.name}`}>
      <div className="likhai-shop-card__icon" aria-hidden="true">◉</div>
      <div className="likhai-card__content">
        <strong>{shop.name}</strong>
        {shop.location && <span>{shop.location}</span>}
        {shop.description && <span className="likhai-shop-card__description">{shop.description}</span>}
      </div>
      <span aria-hidden="true">View →</span>
    </Link>
  );
}

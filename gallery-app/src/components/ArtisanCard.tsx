import { Clock3, MapPin, UserRound, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import AssetImage from './AssetImage';
import './artisan-card.css';

export interface ArtisanCardData {
  id: string; name: string; cover_image?: string; specialty?: string;
  description?: string; experience?: string; location?: string;
}
export default function ArtisanCard({ artisan, shop }: { artisan: ArtisanCardData; shop?: { id: string | null; name?: string } }) {
  return <article className="artisan-card">
    <div className="artisan-card__portrait">{artisan.cover_image ? <AssetImage src={artisan.cover_image} alt={artisan.name} loading="lazy" /> : <UserRound aria-hidden="true" />}</div>
    <div className="artisan-card__details">
      <h3 title={artisan.name}>{artisan.name}</h3>
      {shop && <p className="artisan-card__shop">{shop.id && shop.name ? <Link to={`/shop/${shop.id}`}>{shop.name}<ChevronRight size={14} aria-hidden="true" /></Link> : shop.id ? 'Shop unavailable' : 'No shop assigned'}</p>}
      <p className="artisan-card__specialty" title={artisan.specialty}>{artisan.specialty || 'Pottery artisan'}</p>
      {artisan.description && <p className="artisan-card__description" title={artisan.description}>{artisan.description}</p>}
    </div>
    <div className="artisan-card__facts">
      {artisan.experience && <span title={artisan.experience}><Clock3 size={14} aria-hidden="true" />{artisan.experience}</span>}
      {artisan.location && <span title={artisan.location}><MapPin size={14} aria-hidden="true" />{artisan.location}</span>}
    </div>
  </article>;
}

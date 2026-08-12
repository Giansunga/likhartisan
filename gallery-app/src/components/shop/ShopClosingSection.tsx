import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ShopClosingSectionProps {
  shopName: string;
  messagePending: boolean;
  onMessage: () => void;
}

export default function ShopClosingSection({ shopName, messagePending, onMessage }: ShopClosingSectionProps) {
  return (
    <section className="shop-closing" aria-labelledby="shop-closing-title">
      <div className="shop-container shop-closing__card">
        <div className="shop-closing__icon"><Sparkles aria-hidden="true" /></div>
        <div>
          <p className="shop-kicker">Made for you</p>
          <h2 id="shop-closing-title">Looking for something personal?</h2>
          <p>Talk with {shopName} about a custom piece, or begin shaping your idea in the Design Studio.</p>
        </div>
        <div className="shop-closing__actions">
          <button className="shop-button shop-button--primary" type="button" disabled={messagePending} onClick={onMessage}>
            <MessageCircle aria-hidden="true" /> Message shop
          </button>
          <Link className="shop-button shop-button--light" to="/freeform">
            Open Design Studio <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

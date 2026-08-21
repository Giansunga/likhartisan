import { Link } from 'react-router-dom';
import {
  LockKeyhole,
  MapPin,
  Minus,
  PackageOpen,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
} from 'lucide-react';
import type { CartItem } from '../../types';
import { fmt } from '../../lib/utils';
import { getCartLineKey } from '../../lib/cartCheckout';

export interface CartLineAvailability {
  status: 'loading' | 'ready' | 'error';
  stock: number | null;
  available: boolean;
  priceChanged?: boolean;
}

interface ShopCartGroupProps {
  shopKey: string;
  shopName: string;
  items: CartItem[];
  activeShopKey: string | null;
  selected: Set<string>;
  getAvailability: (item: CartItem) => CartLineAvailability;
  onToggleShop: (shopKey: string) => void;
  onToggleItem: (item: CartItem) => void;
  onQuantityChange: (item: CartItem, delta: number) => void;
  onRemove: (item: CartItem) => void;
}

export function ShopCartGroup({
  shopKey,
  shopName,
  items,
  activeShopKey,
  selected,
  getAvailability,
  onToggleShop,
  onToggleItem,
  onQuantityChange,
  onRemove,
}: ShopCartGroupProps) {
  const selectable = items.filter(item => getAvailability(item).available);
  const allSelected = selectable.length > 0 && selectable.every(item => selected.has(getCartLineKey(item)));
  const isActive = activeShopKey === shopKey;
  const shopTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  return (
    <section className={`cart-shop ${isActive ? 'cart-shop--active' : ''}`} aria-labelledby={`shop-${shopKey}`}>
      <header className="cart-shop__header">
        <label className="cart-check cart-shop__select">
          <input
            type="checkbox"
            checked={isActive && allSelected}
            disabled={selectable.length === 0}
            onChange={() => onToggleShop(shopKey)}
            aria-label={`Select available items from ${shopName}`}
          />
          <span className="cart-check__box" aria-hidden="true" />
        </label>
        <Store size={18} aria-hidden="true" />
        <div className="cart-shop__identity">
          <h2 id={`shop-${shopKey}`}>{shopName}</h2>
          <span>{items.length} {items.length === 1 ? 'piece' : 'pieces'}</span>
        </div>
        <span className="cart-shop__total">{fmt(shopTotal)}</span>
      </header>

      <div className="cart-shop__items">
        {items.map(item => {
          const key = getCartLineKey(item);
          const availability = getAvailability(item);
          const checked = isActive && selected.has(key);
          const atMaximum = availability.stock !== null && item.qty >= availability.stock;
          const checkboxId = `cart-line-${encodeURIComponent(key)}`;

          return (
            <article className={`cart-line ${!availability.available ? 'cart-line--unavailable' : ''}`} key={key}>
              <label className="cart-check cart-line__select" htmlFor={checkboxId}>
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={checked}
                  disabled={!availability.available}
                  onChange={() => onToggleItem(item)}
                  aria-label={`Select ${item.productName}`}
                />
                <span className="cart-check__box" aria-hidden="true" />
              </label>

              <Link className="cart-line__image-link" to={`/product/${item.productId}`} aria-label={`View ${item.productName}`}>
                <img src={item.image} alt="" className="cart-line__image" />
              </Link>

              <div className="cart-line__details">
                <Link to={`/product/${item.productId}`} className="cart-line__name">{item.productName}</Link>
                {item.variation ? <p className="cart-line__variation">{item.variation}</p> : null}
                <div className="cart-line__status" aria-live="polite">
                  {availability.status === 'loading' ? <span>Checking availability…</span> : null}
                  {availability.status === 'error' ? <span className="is-warning">Availability check delayed</span> : null}
                  {availability.status === 'ready' && availability.stock === 0 ? <span className="is-error">Out of stock</span> : null}
                  {availability.status === 'ready' && availability.stock !== null && availability.stock > 0 && availability.stock <= 3 ? (
                    <span className="is-warning">Only {availability.stock} left</span>
                  ) : null}
                  {availability.priceChanged ? <span className="is-updated">Price updated</span> : null}
                </div>
              </div>

              <div className="cart-line__price">
                <strong>{fmt(item.price * item.qty)}</strong>
                <span>{fmt(item.price)} each</span>
              </div>

              <div className="cart-line__actions">
                <div className="cart-quantity" aria-label={`Quantity for ${item.productName}`}>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(item, -1)}
                    disabled={item.qty <= 1 || !availability.available}
                    aria-label={`Decrease quantity of ${item.productName}`}
                  >
                    <Minus size={15} aria-hidden="true" />
                  </button>
                  <output aria-label="Quantity">{item.qty}</output>
                  <button
                    type="button"
                    onClick={() => onQuantityChange(item, 1)}
                    disabled={atMaximum || !availability.available}
                    aria-label={`Increase quantity of ${item.productName}`}
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  className="cart-line__remove"
                  onClick={() => onRemove(item)}
                  aria-label={`Remove ${item.productName} from cart`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface CartSummaryProps {
  shopName?: string;
  itemCount: number;
  subtotal: number;
  deliveryOption: 'pickup' | 'courier' | null;
  address: string;
  estimateFee: number | null;
  estimateVehicle?: string;
  estimateLoading: boolean;
  estimateError: string;
  onDeliveryOptionChange: (option: 'pickup' | 'courier') => void;
  onAddressChange: (address: string) => void;
  onEstimate: () => void;
  onCheckout: () => void;
}

export function CartSummary({
  shopName,
  itemCount,
  subtotal,
  deliveryOption,
  address,
  estimateFee,
  estimateVehicle,
  estimateLoading,
  estimateError,
  onDeliveryOptionChange,
  onAddressChange,
  onEstimate,
  onCheckout,
}: CartSummaryProps) {
  const shipping = deliveryOption === 'pickup' ? 0 : estimateFee;
  const total = subtotal + (shipping || 0);
  const canCheckout = itemCount > 0;

  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-title">
      <div className="cart-summary__artisan">
        <span>Checking out from</span>
        <strong>{shopName || 'Choose an artisan'}</strong>
      </div>

      <h2 id="cart-summary-title">Order summary</h2>

      <div className="cart-summary__delivery">
        <span className="cart-summary__eyebrow">Delivery preference</span>
        <div className="cart-delivery-options" role="group" aria-label="Delivery preference">
          <button
            type="button"
            className={deliveryOption === 'pickup' ? 'is-selected' : ''}
            aria-pressed={deliveryOption === 'pickup'}
            onClick={() => onDeliveryOptionChange('pickup')}
          >
            <ShoppingBag size={18} aria-hidden="true" />
            <span><strong>Pickup</strong><small>Free</small></span>
          </button>
          <button
            type="button"
            className={deliveryOption === 'courier' ? 'is-selected' : ''}
            aria-pressed={deliveryOption === 'courier'}
            onClick={() => onDeliveryOptionChange('courier')}
          >
            <Truck size={18} aria-hidden="true" />
            <span><strong>Courier</strong><small>Get estimate</small></span>
          </button>
        </div>

        {deliveryOption === 'courier' ? (
          <div className="cart-estimator">
            <label htmlFor="cart-delivery-address">Delivery address</label>
            <div className="cart-estimator__field">
              <MapPin size={17} aria-hidden="true" />
              <input
                id="cart-delivery-address"
                value={address}
                onChange={event => onAddressChange(event.target.value)}
                placeholder="Enter your delivery address"
                autoComplete="street-address"
              />
            </div>
            <button
              type="button"
              className="cart-estimator__button"
              onClick={onEstimate}
              disabled={estimateLoading || !address.trim() || itemCount === 0}
            >
              {estimateLoading ? 'Calculating…' : 'Estimate delivery'}
            </button>
            <div className="cart-estimator__feedback" aria-live="polite">
              {estimateFee !== null ? (
                <p className="is-success">
                  Estimated {estimateVehicle ? `${estimateVehicle} ` : ''}delivery: <strong>{fmt(estimateFee)}</strong>
                </p>
              ) : null}
              {estimateError ? <p className="is-error">{estimateError}</p> : null}
            </div>
          </div>
        ) : null}
      </div>

      <dl className="cart-summary__totals">
        <div><dt>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</dt><dd>{fmt(subtotal)}</dd></div>
        <div>
          <dt>Estimated shipping</dt>
          <dd className={deliveryOption === 'pickup' ? 'is-free' : ''}>
            {deliveryOption === 'pickup' ? 'Free' : estimateFee !== null ? fmt(estimateFee) : 'At checkout'}
          </dd>
        </div>
        <div className="cart-summary__grand-total"><dt>Estimated total</dt><dd>{fmt(total)}</dd></div>
      </dl>

      <button type="button" className="cart-summary__checkout" disabled={!canCheckout} onClick={onCheckout}>
        {canCheckout ? `Checkout ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Select items to checkout'}
      </button>
      <p className="cart-summary__note"><LockKeyhole size={14} aria-hidden="true" /> Delivery and payment are confirmed securely at checkout.</p>
      <div className="cart-summary__trust">
        <span><ShieldCheck size={17} aria-hidden="true" /> Authentic artisan work</span>
        <span><PackageOpen size={17} aria-hidden="true" /> Carefully packed locally</span>
      </div>
    </aside>
  );
}

export function EmptyCartState() {
  return (
    <section className="cart-empty" aria-labelledby="empty-cart-title">
      <div className="cart-empty__icon"><ShoppingBag size={42} aria-hidden="true" /></div>
      <h1 id="empty-cart-title">Your cart is waiting for something handmade.</h1>
      <Link to="/gallery" className="cart-empty__action">Explore the gallery</Link>
    </section>
  );
}

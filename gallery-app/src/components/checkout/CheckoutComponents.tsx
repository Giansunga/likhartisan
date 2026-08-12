import type { ReactNode } from 'react';
import {
  ArrowLeft,
  Check,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  Navigation,
  PackageCheck,
  Pencil,
  ShieldCheck,
  Store,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import type { CartItem } from '../../types';
import { fmt } from '../../lib/utils';

export type CheckoutDeliveryOption = 'pickup' | 'courier';

export interface CheckoutAddressForm {
  name: string;
  phone: string;
  address: string;
}

interface CheckoutHeaderProps {
  itemCount: number;
  shopName: string;
  isBuyNow: boolean;
  onBack: () => void;
}

export function CheckoutHeader({ itemCount, shopName, isBuyNow, onBack }: CheckoutHeaderProps) {
  return (
    <header className="checkout-header">
      <button type="button" className="checkout-back" onClick={onBack}>
        <ArrowLeft size={17} aria-hidden="true" />
        {isBuyNow ? 'Back to product' : 'Back to cart'}
      </button>
      <div className="checkout-header__row">
        <div>
          <span className="checkout-eyebrow">Secure artisan checkout</span>
          <h1>Review and pay</h1>
          <p>{itemCount} {itemCount === 1 ? 'piece' : 'pieces'} from {shopName}</p>
        </div>
        <ol className="checkout-steps" aria-label="Checkout progress">
          <li className="checkout-step checkout-step--complete"><Check size={14} aria-hidden="true" /><span>Cart</span></li>
          <li className="checkout-step checkout-step--current" aria-current="step"><span>2</span><span>Delivery</span></li>
          <li className="checkout-step"><span>3</span><span>Payment</span></li>
        </ol>
      </div>
    </header>
  );
}

interface ContactCardProps {
  name: string;
  phone: string;
  address: string;
  editing: boolean;
  form: CheckoutAddressForm;
  saving: boolean;
  requiresAddress: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onFormChange: (next: CheckoutAddressForm) => void;
  onSave: () => void;
}

export function ContactCard({
  name,
  phone,
  address,
  editing,
  form,
  saving,
  requiresAddress,
  onEdit,
  onCancel,
  onFormChange,
  onSave,
}: ContactCardProps) {
  return (
    <section className="checkout-card checkout-contact" aria-labelledby="checkout-contact-title">
      <div className="checkout-card__heading">
        <div>
          <span className="checkout-section-number">01</span>
          <div>
            <h2 id="checkout-contact-title">Contact details</h2>
            <p>Used for order updates and delivery coordination.</p>
          </div>
        </div>
        {editing ? (
          <button type="button" className="checkout-text-button" onClick={onCancel}>
            <X size={15} aria-hidden="true" /> Cancel
          </button>
        ) : (
          <button type="button" className="checkout-text-button" onClick={onEdit}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="checkout-form">
          <div className="checkout-form__row">
            <label>
              <span>Full name</span>
              <input
                autoComplete="name"
                value={form.name}
                onChange={event => onFormChange({ ...form, name: event.target.value })}
                placeholder="Your full name"
              />
            </label>
            <label>
              <span>Phone number</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={event => onFormChange({ ...form, phone: event.target.value })}
                placeholder="09XX XXX XXXX"
              />
            </label>
          </div>
          <label>
            <span>Delivery address {requiresAddress ? '' : '(optional for pickup)'}</span>
            <input
              autoComplete="street-address"
              value={form.address}
              onChange={event => onFormChange({ ...form, address: event.target.value })}
              placeholder="Street, barangay, municipality, province"
            />
          </label>
          <div className="checkout-form__actions">
            <button type="button" className="checkout-secondary-button" onClick={onCancel}>Discard changes</button>
            <button type="button" className="checkout-primary-button checkout-primary-button--compact" disabled={saving} onClick={onSave}>
              {saving ? <><LoaderCircle className="checkout-spin" size={16} aria-hidden="true" /> Saving…</> : 'Save details'}
            </button>
          </div>
        </div>
      ) : (
        <div className="checkout-contact__summary">
          <span className="checkout-icon-tile"><UserRound size={20} aria-hidden="true" /></span>
          <div>
            <strong>{name || 'Add your name'}</strong>
            <span>{phone || 'Add a contact number'}</span>
            <p>{address || (requiresAddress ? 'Add a delivery address' : 'No address needed for shop pickup')}</p>
          </div>
          {name && phone && (!requiresAddress || address) ? (
            <span className="checkout-complete"><Check size={13} aria-hidden="true" /> Complete</span>
          ) : null}
        </div>
      )}
    </section>
  );
}

interface DeliveryCardProps {
  value: CheckoutDeliveryOption | null;
  shopAddress: string;
  vehicleLabel: string;
  itemCount: number;
  totalKg: number | null;
  quoteFee: number | null;
  quoteDistanceKm: string | null;
  quoteLoading: boolean;
  quoteError: string | null;
  onChange: (option: CheckoutDeliveryOption) => void;
  onRetryQuote: () => void;
}

export function DeliveryCard({
  value,
  shopAddress,
  vehicleLabel,
  itemCount,
  totalKg,
  quoteFee,
  quoteDistanceKm,
  quoteLoading,
  quoteError,
  onChange,
  onRetryQuote,
}: DeliveryCardProps) {
  return (
    <section className="checkout-card" aria-labelledby="checkout-delivery-title">
      <div className="checkout-card__heading">
        <div>
          <span className="checkout-section-number">02</span>
          <div>
            <h2 id="checkout-delivery-title">Delivery method</h2>
            <p>Choose how you want to receive this artisan order.</p>
          </div>
        </div>
      </div>

      <div className="checkout-delivery-options" role="group" aria-label="Delivery method">
        <button type="button" className={value === 'pickup' ? 'is-selected' : ''} aria-pressed={value === 'pickup'} onClick={() => onChange('pickup')}>
          <span className="checkout-delivery-option__icon"><Store size={20} aria-hidden="true" /></span>
          <span><strong>Pickup</strong><small>Collect from the artisan</small></span>
          <em>Free</em>
        </button>
        <button type="button" className={value === 'courier' ? 'is-selected' : ''} aria-pressed={value === 'courier'} onClick={() => onChange('courier')}>
          <span className="checkout-delivery-option__icon"><Truck size={20} aria-hidden="true" /></span>
          <span><strong>Courier</strong><small>Authoritative quote at checkout</small></span>
          <em>{quoteFee !== null ? fmt(quoteFee) : 'Quote'}</em>
        </button>
      </div>

      {!value ? (
        <div className="checkout-notice checkout-notice--attention" role="status">
          <CircleAlert size={17} aria-hidden="true" /> Select a delivery method to continue.
        </div>
      ) : value === 'pickup' ? (
        <div className="checkout-method-detail">
          <span className="checkout-icon-tile"><MapPin size={20} aria-hidden="true" /></span>
          <div><strong>Artisan pickup point</strong><p>{shopAddress}</p></div>
        </div>
      ) : (
        <div className="checkout-quote" aria-live="polite">
          <div className="checkout-quote__main">
            <span className="checkout-icon-tile"><Truck size={20} aria-hidden="true" /></span>
            <div>
              <strong>{vehicleLabel}</strong>
              <p>{itemCount} {itemCount === 1 ? 'item' : 'items'}{totalKg !== null ? ` · approximately ${totalKg.toFixed(1)} kg` : ''}{quoteDistanceKm ? ` · ${quoteDistanceKm} km` : ''}</p>
            </div>
            {quoteLoading ? <LoaderCircle className="checkout-spin" size={19} aria-label="Calculating courier fee" /> : null}
          </div>
          {quoteError ? (
            <div className="checkout-notice checkout-notice--error">
              <CircleAlert size={17} aria-hidden="true" />
              <span>{quoteError}</span>
              <button type="button" onClick={onRetryQuote}>Retry</button>
            </div>
          ) : quoteFee !== null ? (
            <div className="checkout-notice checkout-notice--success">
              <Check size={16} aria-hidden="true" /> Courier fee confirmed for this checkout: <strong>{fmt(quoteFee)}</strong>
            </div>
          ) : (
            <div className="checkout-notice"><Navigation size={16} aria-hidden="true" /> Add a complete address to calculate the courier fee.</div>
          )}
        </div>
      )}
    </section>
  );
}

interface LocationCardProps {
  hasDropoff: boolean;
  children: ReactNode;
}

export function LocationCard({ hasDropoff, children }: LocationCardProps) {
  return (
    <section className="checkout-card checkout-location" aria-labelledby="checkout-location-title">
      <div className="checkout-card__heading">
        <div>
          <span className="checkout-section-number">03</span>
          <div>
            <h2 id="checkout-location-title">Confirm delivery pin</h2>
            <p>Click the map or drag the delivery marker to refine the exact location.</p>
          </div>
        </div>
      </div>
      <div className="checkout-map">{children}</div>
      <div className="checkout-map__legend">
        <span><i className="checkout-map__dot checkout-map__dot--pickup" /> Artisan pickup</span>
        {hasDropoff ? <span><i className="checkout-map__dot checkout-map__dot--dropoff" /> Delivery address</span> : null}
      </div>
    </section>
  );
}

interface OrderReviewProps {
  items: CartItem[];
  subtotal: number;
  shippingFee: number;
  total: number;
  deliveryOption: CheckoutDeliveryOption | null;
  quoteLoading: boolean;
  hasCourierQuote: boolean;
  placing: boolean;
  disabledReason: string | null;
  onPlaceOrder: () => void;
}

export function OrderReview({
  items,
  subtotal,
  shippingFee,
  total,
  deliveryOption,
  quoteLoading,
  hasCourierQuote,
  placing,
  disabledReason,
  onPlaceOrder,
}: OrderReviewProps) {
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
  const disabled = Boolean(disabledReason) || placing;

  return (
    <aside className="checkout-review" aria-labelledby="checkout-review-title">
      <div className="checkout-review__artisan">
        <span>Order from</span>
        <strong>{items[0]?.shopName || 'Artisan shop'}</strong>
      </div>
      <div className="checkout-review__heading">
        <div><PackageCheck size={19} aria-hidden="true" /><h2 id="checkout-review-title">Order review</h2></div>
        <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
      </div>
      <div className="checkout-review__items">
        {items.map(item => (
          <article className="checkout-review-line" key={`${item.productId}\v${item.variationId || ''}`}>
            <div className="checkout-review-line__image">
              <img src={item.image} alt="" />
              <span aria-label={`Quantity ${item.qty}`}>{item.qty}</span>
            </div>
            <div className="checkout-review-line__details">
              <strong>{item.productName}</strong>
              {item.variation ? <span>{item.variation}</span> : null}
              <small>{fmt(item.price)} each</small>
            </div>
            <b>{fmt(item.price * item.qty)}</b>
          </article>
        ))}
      </div>
      <dl className="checkout-totals">
        <div><dt>Subtotal</dt><dd>{fmt(subtotal)}</dd></div>
        <div>
          <dt>Shipping</dt>
          <dd className={deliveryOption === 'pickup' ? 'is-free' : ''}>
            {deliveryOption === 'pickup' ? 'Free' : quoteLoading ? 'Calculating…' : hasCourierQuote ? fmt(shippingFee) : '—'}
          </dd>
        </div>
        <div className="checkout-totals__grand"><dt>Total</dt><dd>{fmt(total)}</dd></div>
      </dl>
      <div className="checkout-review__action">
        <button type="button" className="checkout-pay-button" disabled={disabled} onClick={onPlaceOrder}>
          {placing ? <><LoaderCircle className="checkout-spin" size={18} aria-hidden="true" /> Preparing payment…</> : <><CreditCard size={18} aria-hidden="true" /> Continue to secure payment</>}
        </button>
        {disabledReason ? <p className="checkout-disabled-reason" role="status">{disabledReason}</p> : null}
        <p className="checkout-security"><LockKeyhole size={13} aria-hidden="true" /> Payment is encrypted and completed through PayMongo.</p>
      </div>
      <div className="checkout-assurances">
        <span><ShieldCheck size={16} aria-hidden="true" /> Server-verified price and stock</span>
        <span><PackageCheck size={16} aria-hidden="true" /> Only these items will be purchased</span>
      </div>
    </aside>
  );
}

interface LocationDialogProps {
  address: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function LocationDialog({ address, onCancel, onConfirm }: LocationDialogProps) {
  return (
    <div className="checkout-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) onCancel(); }}>
      <div className="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-location-dialog-title">
        <span className="checkout-dialog__icon"><MapPin size={22} aria-hidden="true" /></span>
        <h2 id="checkout-location-dialog-title">Use this delivery location?</h2>
        <p>The courier will use the selected pin and this matching address.</p>
        <address>{address}</address>
        <div className="checkout-dialog__actions">
          <button type="button" className="checkout-secondary-button" onClick={onCancel}>Keep current pin</button>
          <button type="button" className="checkout-primary-button checkout-primary-button--compact" onClick={onConfirm}>Use this location</button>
        </div>
      </div>
    </div>
  );
}

interface MobileCheckoutBarProps {
  total: number;
  placing: boolean;
  disabledReason: string | null;
  onPlaceOrder: () => void;
}

export function MobileCheckoutBar({ total, placing, disabledReason, onPlaceOrder }: MobileCheckoutBarProps) {
  return (
    <div className="checkout-mobile-bar" aria-label="Checkout payment summary">
      <div><span>Total</span><strong>{fmt(total)}</strong></div>
      <button type="button" disabled={Boolean(disabledReason) || placing} onClick={onPlaceOrder}>
        {placing ? 'Preparing…' : 'Continue to payment'}
      </button>
    </div>
  );
}

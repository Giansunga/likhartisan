import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { getCart, removeFromCart, setCart } from '../data/store';
import { supabase } from '../lib/supabase';
import type { CartItem } from '../types';
import { fmt } from '../lib/utils';
import { geocodeAddress } from '../lib/geocoder';

const PAYMONGO_API_URL = import.meta.env.VITE_PAYMONGO_API_URL || 'http://localhost:3001';
const DEFAULT_PICKUP_ADDRESS = 'Santo Tomas, Pampanga, Philippines';

// Lalamove vehicle tiers (smallest to largest) for PH market
const VEHICLE_TIERS = [
  { serviceType: 'MOTORCYCLE', label: 'Motorcycle', maxL: 50, maxW: 40, maxH: 50, maxKg: 20 },
  { serviceType: 'SEDAN', label: 'Sedan', maxL: 100, maxW: 60, maxH: 70, maxKg: 200 },
  { serviceType: 'MPV', label: 'Subcompact SUV', maxL: 150, maxW: 120, maxH: 100, maxKg: 300 },
  { serviceType: 'SMALL_VAN', label: '7-Seater SUV / Small Van', maxL: 210, maxW: 120, maxH: 110, maxKg: 600 },
  { serviceType: 'PICKUP', label: 'Pickup', maxL: 270, maxW: 150, maxH: 50, maxKg: 800 },
  { serviceType: 'VAN', label: 'L300 / Cargo Van', maxL: 210, maxW: 120, maxH: 120, maxKg: 1000 },
  { serviceType: '1000KG_FB', label: 'FB Van', maxL: 300, maxW: 170, maxH: 170, maxKg: 2000 },
  { serviceType: '2000KG_ALUMINUM', label: 'Aluminum Van', maxL: 300, maxW: 170, maxH: 170, maxKg: 2000 },
  { serviceType: '3000KG', label: '3-Ton Truck', maxL: 430, maxW: 180, maxH: 210, maxKg: 3000 },
  { serviceType: '5000KG', label: '5-Ton Truck', maxL: 430, maxW: 180, maxH: 210, maxKg: 5000 },
  { serviceType: '7000KG', label: '7-Ton Truck', maxL: 640, maxW: 200, maxH: 240, maxKg: 7000 },
  { serviceType: '12000KG', label: '10-Wheel Truck', maxL: 1000, maxW: 240, maxH: 230, maxKg: 12000 },
];

function parseDimensionToCm(dim: string): number {
  if (!dim) return 0;
  const s = dim.toLowerCase().trim();
  const xMatch = s.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (xMatch) return parseFloat(xMatch[1]) * 2.54;
  const cmMatch = s.match(/([\d.]+)\s*cm/);
  if (cmMatch) return parseFloat(cmMatch[1]);
  const inMatch = s.match(/([\d.]+)\s*(?:\"|in)/);
  if (inMatch) return parseFloat(inMatch[1]) * 2.54;
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

function estimateWeight(lCm: number, wCm: number, hCm: number): number {
  if (lCm <= 0 || wCm <= 0 || hCm <= 0) return 2;
  const volumeCm3 = lCm * wCm * hCm * 0.6;
  return Math.max(1, (volumeCm3 * 2.5) / 1000);
}

function groupByShop(items: CartItem[]): Record<string, CartItem[]> {
  return items.reduce((acc, item) => {
    (acc[item.shopName] = acc[item.shopName] || []).push(item);
    return acc;
  }, {} as Record<string, CartItem[]>);
}

export default function CartPage() {
  const navigate = useNavigate();
  useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });
  const [items, setItems] = useState<CartItem[]>(getCart);
  const [selected, setSelected] = useState<Set<string>>(new Set(items.map(i => `${i.productId}\v${i.variationId || ''}`)));
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'courier' | null>(null);
  const [lalamoveQuote, setLalamoveQuote] = useState<any>(null);
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_TIERS[0]);
  const [userAddress, setUserAddress] = useState('');
  const [shopAddress, setShopAddress] = useState(DEFAULT_PICKUP_ADDRESS);

  const shops = groupByShop(items);
  const selectedItems = useMemo(() => items.filter(i => selected.has(`${i.productId}\v${i.variationId || ''}`)), [items, selected]);
  const itemCount = selectedItems.reduce((s, i) => s + i.qty, 0);
  const subtotal = selectedItems.reduce((s, i) => s + i.price * i.qty, 0);
  const shippingFee = deliveryOption === 'courier' ? (lalamoveQuote?.priceBreakdown?.total ? parseFloat(lalamoveQuote.priceBreakdown.total) : 0) : 0;
  const shipping = deliveryOption === 'pickup' ? 0 : shippingFee;
  const total = subtotal + shipping;
  const allSelected = items.length > 0 && items.every(i => selected.has(`${i.productId}\v${i.variationId || ''}`));

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate('/', { replace: true });
      else {
        const meta = session.user.user_metadata || {};
        if (meta.address) setUserAddress(meta.address);
      }
    });
  }, [navigate]);

  // Fetch shop address from DB
  useEffect(() => {
    async function fetchShopAddress() {
      if (items.length === 0) return;
      const shopId = items[0].shopId;
      if (!shopId) return;
      const { data } = await supabase.from('shops').select('location').eq('id', shopId).single();
      if (data?.location) setShopAddress(data.location);
    }
    fetchShopAddress();
  }, [items]);

  // Auto-select vehicle based on cart dimensions
  useEffect(() => {
    async function calcVehicle() {
      if (selectedItems.length === 0) return;
      const varIds = selectedItems.filter(i => i.variationId).map(i => i.variationId!);
      let variations: Record<string, { dimensions: string; height: string }> = {};
      if (varIds.length > 0) {
        const { data } = await supabase.from('product_variations').select('id, dimensions, height').in('id', varIds);
        if (data) data.forEach((v: any) => { variations[v.id] = { dimensions: v.dimensions || '', height: v.height || '' }; });
      }
      let totalVolumeCm3 = 0, totalKg = 0;
      selectedItems.forEach(item => {
        const v = item.variationId ? variations[item.variationId] : null;
        const parts = (v?.dimensions || '').toLowerCase().split('x').map(s => parseDimensionToCm(s.trim()));
        const l = parts[0] || 0, w = parts[1] || parts[0] || 0;
        const h = parseDimensionToCm(v?.height || '') || 30;
        totalVolumeCm3 += l * w * h * item.qty;
        totalKg += estimateWeight(l, w, h) * item.qty;
      });
      const sel = VEHICLE_TIERS.find(v => totalVolumeCm3 <= v.maxL * v.maxW * v.maxH && totalKg <= v.maxKg) || VEHICLE_TIERS[VEHICLE_TIERS.length - 1];
      setSelectedVehicle(sel);
    }
    calcVehicle();
  }, [selectedItems]);

  // Fetch Lalamove quote when courier selected
  useEffect(() => {
    async function fetchQuote() {
      if (deliveryOption !== 'courier' || !userAddress || !shopAddress) { setLalamoveQuote(null); return; }
      setLalamoveLoading(true);
      try {
        // Geocode pickup and dropoff addresses via frontend
        let pickupCoords = null;
        let dropoffCoords = null;
        try {
          const [pickupGeo, dropoffGeo] = await Promise.all([
            geocodeAddress(shopAddress),
            geocodeAddress(userAddress),
          ]);
          if (pickupGeo) pickupCoords = pickupGeo;
          if (dropoffGeo) dropoffCoords = dropoffGeo;
        } catch (err) {
          console.error('Geocoding error:', err);
        }

        const res = await fetch(`${PAYMONGO_API_URL}/api/lalamove/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pickupAddress: shopAddress, dropoffAddress: userAddress, serviceType: selectedVehicle.serviceType, pickupCoords, dropoffCoords }),
        });
        const data = await res.json();
        if (res.ok) setLalamoveQuote(data);
        else setLalamoveQuote(null);
      } catch { setLalamoveQuote(null); }
      finally { setLalamoveLoading(false); }
    }
    fetchQuote();
  }, [deliveryOption, userAddress, shopAddress, selectedVehicle]);

  function toggleProduct(productId: string, variationId?: string) {
    const key = `${productId}\v${variationId || ''}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleShop(shopName: string) {
    const shopItems = shops[shopName] || [];
    const shopAllSelected = shopItems.every(i => selected.has(`${i.productId}\v${i.variationId || ''}`));
    setSelected(prev => {
      const next = new Set(prev);
      shopItems.forEach(i => {
        const key = `${i.productId}\v${i.variationId || ''}`;
        if (shopAllSelected) next.delete(key);
        else next.add(key);
      });
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map(i => `${i.productId}\v${i.variationId || ''}`)));
    }
  }

  function handleQty(productId: string, variationId: string | undefined, delta: number) {
    const updated = items.map(i => {
      if (i.productId === productId && (i.variationId || '') === (variationId || '')) {
        const newQty = i.qty + delta;
        return newQty <= 0 ? null : { ...i, qty: newQty };
      }
      return i;
    }).filter(Boolean) as CartItem[];
    setCart(updated);
    setItems(updated);
  }

  function handleRemove(productId: string, variationId?: string) {
    removeFromCart(productId, variationId);
    const updated = getCart();
    setItems(updated);
    const key = `${productId}\v${variationId || ''}`;
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function handleRemoveSelected() {
    selectedItems.forEach(i => removeFromCart(i.productId, i.variationId));
    const updated = getCart();
    setItems(updated);
    setSelected(new Set());
  }

  return (
    <div style={{ background: 'var(--bg-secondary)', minHeight: '100vh', paddingTop: 'calc(var(--nav-height) + 20px)', paddingBottom: '100px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <div style={{ background: 'var(--bg-primary)', borderRadius: '0 0 2px 2px', padding: '18px 24px', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-secondary)' }}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>Shopping Cart</h1>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{items.length} item(s) in cart</span>
        </div>

        {items.length === 0 ? (
          <div style={{ background: 'var(--bg-primary)', borderRadius: '2px', padding: '80px 20px', textAlign: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="1.5" style={{ width: 64, height: 64, margin: '0 auto 16px', opacity: 0.55 }}>
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            <p style={{ fontSize: '1rem', color: 'var(--text-light)', marginBottom: '24px' }}>Your cart is empty</p>
            <Link to="/gallery" style={{
              display: 'inline-block', background: 'var(--accent-color)', color: '#fff',
              padding: '12px 40px', borderRadius: '2px', fontWeight: 600, fontSize: '0.95rem',
              textDecoration: 'none', transition: 'background 0.2s'
            }}>
              Continue Shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '12px', alignItems: 'flex-start' }}>
            {/* Left: Cart Items */}
            <div>
              {/* Select All Bar */}
              <div style={{
                background: 'var(--bg-primary)', borderRadius: '2px', padding: '14px 20px', marginBottom: '12px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>Select All ({items.length} items)</span>
                </div>
                {selectedItems.length > 0 && (
                  <button onClick={handleRemoveSelected} style={{
                    background: 'none', border: 'none', color: 'var(--text-light)', fontSize: '0.85rem',
                    cursor: 'pointer', padding: '4px 8px'
                  }}>
                    Delete
                  </button>
                )}
              </div>

              {/* Shop Groups */}
              {Object.entries(shops).map(([shopName, shopItems]) => {
                const shopAllChecked = shopItems.every(i => selected.has(`${i.productId}\v${i.variationId || ''}`));
                return (
                  <div key={shopName} style={{ background: 'var(--bg-primary)', borderRadius: '2px', marginBottom: '12px', overflow: 'hidden' }}>
                    {/* Shop Header */}
                    <div style={{
                      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px',
                      borderBottom: '1px solid var(--bg-secondary)'
                    }}>
                      <input type="checkbox" checked={shopAllChecked} onChange={() => toggleShop(shopName)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)' }} />
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>{shopName}</span>
                    </div>

                    {/* Product Rows */}
                    {shopItems.map(item => (
                      <div key={`${item.productId}\v${item.variationId || ''}`} style={{
                        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                        borderBottom: '1px solid var(--bg-secondary)'
                      }}>
                        {/* Checkbox */}
                        <input type="checkbox" checked={selected.has(`${item.productId}\v${item.variationId || ''}`)}
                          onChange={() => toggleProduct(item.productId, item.variationId)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary-color)', flexShrink: 0 }} />

                        {/* Product Image */}
                        <Link to={`/product/${item.productId}`} style={{ flexShrink: 0 }}>
                          <img src={item.image} alt={item.productName}
                            style={{ width: '90px', height: '90px', borderRadius: '4px', objectFit: 'cover', border: '1px solid var(--bg-secondary)' }} />
                        </Link>

                        {/* Product Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Link to={`/product/${item.productId}`} style={{ textDecoration: 'none' }}>
                            <p style={{ fontWeight: 600, color: 'var(--text-dark)', fontSize: '0.92rem', marginBottom: '4px', lineHeight: 1.4 }}>
                              {item.productName}
                            </p>
                          </Link>
                          {item.variation && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-light)', marginBottom: '2px' }}>{item.variation}</p>
                          )}
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>{item.shopName}</p>
                        </div>

                        {/* Unit Price */}
                        <div style={{ width: '100px', textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent-color)' }}>{fmt(item.price)}</span>
                        </div>

                        {/* Quantity Controls */}
                        <div style={{
                          display: 'flex', alignItems: 'center', border: '1px solid var(--bg-tertiary)', borderRadius: '2px',
                          flexShrink: 0, overflow: 'hidden'
                        }}>
                          <button onClick={() => handleQty(item.productId, item.variationId, -1)} style={{
                            width: '32px', height: '32px', border: 'none', background: 'var(--bg-secondary)',
                            cursor: 'pointer', fontSize: '1rem', color: 'var(--text-muted)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s'
                          }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}>−</button>
                          <span style={{ width: '40px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)', borderLeft: '1px solid var(--bg-tertiary)', borderRight: '1px solid var(--bg-tertiary)', lineHeight: '32px' }}>
                            {item.qty}
                          </span>
                          <button onClick={() => handleQty(item.productId, item.variationId, 1)} style={{
                            width: '32px', height: '32px', border: 'none', background: 'var(--bg-secondary)',
                            cursor: 'pointer', fontSize: '1rem', color: 'var(--text-muted)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s'
                          }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-secondary)'}>+</button>
                        </div>

                        {/* Subtotal */}
                        <div style={{ width: '100px', textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-color)' }}>{fmt(item.price * item.qty)}</span>
                        </div>

                        {/* Delete */}
                        <button onClick={() => handleRemove(item.productId, item.variationId)} style={{
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)',
                          fontSize: '1.1rem', padding: '4px 8px', flexShrink: 0, transition: 'color 0.15s'
                        }} onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-color)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-light)'}>
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Right: Order Summary */}
            <div style={{ position: 'sticky', top: 'calc(var(--nav-height) + 20px)' }}>
              <div style={{ background: 'var(--bg-primary)', borderRadius: '2px', padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--bg-secondary)' }}>
                  Order Summary
                </h3>

                {/* Delivery Options */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery Method</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button onClick={() => setDeliveryOption('pickup')} style={{
                      padding: '10px', borderRadius: '8px', border: deliveryOption === 'pickup' ? '2px solid var(--primary-color)' : '1px solid #E8E0D8',
                      background: deliveryOption === 'pickup' ? '#FFF8F0' : '#fff', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: deliveryOption === 'pickup' ? 'var(--primary-color)' : 'var(--text-dark)' }}>Pickup</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#16A34A' }}>Free</span>
                      </div>
                    </button>
                    <button onClick={() => setDeliveryOption('courier')} style={{
                      padding: '10px', borderRadius: '8px', border: deliveryOption === 'courier' ? '2px solid var(--primary-color)' : '1px solid #E8E0D8',
                      background: deliveryOption === 'courier' ? '#FFF8F0' : '#fff', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem', color: deliveryOption === 'courier' ? 'var(--primary-color)' : 'var(--text-dark)' }}>Courier</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-dark)' }}>
                          {lalamoveLoading ? '...' : lalamoveQuote ? fmt(shippingFee) : '---'}
                        </span>
                      </div>
                    </button>
                  </div>
                  {deliveryOption === 'courier' && (
                    <div style={{ marginTop: '8px', padding: '6px 10px', background: '#F0FDF4', borderRadius: '6px', border: '1px solid #BBF7D0', fontSize: '0.72rem', color: '#16A34A', fontWeight: 500 }}>
                      {selectedVehicle.label}{lalamoveQuote?.distance ? ` · ${(parseInt(lalamoveQuote.distance.value) / 1000).toFixed(1)} km` : ''}
                    </div>
                  )}
                </div>

                {/* Summary Rows */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Subtotal ({itemCount} item/s)</span>
                  <span style={{ color: 'var(--text-dark)', fontWeight: 500 }}>{fmt(subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.88rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Shipping Fee</span>
                  <span style={{ color: deliveryOption === 'pickup' ? '#16A34A' : 'var(--text-dark)', fontWeight: 500 }}>
                    {deliveryOption === 'pickup' ? 'Free' : deliveryOption === 'courier' ? (lalamoveLoading ? 'Calculating...' : lalamoveQuote ? fmt(shippingFee) : '---') : '---'}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--bg-secondary)', marginTop: '12px', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-dark)', fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-color)' }}>{fmt(total)}</span>
                  </div>
                </div>
              </div>

              {/* Checkout Button */}
              <button onClick={() => navigate('/checkout', { state: { deliveryOption } })} style={{
                width: '100%', marginTop: '12px', background: selectedItems.length > 0 ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                color: '#fff', border: 'none', padding: '14px', borderRadius: '2px',
                fontWeight: 700, fontSize: '1rem', cursor: selectedItems.length > 0 ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s', boxShadow: selectedItems.length > 0 ? '0 2px 8px rgba(193,87,13,0.25)' : 'none'
              }}>
                Checkout ({itemCount})
              </button>

              {/* Trust Badges */}
              <div style={{ marginTop: '16px', padding: '16px', background: 'var(--bg-primary)', borderRadius: '2px', border: '1px solid var(--bg-secondary)' }}>
                {[
                  { icon: '/images/secure_checkout.png', title: 'Secure Checkout', desc: 'Your payment information is safe with us' },
                  { icon: '/images/authentic_artisan.png', title: 'Authentic Artisan Products', desc: 'Every pottery piece is handcrafted by local artisans.' },
                  { icon: '/images/flexible_fulfillment.png', title: 'Flexible Order Fulfillment', desc: 'Choose delivery at your convenience.' },
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: i < 2 ? '14px' : 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <img src={t.icon} alt={t.title} style={{ width: '36px', height: '36px', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>{t.title}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-light)', margin: 0, lineHeight: 1.4 }}>{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

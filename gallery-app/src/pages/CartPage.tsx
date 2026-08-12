import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJsApiLoader } from '@react-google-maps/api';
import { toast } from 'sonner';
import { ArrowLeft, Info, Trash2 } from 'lucide-react';
import { getCart, setCart } from '../data/store';
import { supabase } from '../lib/supabase';
import type { CartCheckoutDraft, CartItem } from '../types';
import { geocodeAddress } from '../lib/geocoder';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE } from '../lib/api';
import {
  getCartLineKey,
  getCartShopKey,
  markCartCheckoutAuthPending,
  writeCartCheckoutDraft,
} from '../lib/cartCheckout';
import {
  CartSummary,
  EmptyCartState,
  ShopCartGroup,
  type CartLineAvailability,
} from '../components/cart/CartComponents';
import { fmt } from '../lib/utils';
import './CartPage.css';

const VEHICLE_TIERS = [
  { serviceType: 'MOTORCYCLE', label: 'Motorcycle', maxL: 50, maxW: 40, maxH: 50, maxKg: 20 },
  { serviceType: 'SEDAN', label: 'Sedan', maxL: 100, maxW: 60, maxH: 70, maxKg: 200 },
  { serviceType: 'MPV', label: 'Subcompact SUV', maxL: 150, maxW: 120, maxH: 100, maxKg: 300 },
  { serviceType: 'SMALL_VAN', label: 'Small Van', maxL: 210, maxW: 120, maxH: 110, maxKg: 600 },
  { serviceType: 'PICKUP', label: 'Pickup', maxL: 270, maxW: 150, maxH: 50, maxKg: 800 },
  { serviceType: 'VAN', label: 'Cargo Van', maxL: 210, maxW: 120, maxH: 120, maxKg: 1000 },
  { serviceType: '1000KG_FB', label: 'FB Van', maxL: 300, maxW: 170, maxH: 170, maxKg: 2000 },
  { serviceType: '3000KG', label: '3-Ton Truck', maxL: 430, maxW: 180, maxH: 210, maxKg: 3000 },
  { serviceType: '5000KG', label: '5-Ton Truck', maxL: 430, maxW: 180, maxH: 210, maxKg: 5000 },
  { serviceType: '7000KG', label: '7-Ton Truck', maxL: 640, maxW: 200, maxH: 240, maxKg: 7000 },
  { serviceType: '12000KG', label: '10-Wheel Truck', maxL: 1000, maxW: 240, maxH: 230, maxKg: 12000 },
] as const;

interface CatalogLineState extends CartLineAvailability {
  dimensions: string;
  height: string;
}

interface DeliveryEstimate {
  quotationId?: string;
  fee: number;
  serviceType: string;
  vehicleLabel: string;
  coordinates: { lat: number; lng: number };
  quotedAt: string;
}

interface ProductCatalogRow {
  id: string;
  name: string;
  price: number;
  image: string;
  shop_id?: string;
  shop_name?: string;
  stock: number;
  status: string;
  dimensions?: string;
  height?: string;
}

interface VariationCatalogRow {
  id: string;
  product_id: string;
  price?: number | null;
  stock: number;
  dimensions?: string;
  height?: string;
}

interface ShopLocationRow {
  id: string;
  location?: string;
}

function parseDimensionToCm(value: string): number {
  if (!value) return 0;
  const normalized = value.toLowerCase().trim();
  const cm = normalized.match(/([\d.]+)\s*cm/);
  if (cm) return Number(cm[1]);
  const inches = normalized.match(/([\d.]+)\s*(?:"|in)/);
  if (inches) return Number(inches[1]) * 2.54;
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function initialShopSelection(items: CartItem[]): { shopKey: string | null; lineKeys: Set<string> } {
  if (items.length === 0) return { shopKey: null, lineKeys: new Set() };
  const shopKey = getCartShopKey(items[0]);
  return {
    shopKey,
    lineKeys: new Set(items.filter(item => getCartShopKey(item) === shopKey).map(getCartLineKey)),
  };
}

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLoaded: mapsLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  });
  const [items, setItems] = useState<CartItem[]>(getCart);
  const [initialSelection] = useState(() => initialShopSelection(items));
  const [activeShopKey, setActiveShopKey] = useState<string | null>(initialSelection.shopKey);
  const [selected, setSelected] = useState<Set<string>>(initialSelection.lineKeys);
  const [catalog, setCatalog] = useState<Record<string, CatalogLineState>>({});
  const [validationStatus, setValidationStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [shopAddresses, setShopAddresses] = useState<Record<string, string>>({});
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'courier' | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<DeliveryEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');

  const effectiveAddress = address ?? user?.user_metadata?.address ?? '';

  const cartIdentity = useMemo(() => items.map(getCartLineKey).sort().join('|'), [items]);

  useEffect(() => {
    let cancelled = false;

    async function validateCart() {
      if (items.length === 0) {
        setCatalog({});
        setValidationStatus('ready');
        return;
      }
      setValidationStatus('loading');

      const productIds = [...new Set(items.map(item => item.productId))];
      const variationIds = [...new Set(items.map(item => item.variationId).filter(Boolean) as string[])];
      const shopIds = [...new Set(items.map(item => item.shopId).filter(Boolean) as string[])];

      try {
        const [productsResult, variationsResult, shopsResult] = await Promise.all([
          supabase.from('products')
            .select('id, name, price, image, shop_id, shop_name, stock, status, dimensions, height')
            .in('id', productIds),
          variationIds.length
            ? supabase.from('product_variations').select('id, product_id, price, stock, dimensions, height').in('id', variationIds)
            : Promise.resolve({ data: [], error: null }),
          shopIds.length
            ? supabase.from('shops').select('id, location').in('id', shopIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (productsResult.error || variationsResult.error || shopsResult.error) throw new Error('Cart validation failed');
        if (cancelled) return;

        const productRows = (productsResult.data || []) as ProductCatalogRow[];
        const variationRows = (variationsResult.data || []) as VariationCatalogRow[];
        const shopRows = (shopsResult.data || []) as ShopLocationRow[];
        const productMap = new Map(productRows.map(product => [product.id, product]));
        const variationMap = new Map(variationRows.map(variation => [variation.id, variation]));
        const nextCatalog: Record<string, CatalogLineState> = {};
        let pricesChanged = false;

        const revisedItems = items.map(item => {
          const product = productMap.get(item.productId);
          const variation = item.variationId ? variationMap.get(item.variationId) : null;
          const stock = Number(item.variationId ? variation?.stock : product?.stock) || 0;
          const price = Number(variation?.price ?? product?.price ?? item.price);
          const priceChanged = Boolean(product) && price !== item.price;
          const available = Boolean(product)
            && product?.status === 'active'
            && (!item.variationId || Boolean(variation))
            && stock > 0;
          const key = getCartLineKey(item);

          nextCatalog[key] = {
            status: 'ready',
            stock,
            available,
            priceChanged,
            dimensions: variation?.dimensions || product?.dimensions || '',
            height: variation?.height || product?.height || '',
          };

          if (!priceChanged) return item;
          pricesChanged = true;
          return { ...item, price };
        });

        setCatalog(nextCatalog);
        setShopAddresses(Object.fromEntries(shopRows.map(shop => [shop.id, shop.location || ''])));
        setValidationStatus('ready');
        if (pricesChanged) {
          setCart(revisedItems);
          setItems(revisedItems);
        }
      } catch {
        if (!cancelled) setValidationStatus('error');
      }
    }

    validateCart();
    return () => { cancelled = true; };
    // Revalidate when lines enter or leave the cart; quantity and price changes do not need another catalog request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartIdentity]);

  const groups = useMemo(() => {
    const grouped = new Map<string, { key: string; name: string; items: CartItem[] }>();
    for (const item of items) {
      const key = getCartShopKey(item);
      const group = grouped.get(key) || { key, name: item.shopName, items: [] };
      group.items.push(item);
      grouped.set(key, group);
    }
    return [...grouped.values()];
  }, [items]);

  const getAvailability = (item: CartItem): CatalogLineState => {
    const state = catalog[getCartLineKey(item)];
    if (state) return state;
    return {
      status: validationStatus,
      stock: null,
      available: validationStatus !== 'ready',
      dimensions: '',
      height: '',
    };
  };

  const resolvedActiveShopKey = activeShopKey && groups.some(group => group.key === activeShopKey)
    ? activeShopKey
    : groups[0]?.key || null;
  const effectiveSelected = useMemo(() => {
    if (validationStatus !== 'ready') return selected;
    return new Set([...selected].filter(key => catalog[key]?.available));
  }, [catalog, selected, validationStatus]);
  const activeGroup = groups.find(group => group.key === resolvedActiveShopKey);
  const selectedItems = useMemo(
    () => items.filter(item => getCartShopKey(item) === resolvedActiveShopKey && effectiveSelected.has(getCartLineKey(item))),
    [effectiveSelected, items, resolvedActiveShopKey],
  );
  const itemCount = selectedItems.reduce((sum, item) => sum + item.qty, 0);
  const subtotal = selectedItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const selectedVehicle = useMemo(() => {
    let volume = 0;
    let weight = 0;
    for (const item of selectedItems) {
      const info = catalog[getCartLineKey(item)];
      const parts = (info?.dimensions || '').split(/x/i).map(part => parseDimensionToCm(part));
      const length = parts[0] || 30;
      const width = parts[1] || length;
      const height = parseDimensionToCm(info?.height || '') || 30;
      volume += length * width * height * item.qty;
      // Finished pottery is hollow; approximate clay as 5% of its bounding volume.
      weight += Math.max(1, (length * width * height * 0.05 * 2.5) / 1000) * item.qty;
    }
    return VEHICLE_TIERS.find(tier => volume <= tier.maxL * tier.maxW * tier.maxH && weight <= tier.maxKg)
      || VEHICLE_TIERS[VEHICLE_TIERS.length - 1];
  }, [catalog, selectedItems]);

  function invalidateEstimate() {
    setEstimate(null);
    setEstimateError('');
  }

  function commitItems(nextItems: CartItem[]) {
    setCart(nextItems);
    setItems(nextItems);
    invalidateEstimate();
    if (resolvedActiveShopKey && nextItems.some(item => getCartShopKey(item) === resolvedActiveShopKey)) return;
    const next = initialShopSelection(nextItems);
    setActiveShopKey(next.shopKey);
    setSelected(next.lineKeys);
  }

  function toggleShop(shopKey: string) {
    const group = groups.find(candidate => candidate.key === shopKey);
    if (!group) return;
    const availableKeys = group.items.filter(item => getAvailability(item).available).map(getCartLineKey);
    const allSelected = resolvedActiveShopKey === shopKey && availableKeys.length > 0 && availableKeys.every(key => effectiveSelected.has(key));
    if (resolvedActiveShopKey && resolvedActiveShopKey !== shopKey) toast.info('Checkout is limited to one shop at a time. Your selection has been switched.');
    invalidateEstimate();
    setActiveShopKey(shopKey);
    setSelected(new Set(allSelected ? [] : availableKeys));
  }

  function toggleItem(item: CartItem) {
    if (!getAvailability(item).available) return;
    const shopKey = getCartShopKey(item);
    const key = getCartLineKey(item);
    invalidateEstimate();
    if (shopKey !== resolvedActiveShopKey) {
      setActiveShopKey(shopKey);
      setSelected(new Set([key]));
      toast.info('Checkout is limited to one shop at a time. Your selection has been switched.');
      return;
    }
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function changeQuantity(item: CartItem, delta: number) {
    const info = getAvailability(item);
    const nextQuantity = item.qty + delta;
    if (nextQuantity < 1 || (info.stock !== null && nextQuantity > info.stock)) return;
    commitItems(items.map(current => getCartLineKey(current) === getCartLineKey(item) ? { ...current, qty: nextQuantity } : current));
  }

  function removeItem(item: CartItem) {
    const key = getCartLineKey(item);
    commitItems(items.filter(current => getCartLineKey(current) !== key));
    setSelected(current => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    toast.success(`${item.productName} removed from your cart.`);
  }

  function removeSelectedItems() {
    const keys = [...effectiveSelected];
    if (keys.length === 0) return;
    const keySet = new Set(keys);
    commitItems(items.filter(item => !keySet.has(getCartLineKey(item))));
    setSelected(new Set());
    toast.success(`${keys.length} ${keys.length === 1 ? 'item' : 'items'} removed from your cart.`);
  }

  async function requestEstimate() {
    if (deliveryOption !== 'courier' || !activeGroup || selectedItems.length === 0) return;
    const shopAddress = activeGroup.items[0]?.shopId ? shopAddresses[activeGroup.items[0].shopId!] : '';
    if (!shopAddress) {
      setEstimateError('This artisan has not provided a pickup address yet. Delivery can still be arranged at checkout.');
      return;
    }
    if (!mapsLoaded) {
      setEstimateError('The address service is still loading. Please try again in a moment.');
      return;
    }

    setEstimateLoading(true);
    setEstimateError('');
    try {
      const [pickupCoords, dropoffCoords] = await Promise.all([
        geocodeAddress(shopAddress),
        geocodeAddress(effectiveAddress.trim()),
      ]);
      if (!pickupCoords || !dropoffCoords) throw new Error('Address not found');

      const response = await fetch(`${API_BASE}/api/lalamove/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: shopAddress,
          dropoffAddress: effectiveAddress.trim(),
          serviceType: selectedVehicle.serviceType,
          pickupCoords,
          dropoffCoords,
        }),
      });
      const result = await response.json();
      const fee = Number.parseFloat(result?.priceBreakdown?.total);
      if (!response.ok || !Number.isFinite(fee)) throw new Error('Quote unavailable');
      setEstimate({
        quotationId: result.quotationId,
        fee,
        serviceType: selectedVehicle.serviceType,
        vehicleLabel: selectedVehicle.label,
        coordinates: dropoffCoords,
        quotedAt: new Date().toISOString(),
      });
    } catch {
      setEstimateError('A courier estimate is unavailable right now. You can continue and try again at checkout.');
    } finally {
      setEstimateLoading(false);
    }
  }

  function beginCheckout() {
    if (!resolvedActiveShopKey || selectedItems.length === 0) return;
    const draft: CartCheckoutDraft = {
      version: 1,
      source: 'cart',
      shopId: resolvedActiveShopKey,
      lineKeys: selectedItems.map(getCartLineKey),
      ...(deliveryOption ? { deliveryOption } : {}),
      ...(effectiveAddress.trim() ? {
        destination: {
          address: effectiveAddress.trim(),
          ...(estimate ? { coordinates: estimate.coordinates } : {}),
        },
      } : {}),
      ...(estimate ? {
        estimate: {
          quotationId: estimate.quotationId,
          fee: estimate.fee,
          serviceType: estimate.serviceType,
          quotedAt: estimate.quotedAt,
        },
      } : {}),
    };
    writeCartCheckoutDraft(draft);
    if (user) {
      navigate('/checkout', { state: { checkoutDraft: draft } });
      return;
    }
    markCartCheckoutAuthPending();
    window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } }));
  }

  if (items.length === 0) {
    return <main className="cart-page cart-page--empty"><EmptyCartState /></main>;
  }

  const estimatedShipping = deliveryOption === 'pickup' ? 0 : estimate?.fee || 0;

  return (
    <main className="cart-page" id="main-content">
      <div className="cart-shell">
        <header className="cart-header">
          <button type="button" className="cart-header__back" onClick={() => navigate('/gallery')}>
            <ArrowLeft size={17} aria-hidden="true" /> Continue shopping
          </button>
          <div>
            <span className="cart-header__eyebrow">Your artisan collection</span>
            <h1>Shopping cart</h1>
            <p>{items.reduce((sum, item) => sum + item.qty, 0)} pieces from {groups.length} {groups.length === 1 ? 'artisan' : 'artisans'}</p>
          </div>
        </header>

        <div className="cart-layout">
          <div className="cart-content">
            <div className="cart-selection-bar">
              <div><Info size={17} aria-hidden="true" /><span>Choose pieces from one artisan for each checkout.</span></div>
              {effectiveSelected.size > 0 ? (
                <button type="button" onClick={removeSelectedItems}><Trash2 size={16} aria-hidden="true" /> Remove selected</button>
              ) : null}
            </div>

            {groups.map(group => (
              <ShopCartGroup
                key={group.key}
                shopKey={group.key}
                shopName={group.name}
                items={group.items}
                activeShopKey={resolvedActiveShopKey}
                selected={effectiveSelected}
                getAvailability={getAvailability}
                onToggleShop={toggleShop}
                onToggleItem={toggleItem}
                onQuantityChange={changeQuantity}
                onRemove={removeItem}
              />
            ))}
          </div>

          <div className="cart-sidebar">
            <CartSummary
              shopName={activeGroup?.name}
              itemCount={itemCount}
              subtotal={subtotal}
              deliveryOption={deliveryOption}
              address={effectiveAddress}
              estimateFee={estimate?.fee ?? null}
              estimateVehicle={estimate?.vehicleLabel}
              estimateLoading={estimateLoading}
              estimateError={estimateError}
              onDeliveryOptionChange={option => { invalidateEstimate(); setDeliveryOption(option); }}
              onAddressChange={value => { invalidateEstimate(); setAddress(value); }}
              onEstimate={requestEstimate}
              onCheckout={beginCheckout}
            />
          </div>
        </div>
      </div>

      <div className="cart-mobile-bar" aria-label="Cart checkout summary">
        <div><span>Estimated total</span><strong>{fmt(subtotal + estimatedShipping)}</strong></div>
        <button type="button" disabled={itemCount === 0} onClick={beginCheckout}>Checkout ({itemCount})</button>
      </div>
    </main>
  );
}

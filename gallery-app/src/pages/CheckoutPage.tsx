import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { toast } from 'sonner';
import { getCart } from '../data/store';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { geocodeAddress, reverseGeocodeCoords } from '../lib/geocoder';
import { API_BASE } from '../lib/api';
import type { CartCheckoutDraft, CartItem } from '../types';
import {
  getCartLineKey,
  readCartCheckoutDraft,
  resolveCartDraftItems,
  savePendingPurchase,
} from '../lib/cartCheckout';
import {
  CheckoutHeader,
  ContactCard,
  DeliveryCard,
  LocationCard,
  LocationDialog,
  MobileCheckoutBar,
  OrderReview,
  type CheckoutAddressForm,
  type CheckoutDeliveryOption,
} from '../components/checkout/CheckoutComponents';
import './CheckoutPage.css';

const DEFAULT_PICKUP_ADDRESS = 'Santo Tomas, Pampanga, Philippines';

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
] as const;

interface CheckoutRouteState {
  buyNowItem?: CartItem;
  checkoutDraft?: CartCheckoutDraft;
  deliveryOption?: CheckoutDeliveryOption;
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface LalamoveQuote {
  quotationId?: string;
  priceBreakdown?: { total?: string };
  distance?: { value?: string };
}

interface VariationDimensions {
  id: string;
  dimensions?: string;
  height?: string;
}

interface CartDimensions {
  totalL: number;
  totalW: number;
  totalH: number;
  totalKg: number;
  itemCount: number;
}

function parseDimensionToCm(dimension: string): number {
  if (!dimension) return 0;
  const normalized = dimension.toLowerCase().trim();
  const cmMatch = normalized.match(/([\d.]+)\s*cm/);
  if (cmMatch) return Number.parseFloat(cmMatch[1]);
  const inchMatch = normalized.match(/([\d.]+)\s*(?:"|in)/);
  if (inchMatch) return Number.parseFloat(inchMatch[1]) * 2.54;
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : 0;
}

function estimateWeight(length: number, width: number, height: number): number {
  if (length <= 0 || width <= 0 || height <= 0) return 2;
  // Finished pottery is hollow; approximate clay as 5% of its bounding volume.
  const volume = length * width * height * 0.05;
  return Math.max(1, (volume * 2.5) / 1000);
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const routeState = location.state as CheckoutRouteState | null;
  const buyNowItem = routeState?.buyNowItem;
  const [cartDraft] = useState<CartCheckoutDraft | null>(() => (
    buyNowItem ? null : routeState?.checkoutDraft || readCartCheckoutDraft()
  ));
  const [items] = useState<CartItem[]>(() => (
    buyNowItem
      ? [buyNowItem]
      : resolveCartDraftItems(getCart(), routeState?.checkoutDraft || readCartCheckoutDraft())
  ));
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });

  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAddress, setUserAddress] = useState(() => cartDraft?.destination?.address || '');
  const [editAddress, setEditAddress] = useState(false);
  const [editForm, setEditForm] = useState<CheckoutAddressForm>({
    name: '',
    phone: '',
    address: cartDraft?.destination?.address || '',
  });
  const [deliveryOption, setDeliveryOption] = useState<CheckoutDeliveryOption | null>(
    routeState?.deliveryOption || cartDraft?.deliveryOption || null,
  );
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmMapClick, setConfirmMapClick] = useState<{ lat: number; lng: number; address: string } | null>(null);

  const [lalamoveQuote, setLalamoveQuote] = useState<LalamoveQuote | null>(null);
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [lalamoveError, setLalamoveError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<(typeof VEHICLE_TIERS)[number]>(VEHICLE_TIERS[0]);
  const [cartDimensions, setCartDimensions] = useState<CartDimensions | null>(null);
  const [shopAddress, setShopAddress] = useState(DEFAULT_PICKUP_ADDRESS);
  const [mapCoords, setMapCoords] = useState<{ pickup: Coordinates; dropoff: Coordinates | null }>({
    pickup: { lat: 15.026, lng: 120.691 },
    dropoff: cartDraft?.destination?.coordinates || null,
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.qty, 0), [items]);
  const shippingFee = deliveryOption === 'courier'
    ? Number.parseFloat(lalamoveQuote?.priceBreakdown?.total || '0') || 0
    : 0;
  const total = subtotal + shippingFee;
  const quoteDistanceKm = lalamoveQuote?.distance?.value
    ? (Number.parseFloat(lalamoveQuote.distance.value) / 1000).toFixed(1)
    : null;

  const fetchLalamoveQuote = useCallback(async (
    pickup: string,
    dropoff: string,
    serviceType: string,
    pickupCoordinates: Coordinates,
  ) => {
    if (!pickup || dropoff.trim().length < 5) {
      setLalamoveQuote(null);
      setLalamoveError(null);
      return;
    }

    setLalamoveLoading(true);
    setLalamoveError(null);
    try {
      const dropoffCoordinates = await geocodeAddress(dropoff);
      if (!dropoffCoordinates) throw new Error('Address could not be located');

      const response = await fetch(`${API_BASE}/api/lalamove/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          serviceType,
          pickupCoords: pickupCoordinates,
          dropoffCoords: dropoffCoordinates,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Courier quote unavailable');

      setMapCoords(current => ({ ...current, dropoff: dropoffCoordinates }));
      setLalamoveQuote(data as LalamoveQuote);
    } catch (error) {
      console.error('Lalamove quote error:', error);
      setLalamoveQuote(null);
      setLalamoveError('We could not confirm a courier fee. Check the address and try again.');
    } finally {
      setLalamoveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate('/cart', { replace: true });
  }, [items.length, navigate]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function loadProfile() {
      const metadata = user!.user_metadata || {};
      const name = metadata.name || user!.email || '';
      const phone = metadata.phone || '';
      const address = cartDraft?.destination?.address || metadata.address || '';
      if (cancelled) return;

      setUserName(name);
      setUserPhone(phone);
      setUserAddress(address);
      setEditForm({ name, phone, address });
      setUserId(user!.id);

      if (cartDraft?.destination?.coordinates) {
        setMapCoords(current => ({ ...current, dropoff: cartDraft.destination!.coordinates! }));
      } else if (metadata.address_lat && metadata.address_lng) {
        setMapCoords(current => ({
          ...current,
          dropoff: { lat: metadata.address_lat, lng: metadata.address_lng },
        }));
      } else if (address) {
        const coordinates = await geocodeAddress(address);
        if (coordinates && !cancelled) setMapCoords(current => ({ ...current, dropoff: coordinates }));
      }
    }

    void loadProfile();
    return () => { cancelled = true; };
  }, [cartDraft, user]);

  useEffect(() => {
    const shopId = items[0]?.shopId;
    if (!shopId) return;
    let cancelled = false;

    async function loadShopAddress() {
      const { data } = await supabase.from('shops').select('name, location').eq('id', shopId).single();
      if (data?.location && !cancelled) setShopAddress(data.location);
    }

    void loadShopAddress();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    if (!shopAddress || !isLoaded) return;
    let cancelled = false;

    async function locateShop() {
      const coordinates = await geocodeAddress(shopAddress);
      if (coordinates && !cancelled) setMapCoords(current => ({ ...current, pickup: coordinates }));
    }

    void locateShop();
    return () => { cancelled = true; };
  }, [isLoaded, shopAddress]);

  useEffect(() => {
    let cancelled = false;

    async function calculateVehicle() {
      if (items.length === 0) return;
      const variationIds = items.flatMap(item => item.variationId ? [item.variationId] : []);
      const variations: Record<string, { dimensions: string; height: string }> = {};

      if (variationIds.length > 0) {
        const { data } = await supabase
          .from('product_variations')
          .select('id, dimensions, height')
          .in('id', variationIds);
        (data as VariationDimensions[] | null)?.forEach(variation => {
          variations[variation.id] = {
            dimensions: variation.dimensions || '',
            height: variation.height || '',
          };
        });
      }

      let totalVolume = 0;
      let totalKg = 0;
      let totalQty = 0;
      let longestItem = 0;
      let widestItem = 0;
      let tallestItem = 0;

      for (const item of items) {
        const variation = item.variationId ? variations[item.variationId] : null;
        const parts = (variation?.dimensions || '').split(/x/i).map(part => parseDimensionToCm(part));
        const length = parts[0] || 30;
        const width = parts[1] || length;
        const height = parseDimensionToCm(variation?.height || '') || 30;
        totalVolume += length * width * height * item.qty;
        totalKg += estimateWeight(length, width, height) * item.qty;
        totalQty += item.qty;
        longestItem = Math.max(longestItem, length);
        widestItem = Math.max(widestItem, width);
        tallestItem = Math.max(tallestItem, height);
      }

      const vehicle = VEHICLE_TIERS.find(tier => (
        totalVolume <= tier.maxL * tier.maxW * tier.maxH && totalKg <= tier.maxKg
      )) || VEHICLE_TIERS[VEHICLE_TIERS.length - 1];

      if (!cancelled) {
        setCartDimensions({
          totalL: longestItem,
          totalW: widestItem,
          totalH: tallestItem,
          totalKg,
          itemCount: totalQty,
        });
        setSelectedVehicle(vehicle);
      }
    }

    void calculateVehicle();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    if (deliveryOption === 'courier' && userAddress.trim().length >= 5 && isLoaded) {
      // This effect intentionally synchronizes the authoritative courier quote
      // with the current delivery inputs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchLalamoveQuote(shopAddress, userAddress, selectedVehicle.serviceType, mapCoords.pickup);
    } else {
      setLalamoveQuote(null);
      setLalamoveError(null);
    }
  }, [deliveryOption, fetchLalamoveQuote, isLoaded, mapCoords.pickup, selectedVehicle.serviceType, shopAddress, userAddress]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !isLoaded) return;
    if (mapCoords.dropoff) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(mapCoords.pickup);
      bounds.extend(mapCoords.dropoff);
      map.fitBounds(bounds, 40);
    } else {
      map.panTo(mapCoords.pickup);
      map.setZoom(13);
    }
  }, [isLoaded, mapCoords, mapReady]);

  const handleMarkerDragEnd = useCallback(async (lat: number, lng: number) => {
    const address = await reverseGeocodeCoords(lat, lng);
    if (!address) return;
    setMapCoords(current => ({ ...current, dropoff: { lat, lng } }));
    setUserAddress(address);
    setEditForm(current => ({ ...current, address }));
    if (user) await supabase.auth.updateUser({ data: { address, address_lat: lat, address_lng: lng } });
  }, [user]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const address = await reverseGeocodeCoords(lat, lng);
    setConfirmMapClick({ lat, lng, address: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
  }, []);

  const confirmMapLocation = useCallback(async () => {
    if (!confirmMapClick) return;
    const { lat, lng, address } = confirmMapClick;
    setMapCoords(current => ({ ...current, dropoff: { lat, lng } }));
    setUserAddress(address);
    setEditForm(current => ({ ...current, address }));
    if (user) await supabase.auth.updateUser({ data: { address, address_lat: lat, address_lng: lng } });
    setConfirmMapClick(null);
  }, [confirmMapClick, user]);

  function cancelEditing() {
    setEditForm({ name: userName, phone: userPhone, address: userAddress });
    setEditAddress(false);
  }

  async function saveDetails() {
    const name = editForm.name.trim();
    const phone = editForm.phone.trim();
    const address = editForm.address.trim();
    if (name.length < 2 || phone.length < 7) {
      toast.error('Please provide your full name and a valid phone number.');
      return;
    }
    if (deliveryOption === 'courier' && address.length < 5) {
      toast.error('A complete delivery address is required for courier delivery.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const coordinates = address ? await geocodeAddress(address) : null;
      const updateData: Record<string, string | number> = { name, phone, address };
      if (coordinates) {
        updateData.address_lat = coordinates.lat;
        updateData.address_lng = coordinates.lng;
      }
      const { error } = await supabase.auth.updateUser({ data: updateData });
      if (error) throw error;

      setUserName(name);
      setUserPhone(phone);
      setUserAddress(address);
      if (coordinates) setMapCoords(current => ({ ...current, dropoff: coordinates }));
      setEditAddress(false);
      toast.success('Checkout details updated.');
    } catch (error) {
      console.error('Failed to save checkout details:', error);
      toast.error('Could not save your details. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const disabledReason = useMemo(() => {
    if (!deliveryOption) return 'Select pickup or courier delivery.';
    if (!userId) return 'Loading your account details…';
    if (userName.trim().length < 2 || userPhone.trim().length < 7) return 'Add your full name and phone number.';
    if (deliveryOption === 'courier' && userAddress.trim().length < 5) return 'Add a complete delivery address.';
    if (deliveryOption === 'courier' && lalamoveLoading) return 'Confirming the courier fee…';
    if (deliveryOption === 'courier' && !lalamoveQuote) return 'A confirmed courier quote is required.';
    return null;
  }, [deliveryOption, lalamoveLoading, lalamoveQuote, userAddress, userId, userName, userPhone]);

  async function handlePlaceOrder() {
    if (disabledReason || !deliveryOption || items.length === 0 || !userId) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }

    setPlacing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Please sign in again before continuing to payment.');
      const response = await fetch(`${API_BASE}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          items: items.map(item => ({
            productId: item.productId,
            variationId: item.variationId || '',
            productName: item.productName,
            shopId: item.shopId,
            shopName: item.shopName,
            price: item.price,
            qty: item.qty,
            variation: item.variation || '',
          })),
          userName,
          userPhone,
          userAddress,
          userEmail: user?.email || '',
          deliveryOption,
          lalamoveQuoteId: lalamoveQuote?.quotationId || null,
          pickupCoords: mapCoords.pickup,
          dropoffCoords: mapCoords.dropoff,
          serviceType: selectedVehicle.serviceType,
          shopAddress,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || 'Payment could not be prepared');

      if (!data.orderId) throw new Error('Payment order was not created. Please try again.');
      localStorage.setItem('likhartisan_checkout_order_id', data.orderId);
      sessionStorage.setItem('likhartisan_checkout_order_id', data.orderId);
      if (buyNowItem) sessionStorage.setItem('lk_buy_now', '1');
      else savePendingPurchase(data.orderId, cartDraft?.lineKeys || items.map(getCartLineKey));
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error instanceof Error ? error.message : 'An error occurred. Please try again.');
      setPlacing(false);
    }
  }

  if (items.length === 0 && !placing) {
    return <main className="checkout-page checkout-empty"><p role="status">Returning to your cart…</p></main>;
  }

  return (
    <main className="checkout-page" id="main-content">
      <div className="checkout-shell">
        <CheckoutHeader
          itemCount={itemCount}
          shopName={items[0]?.shopName || 'Artisan shop'}
          isBuyNow={Boolean(buyNowItem)}
          onBack={() => buyNowItem ? navigate(-1) : navigate('/cart')}
        />

        <div className="checkout-layout">
          <div className="checkout-main">
            <ContactCard
              name={userName}
              phone={userPhone}
              address={userAddress}
              editing={editAddress}
              form={editForm}
              saving={saving}
              requiresAddress={deliveryOption === 'courier'}
              onEdit={() => setEditAddress(true)}
              onCancel={cancelEditing}
              onFormChange={setEditForm}
              onSave={() => void saveDetails()}
            />

            <DeliveryCard
              value={deliveryOption}
              shopAddress={shopAddress}
              vehicleLabel={selectedVehicle.label}
              itemCount={itemCount}
              totalKg={cartDimensions?.totalKg ?? null}
              quoteFee={lalamoveQuote ? shippingFee : null}
              quoteDistanceKm={quoteDistanceKm}
              quoteLoading={lalamoveLoading}
              quoteError={lalamoveError}
              onChange={setDeliveryOption}
              onRetryQuote={() => void fetchLalamoveQuote(shopAddress, userAddress, selectedVehicle.serviceType, mapCoords.pickup)}
            />

            {deliveryOption === 'courier' ? (
              <LocationCard hasDropoff={Boolean(mapCoords.dropoff)}>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={mapCoords.pickup}
                    zoom={13}
                    onLoad={map => { mapRef.current = map; setMapReady(true); }}
                    onClick={event => {
                      if (event.latLng) void handleMapClick(event.latLng.lat(), event.latLng.lng());
                    }}
                    options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
                  >
                    <Marker position={mapCoords.pickup} label={{ text: 'P', color: '#fff', fontSize: '12px', fontWeight: '700' }} />
                    {mapCoords.dropoff ? (
                      <Marker
                        position={mapCoords.dropoff}
                        draggable
                        onDragEnd={event => {
                          if (event.latLng) void handleMarkerDragEnd(event.latLng.lat(), event.latLng.lng());
                        }}
                        label={{ text: 'D', color: '#fff', fontSize: '12px', fontWeight: '700' }}
                      />
                    ) : null}
                  </GoogleMap>
                ) : (
                  <div className="checkout-map__fallback">The delivery map is unavailable. You can still confirm your address above.</div>
                )}
              </LocationCard>
            ) : null}
          </div>

          <div className="checkout-sidebar">
            <OrderReview
              items={items}
              subtotal={subtotal}
              shippingFee={shippingFee}
              total={total}
              deliveryOption={deliveryOption}
              quoteLoading={lalamoveLoading}
              hasCourierQuote={Boolean(lalamoveQuote)}
              placing={placing}
              disabledReason={disabledReason}
              onPlaceOrder={() => void handlePlaceOrder()}
            />
          </div>
        </div>
      </div>

      {confirmMapClick ? (
        <LocationDialog
          address={confirmMapClick.address}
          onCancel={() => setConfirmMapClick(null)}
          onConfirm={() => void confirmMapLocation()}
        />
      ) : null}

      <MobileCheckoutBar
        total={total}
        placing={placing}
        disabledReason={disabledReason}
        onPlaceOrder={() => void handlePlaceOrder()}
      />
    </main>
  );
}

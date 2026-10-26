import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { toast } from '../lib/popups';
import { getCart } from '../data/store';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { geocodeAddress } from '../lib/geocoder';
import { validAddressCoordinates } from '../lib/profileAddress';
import { API_BASE } from '../lib/api';
import { checkoutQuoteKey } from '../lib/checkoutQuote';
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
  MobileCheckoutBar,
  OrderReview,
  type CheckoutDeliveryOption,
} from '../components/checkout/CheckoutComponents';
import './CheckoutPage.css';

const DEFAULT_PICKUP_ADDRESS = 'Santo Tomas, Pampanga, Philippines';

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
  requestKey?: string;
  quotationId?: string;
  serviceType?: string;
  expiresAt?: string;
  currency?: string;
  priceBreakdown?: { total?: string | number; currency?: string };
  distance?: { value?: string | number; unit?: string };
  distanceMeters?: number | null;
  shipment?: {
    totalWeightG: number;
    totalWeightKg: number;
    totalVolumeCm3: number;
    itemCount: number;
    largestPackageCm: number[];
    recommendedVehicle: { serviceType: string; label: string };
    fingerprint: string;
  };
}

function validCoordinates(value: Coordinates | null | undefined): Coordinates | null {
  if (!value) return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function quoteErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === 'ERR_OUT_OF_SERVICE_AREA') return "This delivery address is outside Lalamove's service area.";
  if (code === 'ERR_INVALID_SERVICE_TYPE') return 'Motorcycle delivery is currently unavailable for this route.';
  if (code === 'ERR_REVERSE_GEOCODE_FAILURE' || code === 'ERR_INVALID_LOCATION') {
    return 'Update your delivery pin in Profile to a road-accessible location.';
  }
  if (code === 'ERR_INVALID_COORDINATES') return 'Update your delivery pin in Profile.';
  if (error instanceof Error && error.message) return error.message;
  return 'We could not confirm a courier fee. Check the address and try again.';
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

  const [deliveryOption, setDeliveryOption] = useState<CheckoutDeliveryOption | null>(
    routeState?.deliveryOption || cartDraft?.deliveryOption || null,
  );
  const [placing, setPlacing] = useState(false);
  const userId = user?.id || null;
  const userName = String(user?.user_metadata?.name || '');
  const userPhone = String(user?.user_metadata?.phone || '');
  const userAddress = String(user?.user_metadata?.address || '');
  const savedLat = user?.user_metadata?.address_lat;
  const savedLng = user?.user_metadata?.address_lng;
  const savedDropoff = useMemo(() => validAddressCoordinates(savedLat, savedLng), [savedLat, savedLng]);

  const [lalamoveQuote, setLalamoveQuote] = useState<LalamoveQuote | null>(null);
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [lalamoveError, setLalamoveError] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<{ key: string; message: string } | null>(null);
  const [quoteRefreshToken, setQuoteRefreshToken] = useState(0);
  const [pickupReady, setPickupReady] = useState(false);
  const [shopAddress, setShopAddress] = useState(DEFAULT_PICKUP_ADDRESS);
  const [storedPickupCoordinates, setStoredPickupCoordinates] = useState<Coordinates | null>(null);
  const [mapCoords, setMapCoords] = useState<{ pickup: Coordinates; dropoff: Coordinates | null }>({
    pickup: { lat: 15.026, lng: 120.691 },
    dropoff: null,
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const quoteRequestSequence = useRef(0);
  const quoteAbortController = useRef<AbortController | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [mapReady, setMapReady] = useState(false);

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.price * item.qty, 0), [items]);
  const currentQuoteKey = checkoutQuoteKey(items, shopAddress, userAddress, mapCoords.pickup, mapCoords.dropoff);
  const quoteExpiryMs = lalamoveQuote?.expiresAt ? Date.parse(lalamoveQuote.expiresAt) : Number.NaN;
  const quoteExpired = Boolean(lalamoveQuote?.expiresAt && Number.isFinite(quoteExpiryMs) && quoteExpiryMs <= currentTime);
  const hasValidCourierQuote = deliveryOption === 'courier'
    && Boolean(lalamoveQuote?.quotationId)
    && lalamoveQuote?.requestKey === currentQuoteKey
    && Number(lalamoveQuote?.priceBreakdown?.total) > 0
    && !quoteExpired;
  const shippingFee = hasValidCourierQuote
    ? Number(lalamoveQuote?.priceBreakdown?.total) || 0
    : 0;
  const total = subtotal + shippingFee;
  const quoteDistanceKm = !hasValidCourierQuote ? null : lalamoveQuote?.distanceMeters != null
    ? (Number(lalamoveQuote.distanceMeters) / 1000).toFixed(1)
    : lalamoveQuote?.distance?.value
      ? (Number(lalamoveQuote.distance.value) / 1000).toFixed(1)
    : null;
  const quoteShipment = hasValidCourierQuote ? lalamoveQuote?.shipment : null;
  const visibleCheckoutNotice = checkoutNotice?.key === currentQuoteKey ? checkoutNotice.message : null;

  const fetchLalamoveQuote = useCallback(async (
    pickup: string,
    dropoff: string,
    pickupCoordinates: Coordinates,
    confirmedDropoffCoordinates: Coordinates | null,
  ) => {
    const sequence = ++quoteRequestSequence.current;
    quoteAbortController.current?.abort();
    quoteAbortController.current = null;
    setLalamoveQuote(null);

    const validPickup = validCoordinates(pickupCoordinates);
    const validDropoff = validCoordinates(confirmedDropoffCoordinates);
    if (!pickup || dropoff.trim().length < 5 || !validPickup) {
      setLalamoveQuote(null);
      setLalamoveError(null);
      setLalamoveLoading(false);
      return;
    }

    setLalamoveLoading(true);
    setLalamoveError(null);
    try {
      const dropoffCoordinates = validDropoff;
      if (!dropoffCoordinates) throw new Error('Save a valid delivery pin in Profile before requesting courier delivery.');
      if (sequence !== quoteRequestSequence.current) return;

      const controller = new AbortController();
      quoteAbortController.current = controller;

      const response = await fetch(`${API_BASE}/api/lalamove/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          pickupCoords: validPickup,
          dropoffCoords: dropoffCoordinates,
          items: items.map(item => ({
            productId: item.productId,
            variationId: item.variationId || null,
            quantity: item.qty,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'Courier quote unavailable') as Error & { code?: string };
        error.code = data.code;
        throw error;
      }
      if (!data?.quotationId || Number(data?.priceBreakdown?.total) <= 0) {
        throw new Error('Courier quote was incomplete. Please retry.');
      }
      if (sequence !== quoteRequestSequence.current) return;

      setLalamoveQuote({ ...data, requestKey: checkoutQuoteKey(items, pickup, dropoff, validPickup, dropoffCoordinates) } as LalamoveQuote);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      if (sequence !== quoteRequestSequence.current) return;
      console.error('Lalamove quote error:', error);
      setLalamoveQuote(null);
      setLalamoveError(quoteErrorMessage(error));
    } finally {
      if (sequence === quoteRequestSequence.current) setLalamoveLoading(false);
    }
  }, [items]);

  useEffect(() => {
    if (items.length === 0) navigate('/cart', { replace: true });
  }, [items.length, navigate]);

  useEffect(() => {
    // Profile owns the delivery pin; cart drafts must never override it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapCoords(current => ({ ...current, dropoff: savedDropoff }));
  }, [savedDropoff]);

  useEffect(() => {
    const shopId = items[0]?.shopId;
    if (!shopId) return;
    let cancelled = false;

    async function loadShopAddress() {
      const { data } = await supabase.from('shops').select('*').eq('id', shopId).single();
      if (cancelled || !data) return;
      const location = typeof data.location === 'string' ? data.location : data.location?.address;
      if (location) setShopAddress(location);
      const coordinates = validCoordinates({
        lat: data.latitude ?? data.lat ?? data.location?.lat,
        lng: data.longitude ?? data.lng ?? data.location?.lng,
      });
      setStoredPickupCoordinates(coordinates);
    }

    void loadShopAddress();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    if (storedPickupCoordinates) {
      // Prefer stored artisan coordinates when the shop record provides them.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapCoords(current => ({ ...current, pickup: storedPickupCoordinates }));
      setPickupReady(true);
      return;
    }
    if (!shopAddress || !isLoaded) {
      setPickupReady(false);
      return;
    }
    let cancelled = false;

    async function locateShop() {
      const coordinates = await geocodeAddress(shopAddress);
      if (cancelled) return;
      if (coordinates) {
        setMapCoords(current => ({ ...current, pickup: coordinates }));
        setPickupReady(true);
      } else {
        setPickupReady(false);
      }
    }

    void locateShop();
    return () => { cancelled = true; };
  }, [isLoaded, shopAddress, storedPickupCoordinates]);

  useEffect(() => {
    quoteAbortController.current?.abort();
    quoteAbortController.current = null;
    quoteRequestSequence.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLalamoveQuote(null);
    if (deliveryOption !== 'courier') {
      setLalamoveError(null);
      setLalamoveLoading(false);
      return;
    }
    if (!isLoaded || !pickupReady || userAddress.trim().length < 5 || !validCoordinates(mapCoords.pickup) || !savedDropoff) {
      setLalamoveError(null);
      setLalamoveLoading(false);
      return;
    }

    setLalamoveLoading(true);
    const timer = window.setTimeout(() => {
      void fetchLalamoveQuote(
        shopAddress,
        userAddress,
        mapCoords.pickup,
        mapCoords.dropoff,
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [currentQuoteKey, deliveryOption, fetchLalamoveQuote, isLoaded, mapCoords.dropoff, mapCoords.pickup, pickupReady, quoteRefreshToken, shopAddress, userAddress, savedDropoff]);

  useEffect(() => {
    if (deliveryOption !== 'courier' || !lalamoveQuote?.expiresAt || !hasValidCourierQuote) return;
    const expiresAt = Date.parse(lalamoveQuote.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const refreshIn = Math.max(0, expiresAt - Date.now() - 10_000);
    const timer = window.setTimeout(() => {
      void fetchLalamoveQuote(
        shopAddress,
        userAddress,
        mapCoords.pickup,
        mapCoords.dropoff,
      );
    }, refreshIn);
    return () => window.clearTimeout(timer);
  }, [deliveryOption, fetchLalamoveQuote, hasValidCourierQuote, lalamoveQuote?.expiresAt, mapCoords.dropoff, mapCoords.pickup, shopAddress, userAddress]);

  useEffect(() => {
    if (!lalamoveQuote?.expiresAt) return;
    const expiresAt = Date.parse(lalamoveQuote.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), Math.max(0, expiresAt - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [lalamoveQuote?.expiresAt]);

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

  function editProfile() {
    const state = {
      ...(buyNowItem ? { buyNowItem } : { checkoutDraft: cartDraft || undefined }), deliveryOption: deliveryOption || undefined,
    };
    navigate('/checkout', { replace: true, state });
    navigate('/dashboard?tab=account', { state: { profileReturn: { pathname: '/checkout', state } } });
  }

  const disabledReason = useMemo(() => {
    if (!deliveryOption) return 'Select pickup or courier delivery.';
    if (!userId) return 'Loading your account details…';
    if (userName.trim().length < 2 || userPhone.trim().length < 7) return 'Add your full name and phone number in Profile.';
    if (deliveryOption === 'courier' && userAddress.trim().length < 5) return 'Save a complete delivery address in Profile.';
    if (deliveryOption === 'courier' && !savedDropoff) return 'Save a valid delivery pin in Profile.';
    if (deliveryOption === 'courier' && lalamoveLoading) return 'Confirming the courier fee…';
    if (deliveryOption === 'courier' && quoteExpired) return 'Refreshing the courier fee…';
    if (deliveryOption === 'courier' && !hasValidCourierQuote) return 'A confirmed courier quote is required.';
    return null;
  }, [deliveryOption, hasValidCourierQuote, lalamoveLoading, quoteExpired, savedDropoff, userAddress, userId, userName, userPhone]);

  async function handlePlaceOrder() {
    if (disabledReason || !deliveryOption || items.length === 0 || !userId) {
      if (disabledReason) toast.error(disabledReason);
      return;
    }

    setPlacing(true);
    setCheckoutNotice(null);
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
          shipmentFingerprint: lalamoveQuote?.shipment?.fingerprint || null,
          quotedShippingFeeCentavos: deliveryOption === 'courier' ? Math.round(shippingFee * 100) : null,
          shopAddress,
        }),
      });
      const data = await response.json();
      if (response.status === 409 && (data.code === 'ERR_STALE_SHIPMENT' || data.code === 'ERR_COURIER_FEE_CHANGED')) {
        setCheckoutNotice({
          key: currentQuoteKey,
          message: data.code === 'ERR_COURIER_FEE_CHANGED'
            ? 'The courier fee changed. Review the updated delivery fee and total, then continue to payment again.'
            : 'Your order or delivery route changed. We are refreshing the courier fee; review it before continuing.',
        });
        setLalamoveQuote(null);
        setLalamoveLoading(true);
        setQuoteRefreshToken(current => current + 1);
        return;
      }
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
    } finally {
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
              requiresAddress={deliveryOption === 'courier'}
              onEditProfile={editProfile}
            />

            <DeliveryCard
              value={deliveryOption}
              shopAddress={shopAddress}
               vehicleLabel={quoteShipment?.recommendedVehicle?.label || 'Calculating delivery vehicle…'}
               itemCount={itemCount}
               totalKg={quoteShipment?.totalWeightKg ?? null}
              quoteFee={hasValidCourierQuote ? shippingFee : null}
              quoteDistanceKm={quoteDistanceKm}
              quoteLoading={lalamoveLoading}
              quoteError={lalamoveError}
              onChange={setDeliveryOption}
               onRetryQuote={() => void fetchLalamoveQuote(shopAddress, userAddress, mapCoords.pickup, mapCoords.dropoff)}
            />

            {deliveryOption === 'courier' ? (
              <LocationCard hasDropoff={Boolean(mapCoords.dropoff)}>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={mapCoords.pickup}
                    zoom={13}
                    onLoad={map => { mapRef.current = map; setMapReady(true); }}
                    options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
                  >
                    <Marker position={mapCoords.pickup} label={{ text: 'P', color: '#fff', fontSize: '12px', fontWeight: '700' }} />
                    {mapCoords.dropoff ? (
                      <Marker
                        position={mapCoords.dropoff}
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
              hasCourierQuote={hasValidCourierQuote}
              placing={placing}
              disabledReason={disabledReason}
              notice={visibleCheckoutNotice}
              onPlaceOrder={() => void handlePlaceOrder()}
            />
          </div>
        </div>
      </div>


      <MobileCheckoutBar
        total={total}
        placing={placing}
        disabledReason={disabledReason}
        onPlaceOrder={() => void handlePlaceOrder()}
      />
    </main>
  );
}

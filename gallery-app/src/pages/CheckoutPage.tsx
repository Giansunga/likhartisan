import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useJsApiLoader, GoogleMap, Marker } from '@react-google-maps/api';
import { getCart } from '../data/store';
import { supabase } from '../lib/supabase';
import { fmt } from '../lib/utils';
import { geocodeAddress, reverseGeocodeCoords } from '../lib/geocoder';
import { useMediaQuery } from '../hooks/useMediaQuery';

const PAYMONGO_API_URL = import.meta.env.VITE_PAYMONGO_API_URL || 'http://localhost:3001';
const DEFAULT_PICKUP_ADDRESS = 'Santo Tomas, Pampanga, Philippines';

// Lalamove vehicle tiers (smallest to largest) for PH market — dimensions in cm, weight in kg
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

// Parse dimension strings like "10 x 5 in", "25cm", "10\"" to cm
function parseDimensionToCm(dim: string): number {
  if (!dim) return 0;
  const s = dim.toLowerCase().trim();
  // Try "N x M unit" pattern
  const xMatch = s.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (xMatch) return parseFloat(xMatch[1]) * 2.54; // take the larger dimension, convert inches to cm
  // Try "Ncm" or "N cm"
  const cmMatch = s.match(/([\d.]+)\s*cm/);
  if (cmMatch) return parseFloat(cmMatch[1]);
  // Try "N\"" or "N in"
  const inMatch = s.match(/([\d.]+)\s*(?:\"|in)/);
  if (inMatch) return parseFloat(inMatch[1]) * 2.54;
  // Plain number — assume cm
  const num = parseFloat(s);
  return isNaN(num) ? 0 : num;
}

// Estimate weight in kg from pottery dimensions (volume × ceramic density ~2.5 g/cm³)
function estimateWeight(lCm: number, wCm: number, hCm: number): number {
  if (lCm <= 0 || wCm <= 0 || hCm <= 0) return 2; // default 2kg per pot
  const volumeCm3 = lCm * wCm * hCm * 0.6; // ~60% solid (hollow pottery)
  return Math.max(1, (volumeCm3 * 2.5) / 1000); // kg
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const items = getCart();
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userAddress, setUserAddress] = useState('');
  const [editAddress, setEditAddress] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', address: '' });
  const initialDelivery = (location.state as any)?.deliveryOption || null;
  const [deliveryOption, setDeliveryOption] = useState<'pickup' | 'courier' | null>(initialDelivery);
  const [placing, setPlacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmMapClick, setConfirmMapClick] = useState<{ lat: number; lng: number; address: string } | null>(null);

  // Lalamove quote state
  const [lalamoveQuote, setLalamoveQuote] = useState<any>(null);
  const [lalamoveLoading, setLalamoveLoading] = useState(false);
  const [, setLalamoveError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_TIERS[0]);
  const [cartDimensions, setCartDimensions] = useState<{ totalL: number; totalW: number; totalH: number; totalKg: number; itemCount: number } | null>(null);
  const [shopAddress, setShopAddress] = useState(DEFAULT_PICKUP_ADDRESS);
  const [mapCoords, setMapCoords] = useState<{
    pickup: { lat: number; lng: number };
    dropoff: { lat: number; lng: number } | null;
  }>({ pickup: { lat: 15.0260, lng: 120.6910 }, dropoff: null });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shippingFee = deliveryOption === 'courier' ? (lalamoveQuote?.priceBreakdown?.total ? parseFloat(lalamoveQuote.priceBreakdown.total) : 0) : 0;
  const total = subtotal + shippingFee;

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    return reverseGeocodeCoords(lat, lng);
  }, []);

  const fetchLalamoveQuote = useCallback(async (pickup: string, dropoff: string, serviceType: string, pickupCoordsFromMap: { lat: number; lng: number }) => {
    if (!pickup || !dropoff) {
      setLalamoveQuote(null);
      return;
    }

    setLalamoveLoading(true);
    setLalamoveError(null);

    try {
      // Use already-geocoded pickup coords from the map, geocode dropoff only
      const pickupCoords = pickupCoordsFromMap;
      let dropoffCoords = null;
      try {
        dropoffCoords = await geocodeAddress(dropoff);
      } catch (err) {
        console.error('Dropoff geocoding error:', err);
      }

      if (!pickupCoords || !dropoffCoords) {
        console.error('Lalamove geocoding failed:', { pickupCoords, dropoffCoords, pickup, dropoff });
        setLalamoveError('Could not geocode addresses. Please try again.');
        setLalamoveQuote(null);
        setLalamoveLoading(false);
        return;
      }

      const response = await fetch(`${PAYMONGO_API_URL}/api/lalamove/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          serviceType,
          pickupCoords,
          dropoffCoords,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLalamoveError(data.error || 'Failed to get shipping quote');
        setLalamoveQuote(null);
      } else {
        setLalamoveQuote(data);
      }
    } catch (err) {
      console.error('Lalamove quote error:', err);
      setLalamoveError('Unable to fetch shipping quote. Please try again.');
      setLalamoveQuote(null);
    } finally {
      setLalamoveLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (items.length === 0) navigate('/cart', { replace: true });
  }, [items.length, navigate]);

  // Fetch shop address
  useEffect(() => {
    async function fetchShopAddress() {
      if (items.length === 0) return;
      const shopId = items[0].shopId;
      if (!shopId) return;

      const { data } = await supabase
        .from('shops')
        .select('name, location')
        .eq('id', shopId)
        .single();

      if (data?.location) {
        setShopAddress(data.location);
      }
    }
    fetchShopAddress();
  }, [items]);

  // Geocode shop address into pickup coordinates on the map
  useEffect(() => {
    if (!shopAddress || !isLoaded) return;
    let cancelled = false;
    (async () => {
      const coords = await geocodeAddress(shopAddress);
      if (coords && !cancelled) {
        setMapCoords(prev => ({ ...prev, pickup: coords }));
      }
    })();
    return () => { cancelled = true; };
  }, [shopAddress, isLoaded]);

  // Fetch variation data and auto-select vehicle
  useEffect(() => {
    async function calcVehicle() {
      if (items.length === 0) return;

      // Collect unique variation IDs
      const varIds = items.filter(i => i.variationId).map(i => i.variationId!);
      let variations: Record<string, { dimensions: string; height: string }> = {};

      if (varIds.length > 0) {
        const { data } = await supabase
          .from('product_variations')
          .select('id, dimensions, height')
          .in('id', varIds);

        if (data) {
          data.forEach((v: any) => { variations[v.id] = { dimensions: v.dimensions || '', height: v.height || '' }; });
        }
      }

      // Calculate total volume and weight of all items
      let totalVolumeCm3 = 0;
      let totalKg = 0;
      let totalQty = 0;
      items.forEach(item => {
        const v = item.variationId ? variations[item.variationId] : null;
        const dimStr = v?.dimensions || '';
        const heightStr = v?.height || '';

        // Parse "L x W" from dimensions, H from height
        const parts = dimStr.toLowerCase().split('x').map(s => parseDimensionToCm(s.trim()));
        const l = parts[0] || 0;
        const w = parts[1] || parts[0] || 0;
        const h = parseDimensionToCm(heightStr) || 30;

        totalVolumeCm3 += l * w * h * item.qty;
        totalKg += estimateWeight(l, w, h) * item.qty;
        totalQty += item.qty;
      });

      const dims = { totalL: 0, totalW: 0, totalH: 0, totalKg, itemCount: totalQty };
      setCartDimensions(dims);

      // Auto-select smallest vehicle where total volume AND weight fit
      const selected = VEHICLE_TIERS.find(v => {
        const vehicleVolume = v.maxL * v.maxW * v.maxH;
        return totalVolumeCm3 <= vehicleVolume && totalKg <= v.maxKg;
      }) || VEHICLE_TIERS[VEHICLE_TIERS.length - 1];
      setSelectedVehicle(selected);
    }
    calcVehicle();
  }, [items]);

  // Fetch Lalamove quote when delivery option, address, or vehicle changes
  useEffect(() => {
    if (deliveryOption === 'courier' && userAddress && isLoaded) {
      fetchLalamoveQuote(shopAddress, userAddress, selectedVehicle.serviceType, mapCoords.pickup);
    } else {
      setLalamoveQuote(null);
    }
  }, [deliveryOption, userAddress, shopAddress, selectedVehicle, fetchLalamoveQuote, mapCoords.pickup, isLoaded]);

  // Fit map bounds to show both markers when coordinates change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mapCoords.dropoff) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(mapCoords.pickup);
      bounds.extend(mapCoords.dropoff);
      map.fitBounds(bounds, 40);
    } else {
      map.panTo(mapCoords.pickup);
      map.setZoom(13);
    }
  }, [mapCoords, mapReady]);

  const handleMarkerDragEnd = useCallback(async (lat: number, lng: number) => {
    setMapCoords(prev => ({ ...prev, dropoff: { lat, lng } }));

    const address = await reverseGeocode(lat, lng);
    if (address) {
      setUserAddress(address);
      setEditForm(prev => ({ ...prev, address }));
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.updateUser({ data: { address, address_lat: lat, address_lng: lng } });
      }
    }
  }, [reverseGeocode]);

  // Handle map click - reverse geocode and show confirmation
  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    const address = await reverseGeocode(lat, lng);
    setConfirmMapClick({ lat, lng, address: address || `${lat.toFixed(6)}, ${lng.toFixed(6)}` });
  }, [reverseGeocode]);

  // Confirm map click - apply the location change
  const confirmMapLocation = useCallback(async () => {
    if (!confirmMapClick) return;
    const { lat, lng, address } = confirmMapClick;
    setMapCoords(prev => ({ ...prev, dropoff: { lat, lng } }));
    setUserAddress(address);
    setEditForm(prev => ({ ...prev, address }));
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.auth.updateUser({ data: { address, address_lat: lat, address_lng: lng } });
    }
    setConfirmMapClick(null);
  }, [confirmMapClick]);

  async function fetchProfile() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const meta = session.user.user_metadata || {};
    const name = meta.name || session.user.email || '';
    const phone = meta.phone || '';
    const address = meta.address || '';
    setUserName(name);
    setUserPhone(phone);
    setUserAddress(address);
    setEditForm({ name, phone, address });
    setUserId(session.user.id);

    // Use saved coordinates if available, otherwise geocode
    if (meta.address_lat && meta.address_lng) {
      setMapCoords(prev => ({
        ...prev,
        dropoff: { lat: meta.address_lat, lng: meta.address_lng },
      }));
    } else if (address) {
      try {
        const coords = await geocodeAddress(address);
        if (coords) {
          setMapCoords(prev => ({
            ...prev,
            dropoff: { lat: coords.lat, lng: coords.lng },
          }));
        }
      } catch (err) {
        console.error('Geocoding default address error:', err);
      }
    }
  }

  async function saveAddress() {
    if (!editForm.name || !editForm.address) {
      alert('Name and address are required.');
      return;
    }

    setSaving(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setSaving(false); return; }

      // Geocode the address text to get coordinates
      let newLat: number | null = null;
      let newLng: number | null = null;
      try {
        const coords = await geocodeAddress(editForm.address);
        if (coords) {
          newLat = coords.lat;
          newLng = coords.lng;
        }
      } catch (err) {
        console.error('Geocoding new address error:', err);
      }

      // Build update data — always include coordinates when available
      const updateData: Record<string, any> = {
        name: editForm.name,
        phone: editForm.phone,
        address: editForm.address,
      };
      if (newLat && newLng) {
        updateData.address_lat = newLat;
        updateData.address_lng = newLng;
      }

      const { error } = await supabase.auth.updateUser({ data: updateData });
      if (error) throw error;

      // Update local state after successful save
      setUserName(editForm.name);
      setUserPhone(editForm.phone);
      setUserAddress(editForm.address);
      if (newLat && newLng) {
        setMapCoords(prev => ({ ...prev, dropoff: { lat: newLat!, lng: newLng! } }));
      }
      setEditAddress(false);
    } catch (err) {
      console.error('Failed to save address:', err);
      alert('Failed to save address. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePlaceOrder() {
    if (!deliveryOption) { alert('Please select a delivery option.'); return; }
    if (items.length === 0) return;
    if (!userName || !userAddress) { alert('Please complete your shipping address.'); return; }

    setPlacing(true);

    try {
      const response = await fetch(`${PAYMONGO_API_URL}/api/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({
            productId: i.productId,
            variationId: i.variationId || '',
            productName: i.productName,
            shopId: i.shopId,
            shopName: i.shopName,
            price: i.price,
            qty: i.qty,
            variation: i.variation || '',
          })),
          shippingFee,
          userName,
          userPhone,
          userAddress,
          deliveryOption,
          userId,
          lalamoveQuoteId: lalamoveQuote?.quotationId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert('Payment failed: ' + (data.error?.message || data.error || 'Unknown error'));
        setPlacing(false);
        return;
      }

      localStorage.setItem('likhartisan_checkout_session_id', data.sessionId);
      window.location.href = data.checkoutUrl;
    } catch (error) {
      console.error('Checkout error:', error);
      alert('An error occurred. Please try again.');
      setPlacing(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingTop: 'calc(var(--nav-height) + 30px)', paddingBottom: 80 }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: isMobile ? '0 12px' : '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.6fr 1fr', gap: isMobile ? '20px' : '30px', alignItems: 'flex-start' }}>

          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Shipping Address */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8E0D8', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E1E1E', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  Shipping Address
                </h3>
                <button onClick={() => setEditAddress(!editAddress)} style={{
                  background: 'none', border: 'none', color: 'var(--primary-color)', fontWeight: 600,
                  fontSize: '0.85rem', cursor: 'pointer',
                }}>{editAddress ? 'Cancel' : 'Edit'}</button>
              </div>

              {editAddress ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                    <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                      placeholder="Full Name" style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem' }} />
                    <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="Phone Number" style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem' }} />
                  </div>
                  <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                    placeholder="#0 Street, Barangay, Municipality, Province"
                    style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #E8E0D8', borderRadius: '8px', fontSize: '0.88rem', boxSizing: 'border-box' }} />
                  <button onClick={saveAddress} disabled={saving} style={{
                    alignSelf: 'flex-end', padding: '8px 20px', background: saving ? '#D4C8BB' : 'var(--primary-color)', color: '#fff',
                    border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                  }}>{saving ? 'Saving...' : 'Save Address'}</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%', background: '#D9D9D9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5" style={{ width: '24px', height: '24px' }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-dark)' }}>{userName || 'No name set'}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{userPhone || 'No phone set'}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-light)' }}>{userAddress || 'No address set'}</div>
                  </div>
                  </div>
                )}
            </div>

            {/* Delivery Map */}
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E8E0D8', padding: '24px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 16px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                Delivery Map
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-light)', margin: '0 0 12px' }}>
                Click on the map or drag the marker to adjust your delivery location
              </p>
              <div style={{ height: isMobile ? 'min(250px, 40vh)' : '300px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E8E0D8' }}>
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={mapCoords.pickup}
                    zoom={13}
                    onLoad={(map) => { mapRef.current = map; setMapReady(true); }}
                    onClick={(e) => {
                      if (e.latLng) {
                        handleMapClick(e.latLng.lat(), e.latLng.lng());
                      }
                    }}
                    options={{
                      streetViewControl: false,
                      mapTypeControl: false,
                    }}
                  >
                    {/* Shop/Pickup Marker */}
                    <Marker
                      position={mapCoords.pickup}
                      label={{ text: 'P', color: '#fff', fontSize: '12px', fontWeight: '700' }}
                    />

                    {/* Draggable Dropoff Marker */}
                    {mapCoords.dropoff && deliveryOption === 'courier' && (
                      <Marker
                        position={mapCoords.dropoff}
                        draggable
                        onDragEnd={(e) => {
                          if (e.latLng) {
                            handleMarkerDragEnd(e.latLng.lat(), e.latLng.lng());
                          }
                        }}
                        label={{ text: 'D', color: '#fff', fontSize: '12px', fontWeight: '700' }}
                      />
                    )}

                    {/* Static Dropoff Marker (when not in courier mode) */}
                    {mapCoords.dropoff && deliveryOption !== 'courier' && (
                      <Marker
                        position={mapCoords.dropoff}
                        label={{ text: 'D', color: '#fff', fontSize: '12px', fontWeight: '700' }}
                      />
                    )}
                  </GoogleMap>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f0ea', color: 'var(--text-light)', fontSize: '0.85rem' }}>
                    Google Maps API key not configured
                  </div>
                )}
              </div>
              {/* Map Legend */}
              <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontSize: '0.78rem', color: 'var(--text-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary-color)' }} />
                  <span>Pickup (Shop)</span>
                </div>
                {mapCoords.dropoff && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#DC2626' }} />
                    <span>Delivery Address</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Confirm Map Click Modal */}
          {confirmMapClick && (
            <div style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', zIndex: 9999,
            }}>
              <div style={{
                background: '#fff', borderRadius: '16px', padding: '28px 32px',
                maxWidth: '420px', width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-dark)', margin: '0 0 8px' }}>
                  Change delivery location?
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', margin: '0 0 16px', lineHeight: 1.5 }}>
                  Move delivery address to:
                </p>
                <div style={{
                  background: 'var(--bg-secondary)', borderRadius: '10px', padding: '12px 14px',
                  fontSize: '0.82rem', color: 'var(--text-dark)', lineHeight: 1.4, marginBottom: '20px',
                  border: '1px solid #E8E0D8',
                }}>
                  {confirmMapClick.address}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setConfirmMapClick(null)} style={{
                    flex: 1, padding: '10px', borderRadius: '10px', border: '1.5px solid #E8E0D8',
                    background: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    color: 'var(--text-dark)',
                  }}>
                    Cancel
                  </button>
                  <button onClick={confirmMapLocation} style={{
                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                    background: 'var(--primary-color)', color: '#fff', fontWeight: 600,
                    fontSize: '0.85rem', cursor: 'pointer',
                  }}>
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: isMobile ? 'static' : 'sticky', top: isMobile ? 'auto' : 'calc(var(--nav-height) + 30px)' }}>

            {/* Order Details */}
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E8E0D8', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0EBE5' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Order Details
                </h3>
              </div>

              {/* Delivery Options */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0EBE5' }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery Method</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button onClick={() => setDeliveryOption('pickup')} style={{
                    padding: '12px', borderRadius: '10px', border: deliveryOption === 'pickup' ? '2px solid var(--primary-color)' : '1.5px solid #E8E0D8',
                    background: deliveryOption === 'pickup' ? 'var(--bg-secondary)' : '#fff', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke={deliveryOption === 'pickup' ? 'var(--primary-color)' : '#999'} strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: deliveryOption === 'pickup' ? 'var(--primary-color)' : 'var(--text-dark)' }}>Self Pickup</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16A34A' }}>Free</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', lineHeight: 1.3 }}>Pick up at shop</div>
                  </button>
                  <button onClick={() => setDeliveryOption('courier')} style={{
                    padding: '12px', borderRadius: '10px', border: deliveryOption === 'courier' ? '2px solid var(--primary-color)' : '1.5px solid #E8E0D8',
                    background: deliveryOption === 'courier' ? 'var(--bg-secondary)' : '#fff', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={deliveryOption === 'courier' ? 'var(--primary-color)' : '#999'} strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                        <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                      </svg>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem', color: deliveryOption === 'courier' ? 'var(--primary-color)' : 'var(--text-dark)' }}>Third Party Courier</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', lineHeight: 1.3 }}>Deliver to address</div>
                  </button>
                </div>

                {/* Lalamove Vehicle Info */}
                {deliveryOption === 'courier' && (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: cartDimensions ? '6px' : 0 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" style={{ width: '14px', height: '14px', flexShrink: 0 }}>
                        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
                      </svg>
                      <span style={{ fontSize: '0.78rem', color: '#16A34A', fontWeight: 600 }}>
                        {selectedVehicle.label}
                        {lalamoveQuote?.distance && <span style={{ fontWeight: 400 }}> · {(parseInt(lalamoveQuote.distance.value) / 1000).toFixed(1)} km</span>}
                      </span>
                      {lalamoveLoading && <span style={{ fontSize: '0.72rem', color: '#888' }}>Updating...</span>}
                    </div>
                    {cartDimensions && (
                      <div style={{ fontSize: '0.7rem', color: '#888', lineHeight: 1.5 }}>
                        {cartDimensions.itemCount} item{cartDimensions.itemCount > 1 ? 's' : ''} · ~{cartDimensions.totalKg.toFixed(1)} kg
                        {cartDimensions.totalL > 0 && <span> · {cartDimensions.totalL.toFixed(0)}×{cartDimensions.totalW.toFixed(0)}×{cartDimensions.totalH.toFixed(0)} cm</span>}
                      </div>
                    )}
                  </div>
                )}

                {!deliveryOption && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', background: '#FFF8F0', borderRadius: '8px', marginTop: '10px', border: '1px solid #F0E6D8' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" strokeWidth="2" style={{ width: '14px', height: '14px', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <span style={{ fontSize: '0.78rem', color: 'var(--primary-color)' }}>Please select a delivery option.</span>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div style={{ padding: '0 24px' }}>
                {items.map((item, idx) => (
                  <div key={`${item.productId}\v${item.variationId || ''}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 0', borderBottom: idx < items.length - 1 ? '1px solid #F5F0EA' : 'none' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={item.image} alt={item.productName}
                        style={{ width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #F0EBE5' }} />
                      <span style={{ position: 'absolute', top: '-6px', right: '-6px', background: 'var(--primary-color)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.qty}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-dark)', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.productName}</div>
                      {item.variation && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginBottom: '2px' }}>{item.variation}</div>
                      )}
                      <div style={{ fontSize: '0.72rem', color: '#B8A89A', fontStyle: 'italic' }}>{item.shopName}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-color)' }}>{fmt(item.price * item.qty)}</div>
                      <div style={{ fontSize: '0.7rem', color: '#B8A89A' }}>{fmt(item.price)} each</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pricing Summary */}
              <div style={{ padding: '16px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-light)' }}>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>{fmt(subtotal)}</span>
                </div>

                {/* Shipping Fee */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-light)' }}>Shipping Fee</span>
                  <span style={{ fontWeight: 600, color: deliveryOption === 'courier' && lalamoveQuote ? 'var(--text-dark)' : '#16A34A' }}>
                    {deliveryOption === 'courier' ? (
                      lalamoveLoading ? <span style={{ fontSize: '0.78rem', color: 'var(--primary-color)' }}>Calculating...</span> : lalamoveQuote ? fmt(shippingFee) : '---'
                    ) : deliveryOption === 'pickup' ? 'Free' : '---'}
                  </span>
                </div>

                {/* Total */}
                <div style={{ borderTop: '2px solid var(--text-dark)', paddingTop: '14px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-dark)' }}>Total</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-color)', letterSpacing: '-0.5px' }}>{fmt(total)}</span>
                </div>
              </div>

              {/* Place Order Button */}
              <div style={{ padding: '0 24px 24px' }}>
                <button onClick={handlePlaceOrder} disabled={placing || !deliveryOption || (deliveryOption === 'courier' && !lalamoveQuote)} style={{
                  width: '100%', padding: '15px', borderRadius: '12px', border: 'none',
                  background: placing || !deliveryOption || (deliveryOption === 'courier' && !lalamoveQuote) ? '#D4C8BB' : 'linear-gradient(135deg, #8B5E3C, #A0522D)',
                  color: '#fff', fontSize: '0.95rem', fontWeight: 700, cursor: placing || !deliveryOption || (deliveryOption === 'courier' && !lalamoveQuote) ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.5px', boxShadow: placing || !deliveryOption || (deliveryOption === 'courier' && !lalamoveQuote) ? 'none' : '0 4px 14px rgba(139,94,60,0.3)',
                  transition: 'all 0.2s ease',
                }}>{placing ? 'PLACING ORDER...' : 'PLACE ORDER NOW'}</button>
                <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#B8A89A', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '12px', height: '12px' }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Secure & encrypted payment
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

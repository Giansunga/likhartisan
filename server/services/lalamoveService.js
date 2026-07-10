import { ClientModule, Config, QuotationPayloadBuilder } from '@lalamove/lalamove-js';

const API_KEY = process.env.LALAMOVE_API_KEY;
const API_SECRET = process.env.LALAMOVE_API_SECRET;
const MARKET = process.env.LALAMOVE_MARKET || 'PH';

if (!API_KEY || !API_SECRET) {
  console.warn('[lalamove] LALAMOVE_API_KEY / LALAMOVE_API_SECRET not set — delivery quotes will fail');
}

const client = new ClientModule(new Config(API_KEY || '', API_SECRET || '', 'sandbox'));

/**
 * Get a delivery quotation from Lalamove.
 * Returns: { quotationId, serviceType, priceBreakdown, distance, stops, expiresAt }
 * Throws on failure.
 */
export async function getQuotation({
  pickupCoords,
  dropoffCoords,
  pickupAddress,
  dropoffAddress,
  serviceType = 'MOTORCYCLE',
  scheduleAt,
}) {
  // ── Input validation ──
  if (!pickupCoords || typeof pickupCoords.lat !== 'number' || typeof pickupCoords.lng !== 'number') {
    throw new Error('Invalid pickupCoords: requires { lat: number, lng: number }');
  }
  if (!dropoffCoords || typeof dropoffCoords.lat !== 'number' || typeof dropoffCoords.lng !== 'number') {
    throw new Error('Invalid dropoffCoords: requires { lat: number, lng: number }');
  }
  if (!pickupAddress || !dropoffAddress) {
    throw new Error('pickupAddress and dropoffAddress are required');
  }
  if (!API_KEY || !API_SECRET) {
    throw new Error('Lalamove API credentials not configured');
  }

  // ── Build payload ──
  const stops = [
    {
      coordinates: { lat: pickupCoords.lat.toString(), lng: pickupCoords.lng.toString() },
      address: pickupAddress,
    },
    {
      coordinates: { lat: dropoffCoords.lat.toString(), lng: dropoffCoords.lng.toString() },
      address: dropoffAddress,
    },
  ];

  const payloadBuilder = QuotationPayloadBuilder.quotationPayload()
    .withLanguage('en_PH')
    .withServiceType(serviceType)
    .withStops(stops);

  if (scheduleAt) {
    payloadBuilder.withScheduleAt(scheduleAt);
  }

  const payload = payloadBuilder.build();

  // ── Call API with error handling ──
  let result;
  try {
    result = await client.Quotation.create(MARKET, payload);
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    console.error('[lalamove] Quotation API error:', msg);
    throw new Error(`Lalamove API error: ${msg}`);
  }

  // ── Response validation ──
  if (!result) {
    throw new Error('Lalamove returned empty response');
  }
  if (!result.id && !result.quotationId) {
    throw new Error('Lalamove response missing quotation id');
  }
  if (!result.priceBreakdown) {
    throw new Error('Lalamove response missing priceBreakdown');
  }

  return {
    quotationId: result.quotationId || result.id,
    serviceType: result.serviceType || serviceType,
    priceBreakdown: result.priceBreakdown,
    distance: result.distance || null,
    stops: result.stops || [],
    expiresAt: result.expiresAt || null,
  };
}

/**
 * Get available city/area info from Lalamove.
 * Returns city data or throws on failure.
 */
export async function getCityInfo() {
  if (!API_KEY || !API_SECRET) {
    throw new Error('Lalamove API credentials not configured');
  }

  let result;
  try {
    result = await client.City.get(MARKET);
  } catch (err) {
    const msg = err?.response?.data?.message || err?.message || String(err);
    console.error('[lalamove] City API error:', msg);
    throw new Error(`Lalamove City API error: ${msg}`);
  }

  return result;
}

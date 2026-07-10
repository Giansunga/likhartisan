import { getQuotation, getCityInfo as fetchCityInfo } from '../services/lalamoveService.js';

export async function handleGetQuote(req, res) {
  try {
    const { pickupAddress, dropoffAddress, serviceType, scheduleAt, pickupCoords, dropoffCoords } = req.body;

    if (!pickupAddress || !dropoffAddress) {
      return res.status(400).json({ error: 'pickupAddress and dropoffAddress are required' });
    }

    if (!pickupCoords || typeof pickupCoords.lat !== 'number' || typeof pickupCoords.lng !== 'number') {
      return res.status(400).json({ error: 'pickupCoords with lat/lng is required. Geocode on the client using Google Maps JS API.' });
    }

    if (!dropoffCoords || typeof dropoffCoords.lat !== 'number' || typeof dropoffCoords.lng !== 'number') {
      return res.status(400).json({ error: 'dropoffCoords with lat/lng is required. Geocode on the client using Google Maps JS API.' });
    }

    const resolvedPickup = pickupCoords;
    const resolvedDropoff = dropoffCoords;

    const quotation = await getQuotation({
      pickupCoords: resolvedPickup,
      dropoffCoords: resolvedDropoff,
      pickupAddress,
      dropoffAddress,
      serviceType,
      scheduleAt,
    });

    res.json({
      quotationId: quotation.quotationId,
      serviceType: quotation.serviceType,
      priceBreakdown: quotation.priceBreakdown,
      distance: quotation.distance,
      stops: quotation.stops,
      expiresAt: quotation.expiresAt,
      pickupCoords: resolvedPickup,
      dropoffCoords: resolvedDropoff,
    });
  } catch (err) {
    console.error('Lalamove quote error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to get delivery quote. Please try again.' });
  }
}

export async function handleGetCityInfo(req, res) {
  try {
    const cityInfo = await fetchCityInfo();
    res.json(cityInfo);
  } catch (err) {
    console.error('Lalamove city info error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch city information.' });
  }
}

import { Router } from 'express';

const router = Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Forward geocode: address → { lat, lng }
// Reverse geocode: lat,lng → address
router.get('/', async (req, res) => {
  try {
    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const { address, lat, lng } = req.query;

    // Reverse geocode
    if (lat && lng) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      console.log('Reverse geocode response:', JSON.stringify({ status: data.status, resultCount: data.results?.length, error_message: data.error_message }));
      if (data.status === 'OK' && data.results.length > 0) {
        return res.json({ address: data.results[0].formatted_address, lat: parseFloat(lat), lng: parseFloat(lng) });
      }
      return res.json({ address: '', lat: parseFloat(lat), lng: parseFloat(lng) });
    }

    // Forward geocode
    if (address) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ph&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      console.log('Forward geocode response:', JSON.stringify({ status: data.status, resultCount: data.results?.length, error_message: data.error_message }));
      if (data.status === 'OK' && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return res.json({ address: data.results[0].formatted_address, lat: loc.lat, lng: loc.lng });
      }
      return res.json({ address: '', lat: null, lng: null });
    }

    return res.status(400).json({ error: 'Provide "address" for forward geocode or "lat"+"lng" for reverse geocode' });
  } catch (err) {
    console.error('Geocode error:', err);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});

export default router;

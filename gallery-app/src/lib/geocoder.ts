let geocoder: google.maps.Geocoder | null = null;

function getGeocoder(): google.maps.Geocoder | null {
  if (!geocoder && window.google?.maps?.Geocoder) {
    geocoder = new google.maps.Geocoder();
  }
  return geocoder;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // Retry up to 3 times with delay to wait for Google Maps API to load
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = getGeocoder();
    if (!g) {
      await new Promise(r => setTimeout(r, 500));
      continue;
    }
    try {
      const result = await g.geocode({ address, region: 'PH' });
      if (result.results.length > 0) {
        const loc = result.results[0].geometry.location;
        return { lat: loc.lat(), lng: loc.lng() };
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  const g = getGeocoder();
  if (!g) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  try {
    const result = await g.geocode({ location: { lat, lng } });
    if (result.results.length > 0) {
      return result.results[0].formatted_address;
    }
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

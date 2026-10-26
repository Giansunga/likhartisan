export interface AddressPlace { code: string; name: string }
export interface AddressParts {
  version: '2026-Q2'; region: AddressPlace | null; province: AddressPlace | null;
  city: AddressPlace | null; barangay: AddressPlace | null; street: string;
}
export interface AddressCoordinates { lat: number; lng: number }
export const emptyAddressParts = (): AddressParts => ({ version: '2026-Q2', region: null, province: null, city: null, barangay: null, street: '' });
export function formattedAddress(parts: AddressParts) {
  return [parts.street.trim(), parts.barangay?.name, parts.city?.name, parts.province?.name, parts.region?.name, 'Philippines'].filter(Boolean).join(', ');
}
export function validAddressCoordinates(lat: unknown, lng: unknown): AddressCoordinates | null {
  if (!['string', 'number'].includes(typeof lat) || !['string', 'number'].includes(typeof lng) || String(lat).trim() === '' || String(lng).trim() === '') return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0) ? { lat: latitude, lng: longitude } : null;
}
export function readAddressParts(value: unknown): AddressParts | null {
  if (!value || typeof value !== 'object') return null;
  const parts = value as AddressParts;
  const place = (entry: unknown) => entry && typeof entry === 'object' && 'code' in entry && typeof entry.code === 'string' && 'name' in entry && typeof entry.name === 'string';
  return parts.version === '2026-Q2' && typeof parts.street === 'string' && place(parts.region) && place(parts.city) && place(parts.barangay) && (!parts.province || place(parts.province)) ? parts : null;
}

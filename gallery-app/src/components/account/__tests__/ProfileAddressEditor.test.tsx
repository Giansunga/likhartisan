import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileAddressEditor from '../ProfileAddressEditor';
import type { AccountProfileDraft } from '../accountProfile';
import { emptyAddressParts } from '../../../lib/profileAddress';

const mocks = vi.hoisted(() => ({ geocode: vi.fn(), change: vi.fn(), mapAvailable: true }));
vi.mock('../../../lib/geocoder', () => ({ geocodeAddress: mocks.geocode }));
vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: mocks.mapAvailable }),
  GoogleMap: ({ children, onClick }: { children: React.ReactNode; onClick: (e: unknown) => void }) => <div><button onClick={() => onClick({ latLng: { lat: () => 15.2, lng: () => 120.2 } })}>Refine map pin</button>{children}</div>,
  Marker: () => null,
}));
const ncr = { code: '1300000000', name: 'National Capital Region (NCR)' };
const luzon = { code: '0300000000', name: 'Central Luzon' };
const province = { code: '0305400000', name: 'Pampanga' };
const city = { code: '0305418000', name: 'Santo Tomas', provinceCode: province.code };
const barangay = { code: '0305418001', name: 'Poblacion', cityCode: city.code };
const manila = { code: '1380600000', name: 'City of Manila', provinceCode: null };
const regionData = { provinces: [province], cities: [city, { code: 'independent', name: 'Independent City', provinceCode: null }], barangays: [barangay] };
const initial: AccountProfileDraft = { fullName: 'Buyer', phone: '', address: 'Old address', addressLat: 15, addressLng: 120, addressParts: null };
function Editor({ value = initial }: { value?: AccountProfileDraft }) {
  const [draft, setDraft] = useState(value);
  return <ProfileAddressEditor draft={draft} disabled={false} onChange={d => { mocks.change(d); setDraft(d); }} />;
}
function choose(label: string, name: string) {
  const field = screen.getByRole('combobox', { name: label });
  fireEvent.focus(field); fireEvent.change(field, { target: { value: name } });
  fireEvent.click(screen.getByRole('option', { name }));
}
describe('Profile delivery address', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.mapAvailable = true;
    mocks.geocode.mockResolvedValue({ lat: 15.1, lng: 120.1 });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('regions.json') ? [ncr, luzon] : url.includes(ncr.code) ? { provinces: [], cities: [manila], barangays: [] } : regionData })));
  });
  it('preserves legacy values until replacement and resets child choices and stale pins', async () => {
    render(<Editor />);
    expect(screen.getByText('Old address')).toBeInTheDocument();
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace address' }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    choose('Region', luzon.name);
    await screen.findByRole('combobox', { name: 'Province' });
    choose('Province', province.name); choose('City / Municipality', city.name); choose('Barangay', barangay.name);
    fireEvent.change(screen.getByLabelText('House / unit, street or landmark'), { target: { value: '12 Main St' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find address on map' }));
    await screen.findByText(/Delivery pin: 15.10000/);
    fireEvent.click(screen.getByRole('button', { name: 'Refine map pin' }));
    expect(mocks.change).toHaveBeenLastCalledWith(expect.objectContaining({ addressLat: 15.2, addressLng: 120.2 }));
    choose('Region', ncr.name);
    expect(mocks.change).toHaveBeenLastCalledWith(expect.objectContaining({ addressParts: expect.objectContaining({ province: null, city: null, barangay: null }), addressLat: null, addressLng: null }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Province' })).not.toBeInTheDocument());
    choose('City / Municipality', manila.name);
    expect(screen.getByRole('combobox', { name: 'City / Municipality' })).toHaveValue(manila.name);
  });
  it('allows independent cities without a fabricated province', async () => {
    render(<Editor value={{ ...initial, addressParts: { ...emptyAddressParts(), region: luzon } }} />);
    await screen.findByRole('combobox', { name: 'Province' });
    choose('City / Municipality', 'Independent City');
    expect(mocks.change).toHaveBeenLastCalledWith(expect.objectContaining({ addressParts: expect.objectContaining({ province: null, city: { code: 'independent', name: 'Independent City' } }) }));
  });
  it('shows geocoding failure without reusing stale coordinates and supports keyboard choice', async () => {
    mocks.geocode.mockResolvedValue(null);
    render(<Editor value={{ ...initial, address: '12 Main St, Poblacion, Santo Tomas, Pampanga', addressLat: null, addressLng: null, addressParts: { version: '2026-Q2', region: luzon, province, city, barangay, street: '12 Main St' } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Find address on map' }));
    await screen.findByText(/Address could not be located/);
    expect(mocks.change).not.toHaveBeenCalled();
    const region = screen.getByRole('combobox', { name: 'Region' });
    fireEvent.focus(region); fireEvent.change(region, { target: { value: 'National' } });
    await screen.findByRole('option', { name: ncr.name });
    fireEvent.keyDown(region, { key: 'Enter' });
    expect(mocks.change).toHaveBeenLastCalledWith(expect.objectContaining({ addressParts: expect.objectContaining({ region: ncr }) }));
  });
  it('offers a retry if local location files cannot load', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    render(<Editor />);
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Retry locations' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

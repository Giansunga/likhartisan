import { useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { geocodeAddress } from '../../lib/geocoder';
import { emptyAddressParts, formattedAddress, validAddressCoordinates, type AddressParts, type AddressPlace } from '../../lib/profileAddress';
import type { AccountProfileDraft } from './accountProfile';
import LocationSelect from './LocationSelect';
import './ProfileAddressEditor.css';

interface RegionData {
  provinces: AddressPlace[];
  cities: (AddressPlace & { provinceCode: string | null })[];
  barangays: (AddressPlace & { cityCode: string })[];
}
const DATA_PATH = '/data/psgc-2026-q2';
async function loadData<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${DATA_PATH}/${path}.json`, { signal });
  if (!response.ok) throw new Error('Location choices could not be loaded.');
  return response.json();
}
export default function ProfileAddressEditor({ draft, error, disabled, onChange }: {
  draft: AccountProfileDraft; error?: string; disabled: boolean; onChange: (next: AccountProfileDraft) => void;
}) {
  const { isLoaded, loadError } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '' });
  const [regions, setRegions] = useState<AddressPlace[]>([]);
  const [regional, setRegional] = useState<{ code: string; data: RegionData } | null>(null);
  const [dataError, setDataError] = useState('');
  const [retry, setRetry] = useState(0);
  const [locating, setLocating] = useState(false);
  const [pinMessage, setPinMessage] = useState('');
  const sequence = useRef(0);
  const draftAddress = draft.address;
  useEffect(() => {
    sequence.current += 1;
    // Cancel any in-flight lookup when saving or replacing the address.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocating(false);
  }, [draftAddress, disabled]);
  const parts = draft.addressParts;
  const regionCode = parts?.region?.code;
  const data = regional && regional.code === regionCode ? regional.data : null;
  const coordinates = validAddressCoordinates(draft.addressLat, draft.addressLng);
  const complete = Boolean(parts?.region && parts.city && parts.barangay && parts.street.trim());
  useEffect(() => {
    const controller = new AbortController();
    void loadData<AddressPlace[]>('regions', controller.signal).then(setRegions).catch(e => { if (!controller.signal.aborted) setDataError(e.message); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    if (!regionCode) return;
    const controller = new AbortController();
    void loadData<RegionData>(regionCode, controller.signal).then(result => setRegional({ code: regionCode, data: result }))
      .catch(e => { if (!controller.signal.aborted) setDataError(e.message); });
    return () => controller.abort();
  }, [regionCode, retry]);
  useEffect(() => () => { sequence.current += 1; }, []);
  function changeParts(next: AddressParts) {
    sequence.current += 1; setLocating(false); setPinMessage('');
    onChange({ ...draft, addressParts: next, address: formattedAddress(next), addressLat: null, addressLng: null });
  }
  function clear() {
    sequence.current += 1; setLocating(false); setPinMessage('');
    onChange({ ...draft, address: '', addressParts: null, addressLat: null, addressLng: null });
  }
  async function locate() {
    const request = ++sequence.current;
    setLocating(true); setPinMessage('');
    try {
      const found = await geocodeAddress(draft.address);
      if (request !== sequence.current) return;
      const valid = found && validAddressCoordinates(found.lat, found.lng);
      if (!valid) { setPinMessage('Address could not be located. Refine a pin on the map, or try again. Courier delivery needs a saved pin.'); return; }
      onChange({ ...draft, addressLat: valid.lat, addressLng: valid.lng });
      setPinMessage('Check the pin, then save your changes.');
    } catch { if (request === sequence.current) setPinMessage('The map service is unavailable. Try again before courier checkout.'); }
    finally { if (request === sequence.current) setLocating(false); }
  }
  function refine(lat: number, lng: number) {
    const point = validAddressCoordinates(lat, lng);
    if (!point || !complete || disabled) return;
    sequence.current += 1; setLocating(false);
    onChange({ ...draft, addressLat: point.lat, addressLng: point.lng });
    setPinMessage('Pin updated in your draft. Save changes to use it at checkout.');
  }
  return <fieldset className="profile-address-editor" disabled={disabled}>
    <legend className="account-visually-hidden">Delivery address</legend>
    <p className="profile-address-help">Optional for pickup. Courier delivery uses your saved address and pin.</p>
    {!parts ? <>
      <address>{draft.address || 'No delivery address saved.'}</address>
      <button type="button" className="account-button account-button--secondary" onClick={() => changeParts(emptyAddressParts())}>{draft.address ? 'Replace address' : 'Add address'}</button>
    </> : <>
      <div className="profile-address-grid">
        <LocationSelect label="Region" value={parts.region} options={regions} onChange={region => changeParts({ ...emptyAddressParts(), region, street: parts.street })} />
        {Boolean(data?.provinces.length) && <LocationSelect label="Province" value={parts.province} options={data!.provinces} onChange={province => changeParts({ ...parts, province, city: null, barangay: null })} />}
        <LocationSelect label="City / Municipality" value={parts.city} options={(data?.cities || []).filter(c => parts.province ? c.provinceCode === parts.province.code : !c.provinceCode)} disabled={!data} onChange={city => changeParts({ ...parts, city: { code: city.code, name: city.name }, barangay: null })} />
        <LocationSelect label="Barangay" value={parts.barangay} options={(data?.barangays || []).filter(b => b.cityCode === parts.city?.code)} disabled={!parts.city || !data} onChange={barangay => changeParts({ ...parts, barangay: { code: barangay.code, name: barangay.name } })} />
      </div>
      {data?.cities.some(c => !c.provinceCode) && data.provinces.length > 0 && <p className="profile-address-help">For an independent city, leave Province unselected. {parts.province && <button type="button" onClick={() => changeParts({ ...parts, province: null, city: null, barangay: null })}>Choose independent city</button>}</p>}
      <label className="profile-address-street">House / unit, street or landmark<input value={parts.street} autoComplete="street-address" onChange={e => changeParts({ ...parts, street: e.target.value })} /></label>
      <address>{draft.address}</address>
      <button type="button" className="account-button account-button--secondary" disabled={!complete || !isLoaded || locating} onClick={() => void locate()}>{locating ? 'Finding address…' : 'Find address on map'}</button>
    </>}
    {dataError && <p role="alert">{dataError} <button type="button" onClick={() => { setDataError(''); setRetry(v => v + 1); }}>Retry locations</button></p>}
    {draft.address && <button type="button" className="profile-clear-address" onClick={clear}>Clear address</button>}
    {error && <p role="alert">{error}</p>}
    {pinMessage && <p role="status">{pinMessage}</p>}
    {loadError && <p role="status">Map unavailable. You can save your address; courier delivery needs a saved pin.</p>}
    {coordinates && <p className="profile-address-help">Delivery pin: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}</p>}
    {isLoaded && (coordinates || complete) && <>
      <p className="profile-address-help">Click the map or drag the pin to refine delivery. Changes are saved only with Save changes.</p>
      <GoogleMap mapContainerClassName="profile-address-map" center={coordinates || { lat: 12.8797, lng: 121.774 }} zoom={coordinates ? 16 : 6}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
        onClick={e => { if (e.latLng) refine(e.latLng.lat(), e.latLng.lng()); }}>
        {coordinates && <Marker position={coordinates} draggable={!disabled && complete} onDragEnd={e => { if (e.latLng) refine(e.latLng.lat(), e.latLng.lng()); }} />}
      </GoogleMap>
    </>}
  </fieldset>;
}

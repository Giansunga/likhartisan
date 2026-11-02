import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtisanShop } from '../../../types/artisan';
import ShopProfilePanel from '../ShopProfilePanel';

interface Result { data: ArtisanShop | null; error: { message: string } | null }
const mocks = vi.hoisted(() => ({
  shop: {} as ArtisanShop,
  persisted: {} as ArtisanShop,
  setShop: vi.fn(),
  read: vi.fn<() => Promise<Result>>(),
  write: vi.fn<(payload: Record<string, unknown>) => Promise<Result>>(),
  upload: vi.fn(),
  geocode: vi.fn(),
  refresh: null as null | (() => Promise<void>),
}));

vi.mock('../artisanContextValue', () => ({ useArtisanPortal: () => ({ shop: mocks.shop, setShop: mocks.setShop }) }));
vi.mock('../../../lib/geocoder', () => ({ geocodeAddress: mocks.geocode }));
vi.mock('../../../realtime/usePortalRealtimeRefresh', () => ({ usePortalRealtimeRefresh: (_tables: string[], refresh: () => Promise<void>) => { mocks.refresh = refresh; } }));
vi.mock('../../../lib/supabase', () => ({ supabase: {
  from: () => {
    let payload: Record<string, unknown> | undefined;
    const builder = {
      select: () => builder,
      eq: () => builder,
      update: (value: Record<string, unknown>) => { payload = value; return builder; },
      single: () => payload ? mocks.write(payload) : mocks.read(),
    };
    return builder;
  },
  storage: { from: () => ({ upload: mocks.upload, getPublicUrl: () => ({ data: { publicUrl: 'https://images.test/uploaded.jpg' } }) }) },
} }));

function shop(): ArtisanShop {
  return { id: 'shop-1', name: 'Clay Studio', email: 'seller@example.test', image: 'https://images.test/profile.jpg', banner: '', description: 'Original tagline', about: 'Original story', location: 'Manila, Philippines', latitude: 14.6, longitude: 120.98 };
}

function deferred() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>(done => { resolve = done; });
  return { promise, resolve };
}

function renderProfile() { return render(<MemoryRouter><ShopProfilePanel /></MemoryRouter>); }
function nameField() { return screen.getByLabelText(/Shop name/); }
function taglineField() { return screen.getByLabelText(/Storefront tagline/); }
function profileUpload() { return screen.getByRole('heading', { name: 'Profile photo' }).parentElement!.querySelector('input[type="file"]')!; }

beforeEach(() => {
  mocks.shop = shop();
  mocks.persisted = shop();
  mocks.refresh = null;
  mocks.setShop.mockReset().mockImplementation((value: ArtisanShop) => { mocks.shop = value; });
  mocks.read.mockReset().mockImplementation(async () => ({ data: mocks.persisted, error: null }));
  mocks.write.mockReset().mockImplementation(async payload => {
    mocks.persisted = { ...mocks.persisted, ...payload } as ArtisanShop;
    return { data: mocks.persisted, error: null };
  });
  mocks.upload.mockReset().mockResolvedValue({ error: null });
  mocks.geocode.mockReset().mockResolvedValue({ lat: 14.6, lng: 120.98 });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:profile-preview');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('shop profile persistence and recovery', () => {
  it('does not overwrite edits entered during a clean profile refresh', async () => {
    const pending = deferred();
    mocks.read.mockReturnValue(pending.promise);
    renderProfile();
    let refreshing: Promise<void> | undefined;
    act(() => { refreshing = mocks.refresh?.(); });
    fireEvent.change(nameField(), { target: { value: 'My unsaved studio name' } });
    await act(async () => { pending.resolve({ data: { ...shop(), name: 'Remote studio name' }, error: null }); await refreshing; });
    expect(nameField()).toHaveValue('My unsaved studio name');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
  });

  it.each(['rejected', 'zero-row'] as const)('keeps the draft and releases busy state after a %s save', async kind => {
    if (kind === 'rejected') mocks.write.mockRejectedValue(new Error('Profile service unavailable'));
    else mocks.write.mockResolvedValue({ data: null, error: null });
    renderProfile();
    fireEvent.change(nameField(), { target: { value: 'Retry this studio name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(kind === 'rejected' ? 'Profile service unavailable' : 'The saved shop could not be confirmed.');
    expect(nameField()).toHaveValue('Retry this studio name');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(screen.queryByText('Your shop profile is live and up to date.')).not.toBeInTheDocument();
    expect(mocks.setShop).not.toHaveBeenCalled();
  });

  it('shows a successful saved snapshot after remounting the profile', async () => {
    const first = renderProfile();
    fireEvent.change(nameField(), { target: { value: '  Renamed Clay Studio  ' } });
    fireEvent.change(taglineField(), { target: { value: 'New handmade pottery collection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your shop profile is live and up to date.');
    expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed Clay Studio', description: 'New handmade pottery collection' }));
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    first.unmount();
    renderProfile();
    expect(nameField()).toHaveValue('Renamed Clay Studio');
    expect(taglineField()).toHaveValue('New handmade pottery collection');
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('preserves newer text edits made while the submitted snapshot is being saved', async () => {
    const pending = deferred();
    mocks.write.mockReturnValueOnce(pending.promise);
    renderProfile();
    fireEvent.change(nameField(), { target: { value: 'Submitted studio name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    fireEvent.change(nameField(), { target: { value: 'Newer unsaved studio name' } });
    await act(async () => { pending.resolve({ data: { ...shop(), name: 'Submitted studio name' }, error: null }); });
    expect(nameField()).toHaveValue('Newer unsaved studio name');
    expect(mocks.shop.name).toBe('Submitted studio name');
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
    expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
  });

  it('does not upload the same confirmed image again when text was edited during its save', async () => {
    const pending = deferred();
    mocks.write.mockReturnValueOnce(pending.promise);
    renderProfile();
    fireEvent.change(profileUpload(), { target: { files: [new File(['jpg'], 'profile.jpg', { type: 'image/jpeg' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    fireEvent.change(taglineField(), { target: { value: 'New tagline entered during save' } });
    await act(async () => { pending.resolve({ data: { ...shop(), image: 'https://images.test/uploaded.jpg' }, error: null }); });
    expect(taglineField()).toHaveValue('New tagline entered during save');
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.write.mock.calls[1][0]).toMatchObject({ description: 'New tagline entered during save', image: 'https://images.test/uploaded.jpg' });
  });

  it('does not start a profile refresh that can race with an active save', async () => {
    const pending = deferred();
    mocks.write.mockReturnValueOnce(pending.promise);
    renderProfile();
    fireEvent.change(nameField(), { target: { value: 'Saved studio name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    await act(async () => { await mocks.refresh?.(); });
    expect(mocks.read).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ data: { ...shop(), name: 'Saved studio name' }, error: null }); });
    expect(mocks.shop.name).toBe('Saved studio name');
  });

  it.each(['unsupported type', 'oversized image'] as const)('keeps file validation for an %s', async kind => {
    renderProfile();
    const file = kind === 'unsupported type' ? new File(['svg'], 'profile.svg', { type: 'image/svg+xml' }) : new File(['jpg'], 'profile.jpg', { type: 'image/jpeg' });
    if (kind === 'oversized image') Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 });
    fireEvent.change(profileUpload(), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPG, PNG, or WebP image no larger than 5 MB.');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  });
});

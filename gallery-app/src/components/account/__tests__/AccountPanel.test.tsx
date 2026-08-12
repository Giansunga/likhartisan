import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import AccountPanel from '../AccountPanel';

const mocks = vi.hoisted(() => ({
  user: null as User | null,
  loading: false,
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  geocodeAddress: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.loading }),
}));

vi.mock('../../../lib/geocoder', () => ({
  geocodeAddress: mocks.geocodeAddress,
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mocks.updateUser,
      signInWithPassword: mocks.signInWithPassword,
    },
    storage: {
      from: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
    },
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeUser(metadata: Record<string, unknown> = {}): User {
  return {
    id: 'buyer-1',
    email: 'maria@example.com',
    user_metadata: {
      name: 'Maria Santos',
      phone: '09171234567',
      address: 'San Fernando, Pampanga',
      address_lat: 15.03,
      address_lng: 120.68,
      ...metadata,
    },
  } as unknown as User;
}

describe('AccountPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loading = false;
    mocks.user = makeUser();
    mocks.geocodeAddress.mockResolvedValue({ lat: 14.6, lng: 121.0 });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/avatar.jpg' } });
    mocks.updateUser.mockImplementation(async ({ data, password }: { data?: Record<string, unknown>; password?: string }) => ({
      data: { user: password ? mocks.user : makeUser(data) },
      error: null,
    }));
  });

  it('renders dedicated loading and signed-out states', () => {
    mocks.loading = true;
    const { rerender } = render(<AccountPanel />);
    expect(screen.getByLabelText('Loading account')).toHaveAttribute('aria-busy', 'true');

    mocks.loading = false;
    mocks.user = null;
    rerender(<AccountPanel />);
    expect(screen.getByRole('heading', { name: 'Sign in to manage your account' })).toBeInTheDocument();
  });

  it('masks email by default and enables saving only after a change', () => {
    render(<AccountPanel />);
    expect(screen.getByLabelText(/^Email address/)).not.toHaveValue('maria@example.com');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByLabelText(/^Email address/)).toHaveValue('maria@example.com');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Maria Cruz' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  it('geocodes a changed address and saves normalized metadata', async () => {
    render(<AccountPanel />);
    fireEvent.change(screen.getByLabelText(/^Full address/), { target: { value: '  Quezon City, Metro Manila  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        address: 'Quezon City, Metro Manila',
        address_lat: 14.6,
        address_lng: 121,
      }),
    }));
    expect(screen.getByText('Your account details are up to date.')).toBeInTheDocument();
  });

  it('preserves changed address text but clears stale coordinates when geocoding fails', async () => {
    mocks.geocodeAddress.mockResolvedValue(null);
    render(<AccountPanel />);
    fireEvent.change(screen.getByLabelText(/^Full address/), { target: { value: 'New delivery address' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({ address: 'New delivery address', address_lat: null, address_lng: null }),
    }));
    expect(screen.getByText(/address pin will be confirmed again/i)).toBeInTheDocument();
  });

  it('validates the password dialog before re-authenticating', async () => {
    render(<AccountPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Complete all password fields.');

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'maria@example.com', password: 'old-password' }));
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-password' });
  });
});

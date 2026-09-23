import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../AuthContext';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock('../../lib/activityApi', () => ({ recordSecurityActivity: vi.fn() }));

function SessionStatus() {
  const { user, loading } = useAuth();
  return <p>{loading ? 'Loading' : user?.email ?? 'Signed out'}</p>;
}

describe('auth provider session restoration', () => {
  it('restores the existing Supabase session after remount', async () => {
    const session = { user: { id: 'buyer-1', email: 'buyer@example.com' } };
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });

    const first = render(<AuthProvider><SessionStatus /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('buyer@example.com')).toBeInTheDocument());
    first.unmount();

    render(<AuthProvider><SessionStatus /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('buyer@example.com')).toBeInTheDocument());
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });
});

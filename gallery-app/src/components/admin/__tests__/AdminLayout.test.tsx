import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLayout from '../AdminLayout';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  from: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    auth: { signOut: vi.fn() },
  },
}));

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/" element={<div>Storefront</div>} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<div>Admin dashboard content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminLayout access control', () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
    mocks.from.mockReset();
  });

  it('allows an authenticated configured admin without requiring a role row', async () => {
    mocks.useAuth.mockReturnValue({
      user: { id: 'admin-id', email: 'GIANSUNGA396@GMAIL.COM' },
      loading: false,
    });

    renderAdminRoute();

    expect(await screen.findByText('Admin dashboard content')).toBeDefined();
    expect(screen.getByText('Activity Logs').closest('a')?.getAttribute('href')).toBe('/admin/activity');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('allows a dynamically assigned super admin role', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'role-id' }, error: null });
    const eqRole = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqRole }));
    const select = vi.fn(() => ({ eq: eqUser }));
    mocks.from.mockReturnValue({ select });
    mocks.useAuth.mockReturnValue({
      user: { id: 'role-admin-id', email: 'role-admin@example.com' },
      loading: false,
    });

    renderAdminRoute();

    expect(await screen.findByText('Admin dashboard content')).toBeDefined();
    expect(mocks.from).toHaveBeenCalledWith('user_roles');
  });

  it('redirects a user without admin access', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqRole = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ eq: eqRole }));
    const select = vi.fn(() => ({ eq: eqUser }));
    mocks.from.mockReturnValue({ select });
    mocks.useAuth.mockReturnValue({
      user: { id: 'buyer-id', email: 'buyer@example.com' },
      loading: false,
    });

    renderAdminRoute();

    await waitFor(() => expect(screen.getByText('Storefront')).toBeDefined());
  });
});

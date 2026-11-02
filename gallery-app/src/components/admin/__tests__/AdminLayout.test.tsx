import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    expect(screen.getByText('Analytics').closest('a')?.getAttribute('href')).toBe('/admin/analytics');
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


it('shows a retryable access outage instead of treating it as a denied role', async () => {
  const maybeSingle = vi.fn().mockRejectedValueOnce(new Error('Role service unavailable')).mockResolvedValue({ data: { id: 'role' }, error: null });
  const builder = { select: () => builder, eq: () => builder, maybeSingle };
  mocks.from.mockReturnValue(builder);
  mocks.useAuth.mockReturnValue({ user: { id: 'dynamic-admin', email: 'admin@example.test' }, loading: false });
  renderAdminRoute();
  expect(await screen.findByRole('alert')).toHaveTextContent('Role service unavailable');
  expect(screen.queryByText('Storefront')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Admin dashboard content')).toBeInTheDocument();
});

it('removes the old admin screen immediately when identity changes', async () => {
  const maybeSingle = vi.fn().mockReturnValue(new Promise(() => undefined));
  const builder = { select: () => builder, eq: () => builder, maybeSingle };
  mocks.from.mockReturnValue(builder);
  mocks.useAuth.mockReturnValue({ user: { id: 'old-admin', email: 'giansunga396@gmail.com' }, loading: false });
  const view = renderAdminRoute();
  await screen.findByText('Admin dashboard content');
  mocks.useAuth.mockReturnValue({ user: { id: 'new-buyer', email: 'buyer@example.test' }, loading: false });
  act(() => view.rerender(<MemoryRouter initialEntries={['/admin']}><Routes><Route path="/admin" element={<AdminLayout />}><Route index element={<div>Admin dashboard content</div>} /></Route></Routes></MemoryRouter>));
  expect(screen.queryByText('Admin dashboard content')).not.toBeInTheDocument();
  expect(screen.getByText('Loading...')).toBeInTheDocument();
});

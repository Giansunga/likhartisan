import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoleAssignationPage from '../RoleAssignationPage';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), useAuth: vi.fn() }));

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: mocks.useAuth }));
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: vi.fn() } }));

function renderPage() {
  return render(<MemoryRouter><RoleAssignationPage /></MemoryRouter>);
}

describe('RoleAssignationPage super-admin promotion', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.useAuth.mockReturnValue({ user: { id: 'manager-id', email: 'giansunga396@gmail.com' } });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'list_users_with_roles') {
        return Promise.resolve({ data: [{ id: 'buyer-id', email: 'buyer@example.com', created_at: '2026-08-05T00:00:00Z', roles: [{ role: 'buyer', shop_id: null }] }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('lets the designated manager promote a user to super admin through the drawer', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Manage access' }));
    expect(screen.getByRole('heading', { name: 'buyer@example.com' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Grant Super Admin/ }));
    expect(screen.getByText('Give this user access to the super-admin dashboard and administrative tools?')).toBeDefined();
    fireEvent.click(within(screen.getAllByRole('dialog')[1]).getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('assign_super_admin', { p_user_id: 'buyer-id' }));
  });

  it('does not show super-admin controls to another super admin', async () => {
    mocks.useAuth.mockReturnValue({ user: { id: 'other-admin-id', email: 'other-admin@example.com' } });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Manage access' }));
    expect(screen.queryByRole('button', { name: /Grant Super Admin/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Grant Shop Owner/ })).toBeDefined();
  });

  it('opens protected accounts as read-only and closes the drawer with Escape', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'list_users_with_roles') {
        return Promise.resolve({ data: [{ id: 'founder-id', email: 'founder@example.com', created_at: '2026-08-05T00:00:00Z', roles: [{ role: 'founder', shop_id: null }] }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'View access' }));
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('Founder accounts are protected from role changes.')).toBeDefined();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

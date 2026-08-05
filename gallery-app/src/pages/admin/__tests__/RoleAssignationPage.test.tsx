import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoleAssignationPage from '../RoleAssignationPage';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: mocks.useAuth,
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
  },
}));

describe('RoleAssignationPage super-admin promotion', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.useAuth.mockReturnValue({
      user: { id: 'manager-id', email: 'giansunga396@gmail.com' },
    });
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'list_users_with_roles') {
        return Promise.resolve({
          data: [{
            id: 'buyer-id',
            email: 'buyer@example.com',
            created_at: '2026-08-05T00:00:00Z',
            roles: [{ role: 'buyer', shop_id: null }],
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('lets the designated manager promote a user to super admin', async () => {
    render(<RoleAssignationPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Adjust Role' }));
    expect(screen.getByText('Which role should buyer@example.com be adjusted to?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Super Admin/ }));
    expect(screen.getByText('Promote buyer@example.com to Super Admin?')).toBeDefined();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Promote' }));

    await waitFor(() => {
      expect(mocks.rpc).toHaveBeenCalledWith('assign_super_admin', {
        p_user_id: 'buyer-id',
      });
    });
  });

  it('does not show the control to another super admin', async () => {
    mocks.useAuth.mockReturnValue({
      user: { id: 'other-admin-id', email: 'other-admin@example.com' },
    });

    render(<RoleAssignationPage />);

    expect(await screen.findByText('buyer@example.com')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust Role' }));
    expect(screen.queryByRole('button', { name: /Super Admin/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Shop Owner/ })).toBeDefined();
  });
});

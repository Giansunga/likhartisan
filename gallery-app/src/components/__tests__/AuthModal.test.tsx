import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthModal from '../AuthModal';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn() }));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword } },
}));

function submitSignUp() {
  const form = screen.getByRole('button', { name: 'Create Account' }).closest('form')!;
  fireEvent.change(form.querySelector('input[name="name"]')!, { target: { value: 'Maria Santos' } });
  fireEvent.change(form.querySelector('input[name="email"]')!, { target: { value: 'maria@example.com' } });
  fireEvent.change(form.querySelector('input[name="password"]')!, { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
}

function renderModal(props: React.ComponentProps<typeof AuthModal>) {
  render(<MemoryRouter><Routes>
    <Route path="/" element={<><AuthModal {...props} /><p>Home destination</p></>} />
    <Route path="/verify-email" element={<p>Verification destination</p>} />
  </Routes></MemoryRouter>);
}

describe('navbar auth modal sign-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
  });

  it('keeps an unconfirmed user in the modal without reporting sign-in', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'buyer-1' }, session: null }, error: null });
    const onAuthChange = vi.fn();
    const onClose = vi.fn();
    renderModal({ open: true, initialView: 'signup', onAuthChange, onClose });
    await screen.findByRole('button', { name: 'Create Account' });
    submitSignUp();
    expect(await screen.findByText('Verification destination')).toBeInTheDocument();
    expect(sessionStorage.getItem('likhartisan:pending-signup-email')).toBe('maria@example.com');
    expect(onAuthChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('reports sign-in when sign-up returns a session', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'buyer-1' }, session: { user: { id: 'buyer-1' } } }, error: null });
    const onAuthChange = vi.fn();
    const onClose = vi.fn();
    renderModal({ open: true, initialView: 'signup', onAuthChange, onClose });
    await screen.findByRole('button', { name: 'Create Account' });
    submitSignUp();
    await waitFor(() => expect(onAuthChange).toHaveBeenCalledWith({ id: 'buyer-1' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('continues to sign in through the navbar modal', async () => {
    const user = { id: 'buyer-1', email: 'maria@example.com' };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    const onAuthChange = vi.fn();
    const onClose = vi.fn();
    renderModal({ open: true, initialView: 'signin', onAuthChange, onClose });
    const form = screen.getByRole('button', { name: 'Log In' }).closest('form')!;
    fireEvent.change(form.querySelector('input[name="email"]')!, { target: { value: 'maria@example.com' } });
    fireEvent.change(form.querySelector('input[name="password"]')!, { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() => expect(onAuthChange).toHaveBeenCalledWith(user));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

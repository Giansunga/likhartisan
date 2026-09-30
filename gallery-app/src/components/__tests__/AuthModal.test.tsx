import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AuthModal from '../AuthModal';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), signInWithPassword: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: {
    signUp: mocks.signUp, signInWithPassword: mocks.signInWithPassword,
    verifyOtp: mocks.verifyOtp, resend: mocks.resend,
  } },
}));

const pendingKey = 'likhartisan:pending-signup-email';

function renderModal(initialView: 'signin' | 'signup' | 'verify' = 'signup') {
  const onAuthChange = vi.fn();
  const onClose = vi.fn();
  const props = { open: true, initialView, onAuthChange, onClose };
  const result = render(<MemoryRouter><AuthModal {...props} /></MemoryRouter>);
  return { ...result, onAuthChange, onClose, props };
}

function fillSignup(password = 'Validpass1!') {
  const form = screen.getByRole('button', { name: 'Create Account' }).closest('form')!;
  fireEvent.change(form.querySelector('input[name="name"]')!, { target: { value: 'Maria Santos' } });
  fireEvent.change(form.querySelector('input[name="email"]')!, { target: { value: 'maria@example.com' } });
  fireEvent.change(form.querySelector('input[name="password"]')!, { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
}

describe('account popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  });

  it.each(['short1!', 'lowercase1!', 'Uppercase!', 'Uppercase12'])(
    'rejects a password that misses a requirement: %s', async password => {
      renderModal();
      await screen.findByRole('button', { name: 'Create Account' });
      fillSignup(password);
      expect(await screen.findByRole('alert')).toHaveTextContent('At least 8 characters, 1 uppercase letter, 1 number, and 1 symbol.');
      expect(screen.getAllByText('At least 8 characters, 1 uppercase letter, 1 number, and 1 symbol.')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveStyle({ color: '#B91C1C' });
      expect(mocks.signUp).not.toHaveBeenCalled();
    },
  );

  it('keeps the popup open and shows the code form after signup', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'buyer-1' }, session: null }, error: null });
    const { onClose, onAuthChange } = renderModal();
    await screen.findByRole('button', { name: 'Create Account' });
    fillSignup('PASSWORD1!');
    expect(await screen.findByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('maria@example.com');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByText('Create a different account')).not.toBeInTheDocument();
    expect(sessionStorage.getItem(pendingKey)).toBe('maria@example.com');
    expect(mocks.signUp).toHaveBeenCalledWith({ email: 'maria@example.com', password: 'PASSWORD1!', options: { data: { name: 'Maria Santos' } } });
    expect(onClose).not.toHaveBeenCalled();
    expect(onAuthChange).not.toHaveBeenCalled();
  });

  it('verifies the code, clears the pending address, and reports sign-in', async () => {
    sessionStorage.setItem(pendingKey, 'maria@example.com');
    const user = { id: 'buyer-1', email: 'maria@example.com' };
    mocks.verifyOtp.mockResolvedValue({ data: { session: { user } }, error: null });
    const { onAuthChange, onClose } = renderModal('verify');
    fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
    await waitFor(() => expect(onAuthChange).toHaveBeenCalledWith(user));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'maria@example.com', token: '12345678', type: 'email' });
    expect(sessionStorage.getItem(pendingKey)).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps an invalid code on the form and allows resend to the entered address', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Token has expired or is invalid' } });
    mocks.resend.mockResolvedValue({ error: null });
    renderModal('verify');
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '11111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired or is invalid');
    fireEvent.click(screen.getByRole('button', { name: 'resend code' }));
    expect(await screen.findByRole('status')).toHaveTextContent('new@example.com');
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'new@example.com' });
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('reopens the code step for a pending signup and lets Back return to signup', async () => {
    sessionStorage.setItem(pendingKey, 'maria@example.com');
    renderModal('signup');
    expect(await screen.findByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Create Account' })).toBeInTheDocument();
  });

  it('asks for an address when a verification link opens in another browser', async () => {
    renderModal('verify');
    expect(await screen.findByLabelText('Email address')).toHaveValue('');
  });

  it('retains login with an existing password', async () => {
    const user = { id: 'buyer-1', email: 'maria@example.com' };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    const { onAuthChange } = renderModal('signin');
    const form = screen.getByRole('button', { name: 'Log In' }).closest('form')!;
    fireEvent.change(form.querySelector('input[name="email"]')!, { target: { value: 'maria@example.com' } });
    fireEvent.change(form.querySelector('input[name="password"]')!, { target: { value: 'old-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    await waitFor(() => expect(onAuthChange).toHaveBeenCalledWith(user));
  });
});

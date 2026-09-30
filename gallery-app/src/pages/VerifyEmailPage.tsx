import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAuthDestination } from '../lib/authDestination';
import { clearPendingSignupEmail, getPendingSignupEmail, savePendingSignupEmail } from '../lib/pendingSignupEmail';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(getPendingSignupEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'verify' | 'resend' | null>(null);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setMessage('');
    const address = email.trim();
    if (!/^\d{8}$/.test(code)) {
      setError('Enter the eight-digit code from your email.');
      return;
    }
    setBusy('verify');
    try {
      const { data, error: authError } = await supabase.auth.verifyOtp({
        email: address,
        token: code,
        type: 'email',
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.session?.user) {
        setError('Email verification could not be completed. Please try again.');
        return;
      }
      clearPendingSignupEmail();
      navigate(await getAuthDestination(data.session.user), { replace: true });
    } catch {
      setError('Email verification could not be completed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function handleResend() {
    if (busy) return;
    setError('');
    setMessage('');
    const address = email.trim();
    if (!address) {
      setError('Enter the email address you used to create your account.');
      return;
    }
    setBusy('resend');
    try {
      const { error: authError } = await supabase.auth.resend({ type: 'signup', email: address });
      if (authError) {
        setError(authError.message);
        return;
      }
      savePendingSignupEmail(address);
      setMessage(`A new code was sent to ${address}.`);
    } catch {
      setError('A new code could not be sent. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4" style={{ paddingTop: 'var(--nav-height)' }}>
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Verify your email</h1>
        <p className="text-brown-medium text-center mb-8">Enter the eight-digit code we sent when you created your account.</p>

        {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-5 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}

        <form className="space-y-5" onSubmit={handleVerify}>
          <div>
            <label htmlFor="verification-email" className="block text-sm font-medium text-brown-dark mb-1">Email address</label>
            <input id="verification-email" type="email" required autoComplete="email" value={email}
              onChange={event => { setEmail(event.target.value); savePendingSignupEmail(event.target.value); }}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div>
            <label htmlFor="verification-code" className="block text-sm font-medium text-brown-dark mb-1">Verification code</label>
            <input id="verification-code" type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={8}
              value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark tracking-widest text-center text-xl" />
          </div>
          <button type="submit" disabled={busy !== null}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === 'verify' ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <p className="text-center text-brown-medium text-sm mt-6">Didn't get the code? Check your spam folder or{' '}
          <button type="button" disabled={busy !== null} onClick={handleResend}
            className="text-primary hover:underline font-medium disabled:opacity-50 disabled:cursor-not-allowed">
            {busy === 'resend' ? 'Sending...' : 'resend code'}
          </button>.
        </p>
        <p className="text-center text-brown-medium text-sm mt-4"><Link to="/signin" className="text-primary hover:underline font-medium">Back to sign in</Link></p>
      </div>
    </div>
  );
}

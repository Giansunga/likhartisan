import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { recordSecurityActivity, signOutWithActivity } from '../lib/activityApi';
import './UpdatePasswordPage.css';

export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setTokenReady(true);
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, recoverySession) => {
        if (event === 'PASSWORD_RECOVERY' && recoverySession && mounted) {
          setTokenReady(true);
          setTokenError('');
          if (timer) clearTimeout(timer);
        }
      });
      unsubscribe = () => subscription.unsubscribe();
      timer = setTimeout(() => {
        if (mounted) setTokenError('This reset link has expired or is invalid.');
      }, 3000);
    }).catch(() => {
      if (mounted) setTokenError('We could not verify this reset link.');
    });

    return () => {
      mounted = false;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, []);

  function goToLogin() {
    navigate('/');
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-auth', { detail: 'signin' })), 100);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    await recordSecurityActivity('auth.password_reset');
    await signOutWithActivity();
    setSuccess(true);
    setTimeout(goToLogin, 3000);
  }

  return (
    <main className="reset-page">
      <div className="reset-page__content">
        <Link className="reset-page__brand" to="/" aria-label="LikhArtisan home">
          <img src="/images/likhartisan-brown-wordmark.png" alt="LikhArtisan" />
        </Link>

        <section className="reset-card" aria-labelledby="reset-page-title">
          {success ? (
            <div className="reset-state reset-state--success" role="status">
              <span className="reset-state__icon" aria-hidden="true"><Check size={27} strokeWidth={2.4} /></span>
              <p className="reset-card__eyebrow">Password changed</p>
              <h1 id="reset-page-title">You’re all set</h1>
              <p>Your password has been updated. We’ll take you to sign in shortly.</p>
              <button className="reset-card__primary" type="button" onClick={goToLogin}>Go to login</button>
            </div>
          ) : (
            <>
              <div className="reset-card__intro">
                <p className="reset-card__eyebrow">Account recovery</p>
                <h1 id="reset-page-title">Reset your password</h1>
                <p>Choose a new password to get back to your LikhArtisan account.</p>
              </div>

              {tokenReady ? (
                <form className="reset-form" onSubmit={handleSubmit}>
                  {error && <div className="reset-card__message reset-card__message--error" role="alert">{error}</div>}

                  <div className="reset-form__field">
                    <label htmlFor="reset-new-password">New password</label>
                    <div className="reset-form__input-wrap">
                      <input
                        id="reset-new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        aria-describedby="reset-password-hint"
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(value => !value)}
                      >
                        {showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                      </button>
                    </div>
                    <p className="reset-form__hint" id="reset-password-hint">At least 6 characters</p>
                  </div>

                  <div className="reset-form__field">
                    <label htmlFor="reset-confirm-password">Confirm new password</label>
                    <div className="reset-form__input-wrap">
                      <input
                        id="reset-confirm-password"
                        type={showConfirmation ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={event => setConfirmPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'}
                        aria-pressed={showConfirmation}
                        onClick={() => setShowConfirmation(value => !value)}
                      >
                        {showConfirmation ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                      </button>
                    </div>
                  </div>

                  <button className="reset-card__primary" type="submit" disabled={loading}>
                    {loading ? <><LoaderCircle className="reset-card__spinner" size={18} aria-hidden="true" /> Updating password…</> : 'Update password'}
                  </button>
                </form>
              ) : tokenError ? (
                <div className="reset-state" role="alert">
                  <div className="reset-card__message reset-card__message--error">{tokenError}</div>
                  <p>Request a new email to continue resetting your password.</p>
                  <Link className="reset-card__primary" to="/forgot-password">Request a new link</Link>
                </div>
              ) : (
                <div className="reset-state" role="status">
                  <LoaderCircle className="reset-card__spinner reset-card__spinner--large" size={31} aria-hidden="true" />
                  <p>Checking your reset link…</p>
                </div>
              )}

              <div className="reset-card__footer">
                <button type="button" onClick={goToLogin}><ArrowLeft size={16} aria-hidden="true" /> Back to login</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

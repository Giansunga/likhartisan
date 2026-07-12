import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

type View = 'signin' | 'signup' | 'forgot';

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthChange: (email?: string) => void;
  initialView?: View;
}

// ── shared Google SVG ──────────────────────────────────────────
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

// ── Eye icon for password toggle ───────────────────────────────
const EyeIcon = ({ show }: { show: boolean }) =>
  show ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

// ── Inline styles ──────────────────────────────────────────────
const S = {
  label:  { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#3D2B1F', marginBottom: '6px', letterSpacing: '0.01em' } as React.CSSProperties,
  input:  { width: '100%', padding: '11px 14px', border: '1.5px solid #DDD5CC', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', background: '#FAFAF9', color: '#3D2B1F', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s' } as React.CSSProperties,
  btn:    { width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: '#823E0B', color: '#fff', fontWeight: 700, fontSize: '0.875rem', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.15s' } as React.CSSProperties,
  googleBtn: { width: '100%', padding: '11px 16px', borderRadius: '8px', border: '1.5px solid #DDD5CC', background: '#fff', color: '#3D2B1F', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: 'background 0.15s', fontFamily: 'inherit' } as React.CSSProperties,
  divider: { display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0' } as React.CSSProperties,
  line:   { flex: 1, height: '1px', background: '#E8E0D8' } as React.CSSProperties,
  or:     { fontSize: '0.75rem', color: '#A89688', fontWeight: 500, whiteSpace: 'nowrap' } as React.CSSProperties,
};

export default function AuthModal({ open, onClose, onAuthChange, initialView }: Props) {
  const [view, setView]           = useState<View>('signin');
  const [error, setError]         = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [showPw2, setShowPw2]     = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState('');

  useEffect(() => {
    if (open) {
      setView(initialView || 'signin');
      setError('');
      setShowPw(false);
      setShowPw2(false);
      setShowSuccess(false);
      setSuccessEmail('');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      // Auto-focus first input after render
      requestAnimationFrame(() => {
        const modal = document.querySelector('[data-auth-modal]');
        const firstInput = modal?.querySelector('input') as HTMLInputElement | null;
        firstInput?.focus();
      });

      // Escape key handler
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      document.addEventListener('keydown', handleEscape);

      // Focus trap
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;
        const modal = document.querySelector('[data-auth-modal]');
        if (!modal) return;
        const focusable = modal.querySelectorAll<HTMLElement>('input, button, a, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      };
      document.addEventListener('keydown', handleTab);

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('keydown', handleTab);
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  }, [open, initialView, onClose]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const form = e.target as HTMLFormElement;
    const email    = (form.elements.namedItem('email')    as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); return; }
    onAuthChange(email);
    onClose();
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const form = e.target as HTMLFormElement;
    const name     = (form.elements.namedItem('name')     as HTMLInputElement).value;
    const email    = (form.elements.namedItem('email')    as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    const { error: err } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (err) { setError(err.message); return; }
    onAuthChange(email);
    onClose();
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const form = e.target as HTMLFormElement;
    const email = (form.elements.namedItem('email') as HTMLInputElement).value;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (err) { setError(err.message); return; }
    setSuccessEmail(email);
    setShowSuccess(true);
  }

  async function handleGoogleSignIn() {
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (err) setError(err.message);
  }

  if (!open) return null;

  return (
    /* ── Dark backdrop ── */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10, 6, 3, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1,    y: 0 }}
        exit={{   opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
        data-auth-modal
        style={{
          display: 'flex',
          width: '100%', maxWidth: '820px',
          background: '#fff',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          position: 'relative',
        }}
      >
        {/* ── LEFT: Pottery image ── */}
        <div style={{
          flex: '0 0 42%',
          position: 'relative',
          display: 'none',
        }}
          className="auth-modal-image-panel"
        >
          <img
            src="/images/pot-picture.png"
            alt="Artisan shaping pottery on a wheel"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
          />
          {/* warm sepia overlay matching the reference */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(160deg, rgba(180,120,60,0.18) 0%, rgba(60,30,10,0.35) 100%)',
          }} />
        </div>

        {/* ── RIGHT: Form ── */}
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          padding: '40px 44px',
          background: '#FAF8F5',
          overflowY: 'auto',
        }}>
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '32px', height: '32px', borderRadius: '8px',
              border: 'none', background: '#F0EBE4',
              color: '#7A6558', fontSize: '1.1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background 0.15s',
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#E3D9CF')}
            onMouseLeave={e => (e.currentTarget.style.background = '#F0EBE4')}
          >
            ×
          </button>

          {/* Error banner */}
          {error && (
            <div role="alert" aria-live="polite" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.82rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ════ SIGN IN ════ */}
            {view === 'signin' && (
              <motion.div key="signin" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2A1A0E', marginBottom: '24px', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
                  Log in
                </h1>

                <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Email */}
                  <div>
                    <label style={S.label}>E-mail Address</label>
                    <input
                      type="email" name="email" required
                      placeholder="e.g., name@example.com"
                      style={S.input}
                      onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                      onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                    />
                  </div>

                  {/* Password */}
                  <div>
                    <label style={S.label}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPw ? 'text' : 'password'} name="password" required
                        style={{ ...S.input, paddingRight: '44px' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                        onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                      />
                      <button
                        type="button" onClick={() => setShowPw(p => !p)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A89688', display: 'flex', padding: 0 }}
                      >
                        <EyeIcon show={showPw} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    style={S.btn}
                    onMouseEnter={e => (e.currentTarget.style.background = '#6B3209')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#823E0B')}
                  >
                    Log In
                  </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#7A6558', marginTop: '20px' }}>
                  Don't have an account yet?{' '}
                  <button type="button" onClick={() => setView('signup')} style={{ background: 'none', border: 'none', color: '#823E0B', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline', padding: 0 }}>
                    Sign up
                  </button>
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#E8E0D8' }} /><span style={{ fontSize: '0.75rem', color: '#A89688', fontWeight: 500, whiteSpace: 'nowrap' }}>Or continue with</span><div style={{ flex: 1, height: '1px', background: '#E8E0D8' }} />
                </div>

                {/* Rectangular Google button */}
                <button
                  type="button" onClick={handleGoogleSignIn}
                  style={S.googleBtn}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F7F3EE')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <GoogleIcon />
                  Continue with Google
                </button>

                <p style={{ textAlign: 'center', fontSize: '0.78rem', color: '#A89688', marginTop: '20px' }}>
                  <button type="button" onClick={() => setView('forgot')} style={{ background: 'none', border: 'none', color: '#A89688', cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline', padding: 0 }}>
                    Forgot password?
                  </button>
                </p>
              </motion.div>
            )}

            {/* ════ SIGN UP ════ */}
            {view === 'signup' && (
              <motion.div key="signup" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2A1A0E', marginBottom: '24px', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
                  Create Account
                </h1>

                <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div>
                    <label style={S.label}>Full Name</label>
                    <input
                      type="text" name="name" required placeholder="Your name"
                      style={S.input}
                      onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                      onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                    />
                  </div>
                  <div>
                    <label style={S.label}>E-mail Address</label>
                    <input
                      type="email" name="email" required placeholder="e.g., name@example.com"
                      style={S.input}
                      onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                      onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                    />
                  </div>
                  <div>
                    <label style={S.label}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPw2 ? 'text' : 'password'} name="password" required
                        style={{ ...S.input, paddingRight: '44px' }}
                        onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                        onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                      />
                      <button
                        type="button" onClick={() => setShowPw2(p => !p)}
                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A89688', display: 'flex', padding: 0 }}
                      >
                        <EyeIcon show={showPw2} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit" style={S.btn}
                    onMouseEnter={e => (e.currentTarget.style.background = '#6B3209')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#823E0B')}
                  >
                    Create Account
                  </button>
                </form>

                <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#7A6558', marginTop: '20px' }}>
                  Already have an account?{' '}
                  <button type="button" onClick={() => setView('signin')} style={{ background: 'none', border: 'none', color: '#823E0B', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline', padding: 0 }}>
                    Log in
                  </button>
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '20px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#E8E0D8' }} /><span style={{ fontSize: '0.75rem', color: '#A89688', fontWeight: 500, whiteSpace: 'nowrap' }}>Or continue with</span><div style={{ flex: 1, height: '1px', background: '#E8E0D8' }} />
                </div>

                <button
                  type="button" onClick={handleGoogleSignIn}
                  style={S.googleBtn}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F7F3EE')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </motion.div>
            )}

            {/* ════ FORGOT PASSWORD ════ */}
            {view === 'forgot' && (
              <motion.div key="forgot" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                {showSuccess ? (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: '#F0FDF4', border: '2px solid #BBF7D0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" style={{ width: '28px', height: '28px' }}>
                        <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                      </svg>
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1E1E1E', marginBottom: '8px' }}>Check your email</h2>
                    <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>
                      We've sent a password reset link to<br />
                      <strong style={{ color: '#1E1E1E' }}>{successEmail}</strong>
                    </p>
                    <button
                      onClick={onClose}
                      style={S.btn}
                      onMouseEnter={e => (e.currentTarget.style.background = '#6B3209')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#823E0B')}
                    >
                      Got it
                    </button>
                    <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '16px' }}>
                      Didn't receive it? Check your spam folder
                    </p>
                  </div>
                ) : (
                  <>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2A1A0E', marginBottom: '8px', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif, Georgia, serif)' }}>
                      Forgot Password
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: '#7A6558', marginBottom: '24px' }}>
                      Enter your email and we'll send you a reset link.
                    </p>

                    <form onSubmit={handleForgotPassword}>
                      <div style={{ marginBottom: '20px' }}>
                        <label style={S.label}>E-mail Address</label>
                        <input
                          type="email" name="email" required placeholder="e.g., name@example.com"
                          style={S.input}
                          onFocus={e => (e.currentTarget.style.borderColor = '#823E0B')}
                          onBlur={e  => (e.currentTarget.style.borderColor = '#DDD5CC')}
                        />
                      </div>
                      <button
                        type="submit" style={S.btn}
                        onMouseEnter={e => (e.currentTarget.style.background = '#6B3209')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#823E0B')}
                      >
                        Send Reset Link
                      </button>
                    </form>

                    <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#7A6558', marginTop: '16px' }}>
                      Remember your password?{' '}
                      <button type="button" onClick={() => setView('signin')} style={{ background: 'none', border: 'none', color: '#823E0B', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline', padding: 0 }}>
                        Log in
                      </button>
                    </p>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>

      {/* Responsive: show image panel ≥640px */}
      <style>{`
        @media (min-width: 640px) {
          .auth-modal-image-panel { display: block !important; }
        }
      `}</style>
    </div>
  );
}

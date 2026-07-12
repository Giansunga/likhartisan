import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function UpdatePasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [tokenError, setTokenError] = useState('');

  useEffect(() => {
    let mounted = true;

    // 1. Check immediately if we already have a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setTokenReady(true);
      } else {
        // 2. If no session yet, wait for the PASSWORD_RECOVERY event
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY' && session) {
            setTokenReady(true);
          }
        });

        // 3. Fallback: if no event fires after 3 seconds, show error
        const timer = setTimeout(() => {
          if (mounted && !tokenReady) {
            setTokenError('Reset link has expired or is invalid. Please request a new one.');
          }
        }, 3000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timer);
        };
      }
    });

    return () => {
      mounted = false;
    };
  }, [tokenReady]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

    const { error: err } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // Sign out after password update so user isn't left logged in
    await supabase.auth.signOut();

    setSuccess(true);
    setTimeout(() => {
      navigate('/');
    }, 3000);
  }

  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  // Eye Icon Component
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

  const S = {
    label:  { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#3D2B1F', marginBottom: '8px', letterSpacing: '0.01em' },
    input:  { width: '100%', padding: '12px 16px', border: '1.5px solid #DDD5CC', borderRadius: '10px', fontSize: '0.95rem', outline: 'none', background: '#FAFAF9', color: '#3D2B1F', boxSizing: 'border-box' as const, transition: 'all 0.2s ease' },
    btn:    { width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: '#823E0B', color: '#fff', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
  };

  return (
    <div className="flex items-center justify-center px-4 py-12" style={{ minHeight: 'calc(100vh - 80px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.98, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }}
        className="bg-white rounded-[20px] shadow-[0_24px_80px_rgba(0,0,0,0.08)] p-8 md:p-10 w-full max-w-md relative overflow-hidden">
        
        {/* Subtle decorative background element */}
        <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(130,62,11,0.04) 0%, rgba(255,255,255,0) 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

        {success ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#F0FDF4', border: '3px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 24px rgba(22, 163, 74, 0.15)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1E1E1E', marginBottom: '12px', fontFamily: 'var(--font-serif)' }}>Password Updated!</h2>
            <p style={{ fontSize: '0.95rem', color: '#666', marginBottom: '24px', lineHeight: 1.5 }}>
              Your password has been changed successfully.<br/>You will be redirected shortly.
            </p>
            <button onClick={() => {
              navigate('/signin');
            }} style={{ ...S.btn, background: '#16A34A' }} onMouseEnter={e => (e.currentTarget.style.background = '#15803D')} onMouseLeave={e => (e.currentTarget.style.background = '#16A34A')}>
              Go to Login
            </button>
          </motion.div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#FAF8F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', border: '1px solid #E8E0D8' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#823E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <h1 className="font-serif text-[1.75rem] font-bold text-brown-dark mb-2">Reset Password</h1>
              <p className="text-brown-medium text-[0.9rem]">Create a strong, new password for your account</p>
            </div>

            {tokenError && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.85rem', textAlign: 'center', fontWeight: 500 }}>
                {tokenError}
              </motion.div>
            )}

            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.85rem', textAlign: 'center', fontWeight: 500 }}>
                {error}
              </motion.div>
            )}

            {tokenReady ? (
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label style={S.label}>New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPw ? 'text' : 'password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
                      style={{ ...S.input, paddingRight: '44px' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(130,62,11,0.1)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#DDD5CC'; e.currentTarget.style.boxShadow = 'none'; }} />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A89688', padding: '4px' }}>
                      <EyeIcon show={showPw} />
                    </button>
                  </div>
                </div>
                <div>
                  <label style={S.label}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPw2 ? 'text' : 'password'} required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      style={{ ...S.input, paddingRight: '44px' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#823E0B'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(130,62,11,0.1)'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#DDD5CC'; e.currentTarget.style.boxShadow = 'none'; }} />
                    <button type="button" onClick={() => setShowPw2(!showPw2)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#A89688', padding: '4px' }}>
                      <EyeIcon show={showPw2} />
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  style={{ ...S.btn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                  onMouseEnter={e => { if(!loading) e.currentTarget.style.background = '#6B3209'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { if(!loading) e.currentTarget.style.background = '#823E0B'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                  {loading ? (
                    <><div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Updating...</>
                  ) : 'Update Password'}
                </button>
              </form>
            ) : !tokenError ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ width: '36px', height: '36px', border: '3px solid #E8E0D8', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                <p style={{ fontSize: '0.9rem', color: '#888', marginTop: '16px', fontWeight: 500 }}>Authenticating your link...</p>
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : null}

            <p className="text-center text-brown-medium text-[0.85rem] mt-8 pt-6 border-t border-cream-secondary">
              <button type="button" onClick={() => {
                navigate('/signin');
              }} className="text-primary hover:text-accent font-semibold transition-colors bg-transparent border-none cursor-pointer p-0" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontSize: 'inherit' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Back to Login
              </button>
            </p>
          </>
        )}
      </motion.div>
    </div>
  );
}

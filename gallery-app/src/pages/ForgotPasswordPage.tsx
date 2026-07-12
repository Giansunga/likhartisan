import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    setShowModal(true);
  }

  return (
    <div className="flex items-center justify-center px-4 py-12" style={{ minHeight: 'calc(100vh - 80px)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Forgot Password</h1>
        <p className="text-brown-medium text-center mb-8">Enter your email and we'll send you a reset link</p>

        {error && (
          <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1">Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-center text-brown-medium text-sm mt-6">
          Remember your password?{' '}
          <Link to="/signin" className="text-primary hover:underline font-medium">Sign In</Link>
        </p>
      </motion.div>

      {/* Check Your Email Popup */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(10, 6, 3, 0.72)',
              backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '16px',
            }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: '16px', padding: '32px',
                maxWidth: '400px', width: '100%', textAlign: 'center',
                boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
              }}
            >
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
              <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '20px', lineHeight: 1.5 }}>
                We've sent a password reset link to<br />
                <strong style={{ color: '#1E1E1E' }}>{email}</strong>
              </p>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                  background: '#823E0B', color: '#fff', fontWeight: 700,
                  fontSize: '0.88rem', cursor: 'pointer',
                }}
              >
                Got it
              </button>
              <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '12px' }}>
                Didn't receive it? Check your spam folder
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAuthDestination } from '../lib/authDestination';

export default function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (!data.user || !data.session) {
        setError('Sign in could not be completed. Please try again.');
        return;
      }
      navigate(await getAuthDestination(data.user), { replace: true });
    } catch {
      setError('Sign in could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4" style={{ paddingTop: 'var(--nav-height)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Welcome Back</h1>
        <p className="text-brown-medium text-center mb-8">Sign in to your account</p>

        {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="signin-email" className="block text-sm font-medium text-brown-dark mb-1">Email</label>
            <input id="signin-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div>
            <label htmlFor="signin-password" className="block text-sm font-medium text-brown-dark mb-1">Password</label>
            <input id="signin-password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <Link to="/forgot-password" className="text-primary hover:underline font-medium">Forgot Password?</Link>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-brown-medium text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary hover:underline font-medium">Sign Up</Link>
        </p>
      </motion.div>
    </div>
  );
}

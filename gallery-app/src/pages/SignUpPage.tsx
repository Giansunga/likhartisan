import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAuthDestination } from '../lib/authDestination';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: `${firstName.trim()} ${lastName.trim()}` } },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      if (data.session?.user) {
        navigate(await getAuthDestination(data.session.user), { replace: true });
      } else {
        setConfirmationSent(true);
      }
    } catch {
      setError('Account creation could not be completed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4" style={{ paddingTop: 'var(--nav-height)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Create Account</h1>
        <p className="text-brown-medium text-center mb-8">Join the LikhArtisan community</p>

        {confirmationSent ? (
          <div role="status" className="text-center text-brown-dark">
            <h2 className="font-serif text-xl font-bold mb-2">Check your email</h2>
            <p>Check {email.trim()} for a confirmation link before signing in.</p>
            <Link to="/signin" className="mt-5 inline-block text-primary hover:underline font-medium">Sign In</Link>
          </div>
        ) : (
        <>
        {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="signup-first-name" className="block text-sm font-medium text-brown-dark mb-1">First Name</label>
              <input id="signup-first-name" type="text" required autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
            </div>
            <div>
              <label htmlFor="signup-last-name" className="block text-sm font-medium text-brown-dark mb-1">Last Name</label>
              <input id="signup-last-name" type="text" required autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
            </div>
          </div>
          <div>
            <label htmlFor="signup-email" className="block text-sm font-medium text-brown-dark mb-1">Email</label>
            <input id="signup-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div>
            <label htmlFor="signup-password" className="block text-sm font-medium text-brown-dark mb-1">Password</label>
            <input id="signup-password" type="password" required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div>
            <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-brown-dark mb-1">Confirm Password</label>
            <input id="signup-confirm-password" type="password" required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-brown-medium text-sm mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-primary hover:underline font-medium">Sign In</Link>
        </p>
        </>
        )}
      </motion.div>
    </div>
  );
}

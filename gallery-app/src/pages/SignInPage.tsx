import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function SignInPage() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4" style={{ paddingTop: 'var(--nav-height)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Welcome Back</h1>
        <p className="text-brown-medium text-center mb-8">Sign in to your account</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1">Email</label>
            <input type="email" required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1">Password</label>
            <input type="password" required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-brown-medium cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300" /> Remember me
            </label>
            <Link to="/forgot-password" className="text-primary hover:underline font-medium">Forgot Password?</Link>
          </div>
          <button type="submit"
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors">
            Sign In
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

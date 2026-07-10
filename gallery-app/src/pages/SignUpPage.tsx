import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function SignUpPage() {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    window.location.href = '/';
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4" style={{ paddingTop: 'var(--nav-height)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h1 className="font-serif text-3xl font-bold text-brown-dark text-center mb-2">Create Account</h1>
        <p className="text-brown-medium text-center mb-8">Join the LikhArtisan community</p>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1">First Name</label>
              <input type="text" required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
            </div>
            <div>
              <label className="block text-sm font-medium text-brown-dark mb-1">Last Name</label>
              <input type="text" required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
            </div>
          </div>
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
          <div>
            <label className="block text-sm font-medium text-brown-dark mb-1">Confirm Password</label>
            <input type="password" required
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-brown-dark" />
          </div>
          <button type="submit"
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary-dark transition-colors">
            Create Account
          </button>
        </form>

        <p className="text-center text-brown-medium text-sm mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-primary hover:underline font-medium">Sign In</Link>
        </p>
      </motion.div>
    </div>
  );
}

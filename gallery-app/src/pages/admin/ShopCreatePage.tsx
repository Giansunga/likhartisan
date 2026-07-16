import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function ShopCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '', ownerName: '', email: '', location: '', description: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // 1. Resolve owner email -> existing auth.users.id
    const { data: ownerId, error: lookupError } = await supabase
      .rpc('get_user_id_by_email', { target_email: form.email });

    if (lookupError) {
      setLoading(false);
      setError(lookupError.message);
      return;
    }

    if (!ownerId) {
      setLoading(false);
      setError('No registered user with that email. The shop owner must already have a LikhArtisan account.');
      return;
    }

    // 2. Insert shop with valid columns only + capture the new id
    const { data: shop, error: insertError } = await supabase
      .from('shops')
      .insert({
        name: form.name,
        owner_name: form.ownerName,
        email: form.email,
        location: form.location || null,
        description: form.description || null,
        owner_id: ownerId,
      })
      .select('id')
      .single();

    if (insertError) {
      setLoading(false);
      setError(insertError.message);
      return;
    }

    // 3. Auto-assign the shop_owner role so the owner gets dashboard access
    const { error: roleError } = await supabase
      .rpc('assign_shop_owner', {
        p_user_id: ownerId,
        p_shop_id: shop.id,
        p_assigned_by: user?.id ?? null,
      });

    setLoading(false);

    if (roleError) {
      setError(roleError.message);
      return;
    }

    setSubmitted(true);
    setTimeout(() => navigate('/admin'), 1500);
  };

  const isValid = form.name && form.ownerName && form.email;

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-brown-dark mb-2">Register New Shop</h2>
      <p className="text-sm text-brown-medium mb-8">Add a new artisan shop to the platform</p>

      {submitted ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-12 h-12 text-green-500 mx-auto mb-4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <h3 className="text-lg font-bold text-green-800 mb-2">Shop Registered!</h3>
          <p className="text-green-700">Redirecting to dashboard...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
          )}

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-cream-tertiary">
            <h3 className="font-semibold text-brown-dark mb-4">Shop Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Shop Name *</label>
                <input name="name" value={form.name} onChange={handleChange} required
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Owner Name *</label>
                <input name="ownerName" value={form.ownerName} onChange={handleChange} required
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-brown-dark mb-1">Email *</label>
                <input name="email" type="email" value={form.email} onChange={handleChange} required
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brown-dark mb-1">Location</label>
                <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Paete, Laguna"
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-brown-dark mb-1">Description</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent resize-none" />
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <button type="submit" disabled={!isValid || loading}
              className="bg-primary text-white px-8 py-3 rounded-xl font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? 'Registering...' : 'Register Shop'}
            </button>
            <button type="button" onClick={() => navigate('/admin')}
              className="px-8 py-3 rounded-xl font-semibold border border-cream-tertiary text-brown-medium hover:bg-cream-secondary transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

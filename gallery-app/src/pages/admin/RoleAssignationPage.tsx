import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

type RoleRow = { role: string; shop_id: string | null };
type AppUser = {
  id: string;
  email: string | null;
  created_at: string;
  roles: RoleRow[];
};

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-amber-100 text-amber-800 border-amber-200',
  shop_owner: 'bg-primary/10 text-primary border-primary/20',
  buyer: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function RoleAssignationPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.rpc('list_users_with_roles');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setUsers((data as unknown as AppUser[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const promote = async (u: AppUser) => {
    if (!window.confirm(`Promote ${u.email} to Shop Owner?`)) return;
    setActionId(u.id);
    setError('');
    try {
      let shopId: string | null = null;
      const local = (u.email ?? '').split('@')[0];

      const { data: existing } = await supabase
        .from('shops')
        .select('id')
        .eq('email', u.email ?? '')
        .maybeSingle();

      if (existing) {
        shopId = existing.id;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('shops')
          .insert({ name: `${local}'s Shop`, email: u.email, owner_id: u.id })
          .select('id')
          .single();
        if (insErr) throw insErr;
        shopId = created?.id ?? null;
      }

      const { error: roleErr } = await supabase.rpc('assign_shop_owner', {
        p_user_id: u.id,
        p_shop_id: shopId,
        p_assigned_by: user?.id ?? null,
      });
      if (roleErr) throw roleErr;

      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to promote user');
    } finally {
      setActionId(null);
    }
  };

  const demote = async (u: AppUser) => {
    if (!window.confirm(`Demote ${u.email} from Shop Owner to Buyer?`)) return;
    setActionId(u.id);
    setError('');
    try {
      const { error: demErr } = await supabase.rpc('remove_shop_owner', {
        p_user_id: u.id,
      });
      if (demErr) throw demErr;
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to demote user');
    } finally {
      setActionId(null);
    }
  };

  const filtered = users.filter((u) =>
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-brown-dark mb-1">Role Assignation</h2>
          <p className="text-sm text-brown-medium">
            Promote buyers into sellers, or demote sellers back to buyers.
          </p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email..."
          className="w-full md:w-64 px-4 py-2.5 rounded-xl border border-cream-tertiary text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-cream-tertiary overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-brown-medium text-sm">Loading users...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-brown-medium text-sm">
            {users.length === 0 ? 'No registered users found.' : 'No users match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-secondary/50 text-brown-medium text-left">
                <th className="px-6 py-3 font-semibold">User</th>
                <th className="px-6 py-3 font-semibold">Roles</th>
                <th className="px-6 py-3 font-semibold">Joined</th>
                <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-tertiary">
              {filtered.map((u) => {
                const isSuper = (u.roles ?? []).some((r) => r.role === 'super_admin');
                const isOwner = (u.roles ?? []).some((r) => r.role === 'shop_owner');
                const busy = actionId === u.id;
                return (
                  <tr key={u.id} className="hover:bg-cream-secondary/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-brown-dark">{u.email ?? '(no email)'}</div>
                      <div className="text-xs text-brown-medium font-mono truncate max-w-[220px]">
                        {u.id}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {(u.roles ?? []).length === 0 ? (
                          <span className="text-brown-medium text-xs">—</span>
                        ) : (
                          (u.roles ?? []).map((r, i) => (
                            <span
                              key={i}
                              className={`px-2.5 py-0.5 rounded-full border text-xs font-medium capitalize ${
                                ROLE_BADGE[r.role] ?? ROLE_BADGE.buyer
                              }`}
                            >
                              {r.role.replace('_', ' ')}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-brown-medium">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isOwner ? (
                        <button
                          onClick={() => demote(u)}
                          disabled={busy}
                          className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? 'Working...' : 'Demote'}
                        </button>
                      ) : isSuper ? null : (
                        <button
                          onClick={() => promote(u)}
                          disabled={busy}
                          className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? 'Working...' : 'Promote'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { SUPER_ADMIN_MANAGER_EMAILS } from '../../lib/constants';

type RoleRow = { role: string; shop_id: string | null };
type AppUser = {
  id: string;
  email: string | null;
  created_at: string;
  roles: RoleRow[];
};

const ROLE_BADGE: Record<string, string> = {
  founder: 'bg-purple-100 text-purple-800 border-purple-200',
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
  const [rolePickerUser, setRolePickerUser] = useState<AppUser | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    user: AppUser;
    action: 'promote_shop_owner' | 'promote_super_admin' | 'demote_to_buyer';
  } | null>(null);

  const currentUserCanManageSuperAdmins = SUPER_ADMIN_MANAGER_EMAILS.some(
    (email) => email.toLowerCase() === user?.email?.trim().toLowerCase(),
  );

  const load = useCallback(async () => {
    setError('');
    const { data, error } = await supabase.rpc('list_users_with_roles');
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const raw = (data as unknown as AppUser[]) ?? [];
    const deduped = raw.map((u) => ({
      ...u,
      roles: u.roles
        ? Array.from(new Map(u.roles.map((r) => [r.role, r])).values())
        : [],
    }));
    setUsers(deduped);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const promoteShopOwner = async (u: AppUser) => {
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

  const promoteSuperAdmin = async (u: AppUser) => {
    setActionId(u.id);
    setError('');
    try {
      const { error: promoteError } = await supabase.rpc('assign_super_admin', {
        p_user_id: u.id,
      });
      if (promoteError) throw promoteError;
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to promote super admin');
    } finally {
      setActionId(null);
    }
  };

  const demoteToBuyer = async (u: AppUser) => {
    setActionId(u.id);
    setError('');
    try {
      const roles = u.roles ?? [];
      if (roles.some((role) => role.role === 'super_admin')) {
        const { error: superAdminError } = await supabase.rpc('remove_super_admin', {
          p_user_id: u.id,
        });
        if (superAdminError) throw superAdminError;
      }
      if (roles.some((role) => role.role === 'shop_owner')) {
        const { error: shopOwnerError } = await supabase.rpc('remove_shop_owner', {
          p_user_id: u.id,
        });
        if (shopOwnerError) throw shopOwnerError;
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to adjust user role');
    } finally {
      setActionId(null);
    }
  };

  const filtered = users.filter((u) =>
    (u.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="portal-action-bar">
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
                const isFounder = (u.roles ?? []).some((r) => r.role === 'founder');
                const isSuper = (u.roles ?? []).some((r) => r.role === 'super_admin');
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
                      <div className="flex justify-end">
                      {!isFounder && !(isSuper && (!currentUserCanManageSuperAdmins || u.id === user?.id)) && (
                        <button
                          onClick={() => setRolePickerUser(u)}
                          disabled={busy}
                          className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? 'Working...' : 'Adjust Role'}
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {rolePickerUser && (() => {
        const isSuper = rolePickerUser.roles.some((role) => role.role === 'super_admin');
        const isOwner = rolePickerUser.roles.some((role) => role.role === 'shop_owner');
        const isBuyerOnly = !isSuper && !isOwner;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRolePickerUser(null)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="role-picker-title"
              className="bg-white rounded-2xl w-full max-w-md shadow-xl p-6"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="role-picker-title" className="font-serif text-lg font-bold text-brown-dark mb-1">
                Adjust User Role
              </h3>
              <p className="text-sm text-brown-medium mb-5">
                Which role should {rolePickerUser.email} be adjusted to?
              </p>
              <div className="space-y-3">
                {currentUserCanManageSuperAdmins && (
                  <button
                    type="button"
                    disabled={isSuper}
                    onClick={() => {
                      setConfirmModal({ user: rolePickerUser, action: 'promote_super_admin' });
                      setRolePickerUser(null);
                    }}
                    className="w-full text-left rounded-xl border border-amber-200 p-4 hover:bg-amber-50 disabled:bg-gray-50 disabled:border-gray-200 disabled:cursor-not-allowed"
                  >
                    <span className="block font-semibold text-brown-dark">Super Admin {isSuper && '(Current)'}</span>
                    <span className="block text-xs text-brown-medium mt-1">Access the superadmin dashboard and administrative tools.</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isOwner}
                  onClick={() => {
                    setConfirmModal({ user: rolePickerUser, action: 'promote_shop_owner' });
                    setRolePickerUser(null);
                  }}
                  className="w-full text-left rounded-xl border border-cream-tertiary p-4 hover:bg-cream-secondary/50 disabled:bg-gray-50 disabled:border-gray-200 disabled:cursor-not-allowed"
                >
                  <span className="block font-semibold text-brown-dark">Shop Owner {isOwner && '(Current)'}</span>
                  <span className="block text-xs text-brown-medium mt-1">Manage a shop, products, and artisan orders.</span>
                </button>
                <button
                  type="button"
                  disabled={isBuyerOnly}
                  onClick={() => {
                    setConfirmModal({ user: rolePickerUser, action: 'demote_to_buyer' });
                    setRolePickerUser(null);
                  }}
                  className="w-full text-left rounded-xl border border-cream-tertiary p-4 hover:bg-cream-secondary/50 disabled:bg-gray-50 disabled:border-gray-200 disabled:cursor-not-allowed"
                >
                  <span className="block font-semibold text-brown-dark">Buyer {isBuyerOnly && '(Current)'}</span>
                  <span className="block text-xs text-brown-medium mt-1">Use the storefront without seller or administrator access.</span>
                </button>
              </div>
              <div className="flex justify-end mt-5">
                <button
                  type="button"
                  onClick={() => setRolePickerUser(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold border border-cream-tertiary text-brown-medium hover:bg-cream-secondary/50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmModal(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="role-confirmation-title"
            className="bg-white rounded-2xl w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-2">
              <h3 id="role-confirmation-title" className="font-serif text-lg font-bold text-brown-dark">
                {confirmModal.action.startsWith('promote') ? 'Confirm Promotion' : 'Confirm Demotion'}
              </h3>
            </div>
            <div className="px-6 pb-6">
              <p className="text-sm text-brown-medium mb-1">
                {confirmModal.action === 'promote_shop_owner'
                  ? `Promote ${confirmModal.user.email} to Shop Owner?`
                  : confirmModal.action === 'promote_super_admin'
                    ? `Promote ${confirmModal.user.email} to Super Admin?`
                  : `Adjust ${confirmModal.user.email} to Buyer?`}
              </p>
              <p className="text-xs text-brown-light">
                {confirmModal.action === 'promote_shop_owner'
                  ? 'This will create a shop and assign the Shop Owner role.'
                  : confirmModal.action === 'promote_super_admin'
                    ? 'This will grant access to the Super Admin dashboard and administrative tools.'
                  : 'This will remove Super Admin and Shop Owner access, including any owned shop.'}
              </p>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold border border-cream-tertiary text-brown-medium hover:bg-cream-secondary/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const { user: u, action } = confirmModal;
                  setConfirmModal(null);
                  if (action === 'promote_shop_owner') promoteShopOwner(u);
                  else if (action === 'promote_super_admin') promoteSuperAdmin(u);
                  else demoteToBuyer(u);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors ${
                  confirmModal.action.startsWith('promote')
                    ? 'bg-primary hover:bg-primary-light'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {confirmModal.action.startsWith('promote') ? 'Promote' : 'Demote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

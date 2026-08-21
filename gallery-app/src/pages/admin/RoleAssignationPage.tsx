import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Copy, LoaderCircle,
  LockKeyhole, RefreshCw, Search, ShieldCheck, ShoppingBag, Store, UserRound,
  Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { SUPER_ADMIN_MANAGER_EMAILS } from '../../lib/constants';
import {
  DEFAULT_ROLE_QUERY, filterAndSortRoleUsers, getRoleCounts, getUserProtection,
  hasRole, isBuyerOnly, mergeRoleQuery, normalizeRoles, paginateRoleUsers,
  protectionMessage, roleQueryFromSearch, userInitials,
} from '../../lib/adminRoles';
import { useAuth } from '../../contexts/AuthContext';
import { usePortalRealtimeRefresh } from '../../realtime/usePortalRealtimeRefresh';
import type { AdminRoleUser, RoleAction, RoleFilter, RoleQuery } from '../../types/adminRoles';
import './role-assignment.css';

const FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: 'all', label: 'All users' },
  { value: 'buyer_only', label: 'Buyer only' },
  { value: 'shop_owner', label: 'Shop owners' },
  { value: 'super_admin', label: 'Super admins' },
  { value: 'founder', label: 'Founders' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest joined' },
  { value: 'oldest', label: 'Oldest joined' },
  { value: 'email', label: 'Email A–Z' },
] as const;

const ACTION_COPY: Record<RoleAction, { title: string; prompt: string; detail: string; confirm: string }> = {
  grant_super_admin: {
    title: 'Grant Super Admin access',
    prompt: 'Give this user access to the super-admin dashboard and administrative tools?',
    detail: 'Only configured super-admin managers can grant this level of access.',
    confirm: 'Grant access',
  },
  grant_shop_owner: {
    title: 'Grant Shop Owner access',
    prompt: 'Give this user access to manage a shop, products, and artisan orders?',
    detail: 'A matching shop will be reused, or a new shop will be created for this user.',
    confirm: 'Grant access',
  },
  remove_elevated_access: {
    title: 'Remove elevated access',
    prompt: 'Remove this user’s Super Admin and Shop Owner access?',
    detail: 'The user will remain able to use the storefront as a buyer.',
    confirm: 'Remove access',
  },
};

function formatJoined(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.valueOf())) return '—';
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function roleBadgeClass(role: string) {
  if (role === 'founder') return 'role-badge--founder';
  if (role === 'super_admin') return 'role-badge--super_admin';
  if (role === 'shop_owner') return 'role-badge--shop_owner';
  if (role === 'buyer') return 'role-badge--buyer';
  return 'role-badge--default';
}

function RoleBadges({ user }: { user: AdminRoleUser }) {
  const roles = user.roles.length ? user.roles : [{ role: 'buyer', shop_id: null }];
  return <div className="role-badges">{roles.map((role) => <span className={`role-badge ${roleBadgeClass(role.role)}`} key={role.role}>{role.role.replace('_', ' ')}</span>)}</div>;
}

function SummaryCard({ label, value, note, active, onClick, icon }: { label: string; value: number; note: string; active: boolean; onClick: () => void; icon: ReactNode }) {
  return <button className="role-summary-card" type="button" aria-pressed={active} onClick={onClick}><span className="role-summary-card__label">{icon}{label}</span><strong>{value.toLocaleString()}</strong><small>{note}</small></button>;
}

function UserIdentity({ user, currentUserId }: { user: AdminRoleUser; currentUserId?: string }) {
  return <div className="role-user"><span className="role-avatar" aria-hidden="true">{userInitials(user)}</span><div><strong>{user.email ?? '(no email)'}</strong>{user.id === currentUserId && <small><UserRound aria-hidden="true" />You</small>}</div></div>;
}

function trapFocus(event: KeyboardEvent<HTMLElement>, onDismiss: () => void) {
  if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export default function RoleAssignationPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const query = useMemo(() => roleQueryFromSearch(searchParams), [searchKey]);
  const [users, setUsers] = useState<AdminRoleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ userId: string; action: RoleAction } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const hasLoadedRef = useRef(false);
  const requestRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const confirmRef = useRef<HTMLElement | null>(null);

  const currentUserCanManageSuperAdmins = SUPER_ADMIN_MANAGER_EMAILS.some((email) => email.toLowerCase() === user?.email?.trim().toLowerCase());

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (hasLoadedRef.current) setRefreshing(true); else setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.rpc('list_users_with_roles');
    if (request !== requestRef.current) return;
    if (error) {
      setLoadError(error.message || 'Could not load role assignments.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setUsers(((data as unknown as AdminRoleUser[]) ?? []).map(normalizeRoles));
    hasLoadedRef.current = true;
    setUpdatedAt(new Date());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  usePortalRealtimeRefresh(['user_roles', 'shops'], load);

  const updateQuery = useCallback((next: RoleQuery, replace = false) => {
    setSearchParams(mergeRoleQuery(new URLSearchParams(searchKey), next), { replace });
  }, [searchKey, setSearchParams]);
  const setFilter = useCallback((role: RoleFilter) => updateQuery({ ...query, role, page: 1 }), [query, updateQuery]);

  const filteredUsers = useMemo(() => filterAndSortRoleUsers(users, query), [query, users]);
  const pagination = useMemo(() => paginateRoleUsers(filteredUsers, query.page), [filteredUsers, query.page]);
  const counts = useMemo(() => getRoleCounts(users), [users]);
  const selectedUser = users.find((candidate) => candidate.id === selectedUserId) ?? null;
  const confirmationUser = users.find((candidate) => candidate.id === confirmation?.userId) ?? null;
  const hasFilters = Boolean(query.q || query.role !== DEFAULT_ROLE_QUERY.role || query.sort !== DEFAULT_ROLE_QUERY.sort || query.page !== 1);

  useEffect(() => {
    if (query.page !== pagination.page) updateQuery({ ...query, page: pagination.page }, true);
  }, [pagination.page, query, updateQuery]);
  useEffect(() => { if (selectedUserId && !selectedUser) setSelectedUserId(null); }, [selectedUser, selectedUserId]);
  useEffect(() => {
    if (!selectedUser || confirmation) return;
    const timer = window.setTimeout(() => drawerRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [confirmation, selectedUser]);
  useEffect(() => {
    if (!confirmationUser) return;
    const timer = window.setTimeout(() => confirmRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [confirmationUser]);

  const openDrawer = (target: AdminRoleUser) => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActionError('');
    setSelectedUserId(target.id);
  };
  const closeDrawer = useCallback(() => {
    if (actionId) return;
    setConfirmation(null);
    setSelectedUserId(null);
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  }, [actionId]);
  const copyUserId = async (id: string) => {
    try { await navigator.clipboard?.writeText(id); toast.success('User ID copied.'); }
    catch { toast.error('Could not copy the user ID.'); }
  };

  const performAction = async (target: AdminRoleUser, action: RoleAction) => {
    setActionId(`${target.id}:${action}`);
    setActionError('');
    try {
      if (action === 'grant_shop_owner') {
        let shopId: string | null = null;
        const local = (target.email ?? '').split('@')[0];
        const { data: existing } = await supabase.from('shops').select('id').eq('email', target.email ?? '').maybeSingle();
        if (existing) shopId = existing.id;
        else {
          const { data: created, error: insertError } = await supabase.from('shops').insert({ name: `${local}'s Shop`, email: target.email, owner_id: target.id }).select('id').single();
          if (insertError) throw insertError;
          shopId = created?.id ?? null;
        }
        const { error } = await supabase.rpc('assign_shop_owner', { p_user_id: target.id, p_shop_id: shopId, p_assigned_by: user?.id ?? null });
        if (error) throw error;
      }
      if (action === 'grant_super_admin') {
        const { error } = await supabase.rpc('assign_super_admin', { p_user_id: target.id });
        if (error) throw error;
      }
      if (action === 'remove_elevated_access') {
        if (hasRole(target, 'super_admin')) {
          const { error } = await supabase.rpc('remove_super_admin', { p_user_id: target.id });
          if (error) throw error;
        }
        if (hasRole(target, 'shop_owner')) {
          const { error } = await supabase.rpc('remove_shop_owner', { p_user_id: target.id });
          if (error) throw error;
        }
      }
      await load();
      toast.success(action === 'remove_elevated_access' ? 'Elevated access removed.' : 'Role access updated.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not update role access.');
      toast.error('Role access could not be updated.');
    } finally { setActionId(null); }
  };

  const confirmAction = async () => {
    if (!confirmationUser || !confirmation) return;
    const next = confirmation;
    setConfirmation(null);
    await performAction(confirmationUser, next.action);
  };

  const renderUserAction = (target: AdminRoleUser) => {
    const protection = getUserProtection(target, user?.id, currentUserCanManageSuperAdmins);
    return <><>{protection && <span className="role-protected"><LockKeyhole aria-hidden="true" />Protected</span>}</><button className="role-row-action" type="button" onClick={() => openDrawer(target)}>{protection ? 'View access' : 'Manage access'}</button></>;
  };

  if (loading && !hasLoadedRef.current) {
    return <main className="role-assignment-page" aria-busy="true"><h1 className="sr-only">Role Assignment</h1><div className="role-summary-grid">{[0, 1, 2, 3].map((item) => <div className="role-summary-card role-skeleton" key={item}><span /></div>)}</div><div className="role-list-panel role-skeleton">{[0, 1, 2, 3, 4].map((item) => <span key={item} />)}</div></main>;
  }

  if (loadError && !hasLoadedRef.current) {
    return <main className="role-assignment-page"><h1 className="sr-only">Role Assignment</h1><section className="role-list-panel role-state" aria-live="polite"><AlertCircle aria-hidden="true" /><h2>Role assignments could not be loaded</h2><p>{loadError}</p><button className="role-assignment-page__retry" type="button" onClick={() => void load()}>Try again</button></section></main>;
  }

  return (
    <main className="role-assignment-page">
      <h1 className="sr-only">Role Assignment</h1>
      <div className="role-assignment-page__topbar" aria-live="polite">
        <span className={`role-assignment-page__live ${refreshing ? 'is-refreshing' : ''}`}>{refreshing ? <LoaderCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{refreshing ? 'Refreshing' : 'Live data'}</span>
        {updatedAt && <small>Updated {updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</small>}
        <button className="role-assignment-page__refresh" type="button" onClick={() => void load()} disabled={refreshing}><RefreshCw aria-hidden="true" />Refresh</button>
      </div>

      <section className="role-summary-grid" aria-label="Role assignment summary">
        <SummaryCard label="Total users" value={counts.total} note="All registered accounts" active={query.role === 'all'} onClick={() => setFilter('all')} icon={<Users aria-hidden="true" />} />
        <SummaryCard label="Buyer only" value={counts.buyerOnly} note="No elevated access" active={query.role === 'buyer_only'} onClick={() => setFilter('buyer_only')} icon={<ShoppingBag aria-hidden="true" />} />
        <SummaryCard label="Shop owners" value={counts.shopOwners} note="May overlap with admins" active={query.role === 'shop_owner'} onClick={() => setFilter('shop_owner')} icon={<Store aria-hidden="true" />} />
        <SummaryCard label="Super admins" value={counts.superAdmins} note="May overlap with owners" active={query.role === 'super_admin'} onClick={() => setFilter('super_admin')} icon={<ShieldCheck aria-hidden="true" />} />
      </section>

      <section className="role-toolbar" aria-label="Role assignment filters">
        <div className="role-toolbar__main">
          <label className="role-search"><Search aria-hidden="true" /><span className="sr-only">Search users by email</span><input value={query.q} onChange={(event) => updateQuery({ ...query, q: event.target.value, page: 1 })} placeholder="Search by email" type="search" />{query.q && <button type="button" aria-label="Clear search" onClick={() => updateQuery({ ...query, q: '', page: 1 })}><X aria-hidden="true" /></button>}</label>
          <label className="role-sort"><span className="sr-only">Sort users</span><select value={query.sort} onChange={(event) => updateQuery({ ...query, sort: event.target.value as RoleQuery['sort'], page: 1 })}>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="role-toolbar__filters" role="group" aria-label="Filter by access">
          {FILTERS.map((filter) => <button className="role-filter" key={filter.value} type="button" aria-pressed={query.role === filter.value} onClick={() => setFilter(filter.value)}>{filter.label}</button>)}
          {hasFilters && <button className="role-toolbar__clear" type="button" onClick={() => updateQuery(DEFAULT_ROLE_QUERY)}>Clear filters</button>}
        </div>
        <div className="role-toolbar__meta"><span>{filteredUsers.length.toLocaleString()} of {users.length.toLocaleString()} users</span><span>Elevated-role counts may overlap.</span></div>
      </section>

      {loadError && <div className="role-page-notice" role="status"><AlertCircle aria-hidden="true" />{loadError}<button type="button" onClick={() => void load()}>Retry</button></div>}

      <section className="role-list-panel" aria-label="Registered users">
        {users.length === 0 ? <div className="role-state"><Users aria-hidden="true" /><h2>No registered users</h2><p>Users will appear here once they create an account.</p></div> : filteredUsers.length === 0 ? <div className="role-state"><Search aria-hidden="true" /><h2>No users match these filters</h2><p>Try a different email search or clear the active filters.</p><button className="role-assignment-page__retry" type="button" onClick={() => updateQuery(DEFAULT_ROLE_QUERY)}>Clear filters</button></div> : <>
          <div className="role-table-wrap"><table className="role-table"><thead><tr><th>User</th><th>Roles</th><th>Joined</th><th>Access</th><th>Action</th></tr></thead><tbody>{pagination.items.map((target) => {
            const protection = getUserProtection(target, user?.id, currentUserCanManageSuperAdmins);
            return <tr key={target.id}><td><UserIdentity user={target} currentUserId={user?.id} /></td><td><RoleBadges user={target} /></td><td>{formatJoined(target.created_at)}</td><td>{protection ? <span className="role-protected"><LockKeyhole aria-hidden="true" />{protectionMessage(protection)}</span> : <span className="role-protected"><CheckCircle2 aria-hidden="true" />Manageable</span>}</td><td>{renderUserAction(target)}</td></tr>;
          })}</tbody></table></div>
          <div className="role-cards">{pagination.items.map((target) => {
            const protection = getUserProtection(target, user?.id, currentUserCanManageSuperAdmins);
            return <button className="role-mobile-card" type="button" key={target.id} onClick={() => openDrawer(target)}><div className="role-mobile-card__top"><UserIdentity user={target} currentUserId={user?.id} />{protection && <LockKeyhole size={16} aria-label="Protected access" />}</div><p className="role-mobile-card__joined">Joined {formatJoined(target.created_at)}</p><RoleBadges user={target} /></button>;
          })}</div>
          {pagination.totalPages > 1 && <footer className="role-pagination"><span>Page {pagination.page} of {pagination.totalPages}</span><div className="role-pagination__buttons"><button type="button" disabled={pagination.page === 1} onClick={() => updateQuery({ ...query, page: pagination.page - 1 })}><ChevronLeft aria-hidden="true" />Previous</button><button type="button" disabled={pagination.page === pagination.totalPages} onClick={() => updateQuery({ ...query, page: pagination.page + 1 })}>Next<ChevronRight aria-hidden="true" /></button></div></footer>}
        </>}
      </section>

      {selectedUser && (() => {
        const protection = getUserProtection(selectedUser, user?.id, currentUserCanManageSuperAdmins);
        const isSuper = hasRole(selectedUser, 'super_admin');
        const isOwner = hasRole(selectedUser, 'shop_owner');
        const buyerOnly = isBuyerOnly(selectedUser);
        const busy = actionId !== null;
        return <div className="role-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}><aside ref={drawerRef} className="role-drawer" role="dialog" aria-modal="true" aria-labelledby="role-drawer-title" tabIndex={-1} onKeyDown={(event) => trapFocus(event, closeDrawer)}>
          <header className="role-drawer__header"><div className="role-drawer__heading"><span className="role-avatar" aria-hidden="true">{userInitials(selectedUser)}</span><div><h2 id="role-drawer-title">{selectedUser.email ?? '(no email)'}</h2><p>{selectedUser.id === user?.id ? 'Your account' : 'User access details'}</p></div></div><button className="role-close" data-autofocus type="button" aria-label="Close access details" onClick={closeDrawer} disabled={busy}><X aria-hidden="true" /></button></header>
          <div className="role-drawer__body"><dl className="role-drawer__details"><div><dt>Joined</dt><dd>{formatJoined(selectedUser.created_at)}</dd></div><div><dt>User ID</dt><dd><button className="role-copy-id" type="button" onClick={() => void copyUserId(selectedUser.id)}><Copy aria-hidden="true" />Copy ID</button></dd></div></dl><section className="role-drawer__roles"><h3>Current roles</h3><RoleBadges user={selectedUser} /></section>{actionError && <div className="role-page-notice role-drawer__error" role="alert"><AlertCircle aria-hidden="true" />{actionError}</div>}{protection ? <div className="role-drawer__notice"><LockKeyhole aria-hidden="true" />{protectionMessage(protection)}</div> : <section><h3>Manage access</h3><div className="role-action-list">{currentUserCanManageSuperAdmins && <button className="role-action-card" type="button" disabled={busy || isSuper} onClick={() => setConfirmation({ userId: selectedUser.id, action: 'grant_super_admin' })}><strong>Grant Super Admin {isSuper && '(Current)'}</strong><span>Access the super-admin dashboard and administrative tools.</span></button>}<button className="role-action-card" type="button" disabled={busy || isOwner} onClick={() => setConfirmation({ userId: selectedUser.id, action: 'grant_shop_owner' })}><strong>Grant Shop Owner {isOwner && '(Current)'}</strong><span>Manage a shop, products, and artisan orders. A shop is reused or created as needed.</span></button><button className="role-action-card role-action-card--danger" type="button" disabled={busy || buyerOnly} onClick={() => setConfirmation({ userId: selectedUser.id, action: 'remove_elevated_access' })}><strong>Remove Elevated Access {buyerOnly && '(Current)'}</strong><span>Remove Super Admin and Shop Owner access while keeping storefront access.</span></button></div></section>}</div>
        </aside></div>;
      })()}

      {confirmation && confirmationUser && <div className="role-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !actionId) setConfirmation(null); }}><section ref={confirmRef} className="role-confirm" role="dialog" aria-modal="true" aria-labelledby="role-confirm-title" tabIndex={-1} onKeyDown={(event) => trapFocus(event, () => { if (!actionId) setConfirmation(null); })}><div className="role-confirm__body"><h2 id="role-confirm-title">{ACTION_COPY[confirmation.action].title}</h2><p>{ACTION_COPY[confirmation.action].prompt}</p><p><strong>{confirmationUser.email ?? '(no email)'}</strong></p><small>{ACTION_COPY[confirmation.action].detail}</small></div><div className="role-confirm__actions"><button className="role-confirm__cancel" data-autofocus type="button" onClick={() => setConfirmation(null)} disabled={Boolean(actionId)}>Cancel</button><button className={`role-confirm__submit ${confirmation.action === 'remove_elevated_access' ? 'is-danger' : ''}`} type="button" onClick={() => void confirmAction()} disabled={Boolean(actionId)}>{actionId ? 'Updating…' : ACTION_COPY[confirmation.action].confirm}</button></div></section></div>}
    </main>
  );
}

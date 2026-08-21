import type {
  AdminRoleUser,
  RoleCounts,
  RoleFilter,
  RoleQuery,
  RoleSort,
  UserProtection,
} from '../types/adminRoles';

export const ROLE_PAGE_SIZE = 20;

export const DEFAULT_ROLE_QUERY: RoleQuery = {
  q: '',
  role: 'all',
  sort: 'newest',
  page: 1,
};

const ROLE_FILTERS: RoleFilter[] = ['all', 'buyer_only', 'shop_owner', 'super_admin', 'founder'];
const ROLE_SORTS: RoleSort[] = ['newest', 'oldest', 'email'];

export function normalizeRoles(user: AdminRoleUser): AdminRoleUser {
  const roleMap = new Map<string, { role: string; shop_id: string | null }>();
  for (const role of user.roles ?? []) {
    const normalizedRole = role.role.trim().toLowerCase();
    if (normalizedRole && !roleMap.has(normalizedRole)) {
      roleMap.set(normalizedRole, { ...role, role: normalizedRole });
    }
  }
  return { ...user, roles: [...roleMap.values()] };
}

export function hasRole(user: AdminRoleUser, role: string) {
  return user.roles.some((item) => item.role === role);
}

export function isBuyerOnly(user: AdminRoleUser) {
  return !hasRole(user, 'founder') && !hasRole(user, 'shop_owner') && !hasRole(user, 'super_admin');
}

export function userMatchesRole(user: AdminRoleUser, role: RoleFilter) {
  if (role === 'all') return true;
  if (role === 'buyer_only') return isBuyerOnly(user);
  return hasRole(user, role);
}

export function getRoleCounts(users: AdminRoleUser[]): RoleCounts {
  return {
    total: users.length,
    buyerOnly: users.filter(isBuyerOnly).length,
    shopOwners: users.filter((user) => hasRole(user, 'shop_owner')).length,
    superAdmins: users.filter((user) => hasRole(user, 'super_admin')).length,
  };
}

function createdAt(user: AdminRoleUser) {
  const time = Date.parse(user.created_at);
  return Number.isNaN(time) ? 0 : time;
}

export function filterAndSortRoleUsers(
  users: AdminRoleUser[],
  { q, role, sort }: Pick<RoleQuery, 'q' | 'role' | 'sort'>,
) {
  const query = q.trim().toLowerCase();
  const result = users.filter((user) => {
    const email = user.email?.toLowerCase() ?? '';
    return (!query || email.includes(query)) && userMatchesRole(user, role);
  });

  return [...result].sort((left, right) => {
    if (sort === 'email') return (left.email ?? '').localeCompare(right.email ?? '');
    const difference = createdAt(right) - createdAt(left);
    return sort === 'newest' ? difference : -difference;
  });
}

export function paginateRoleUsers(users: AdminRoleUser[], page: number, pageSize = ROLE_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    totalPages,
    items: users.slice((safePage - 1) * pageSize, safePage * pageSize),
  };
}

export function roleQueryFromSearch(search: URLSearchParams): RoleQuery {
  const role = search.get('role');
  const sort = search.get('sort');
  const parsedPage = Number.parseInt(search.get('page') ?? '', 10);
  return {
    q: search.get('q') ?? '',
    role: ROLE_FILTERS.includes(role as RoleFilter) ? role as RoleFilter : DEFAULT_ROLE_QUERY.role,
    sort: ROLE_SORTS.includes(sort as RoleSort) ? sort as RoleSort : DEFAULT_ROLE_QUERY.sort,
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_ROLE_QUERY.page,
  };
}

export function mergeRoleQuery(search: URLSearchParams, query: RoleQuery) {
  const next = new URLSearchParams(search);
  const setOrDelete = (key: string, value: string, isDefault: boolean) => {
    if (!value || isDefault) next.delete(key);
    else next.set(key, value);
  };
  setOrDelete('q', query.q.trim(), !query.q.trim());
  setOrDelete('role', query.role, query.role === DEFAULT_ROLE_QUERY.role);
  setOrDelete('sort', query.sort, query.sort === DEFAULT_ROLE_QUERY.sort);
  setOrDelete('page', String(query.page), query.page === DEFAULT_ROLE_QUERY.page);
  return next;
}

export function getUserProtection(
  user: AdminRoleUser,
  currentUserId: string | undefined,
  canManageSuperAdmins: boolean,
): UserProtection {
  if (hasRole(user, 'founder')) return 'founder';
  if (user.id === currentUserId && (hasRole(user, 'super_admin') || hasRole(user, 'shop_owner'))) {
    return 'own_elevated_access';
  }
  if (hasRole(user, 'super_admin') && !canManageSuperAdmins) return 'super_admin_manager_only';
  return null;
}

export function protectionMessage(protection: UserProtection) {
  if (protection === 'founder') return 'Founder accounts are protected from role changes.';
  if (protection === 'own_elevated_access') return 'You cannot change your own elevated access.';
  if (protection === 'super_admin_manager_only') return 'Only configured super-admin managers can change this access.';
  return '';
}

export function userInitials(user: AdminRoleUser) {
  const prefix = (user.email ?? '?').split('@')[0] || '?';
  return prefix.slice(0, 2).toUpperCase();
}

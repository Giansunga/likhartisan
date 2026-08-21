import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE_QUERY, filterAndSortRoleUsers, getRoleCounts, getUserProtection,
  mergeRoleQuery, normalizeRoles, paginateRoleUsers, roleQueryFromSearch,
} from '../adminRoles';
import type { AdminRoleUser } from '../../types/adminRoles';

const users: AdminRoleUser[] = [
  { id: 'buyer', email: 'buyer@example.com', created_at: '2026-08-01T00:00:00Z', roles: [{ role: 'buyer', shop_id: null }] },
  { id: 'owner', email: 'owner@example.com', created_at: '2026-08-03T00:00:00Z', roles: [{ role: 'buyer', shop_id: null }, { role: 'shop_owner', shop_id: 'shop-1' }] },
  { id: 'admin', email: 'admin@example.com', created_at: '2026-08-02T00:00:00Z', roles: [{ role: 'super_admin', shop_id: null }, { role: 'shop_owner', shop_id: 'shop-2' }] },
  { id: 'founder', email: 'founder@example.com', created_at: '2026-08-04T00:00:00Z', roles: [{ role: 'founder', shop_id: null }] },
];

describe('admin role utilities', () => {
  it('normalizes duplicate and mixed-case roles before counting effective access', () => {
    const normalized = normalizeRoles({ ...users[2], roles: [{ role: 'SUPER_ADMIN', shop_id: null }, { role: 'super_admin', shop_id: null }, { role: 'shop_owner', shop_id: 'shop-2' }] });
    expect(normalized.roles).toHaveLength(2);
    expect(getRoleCounts(users)).toEqual({ total: 4, buyerOnly: 1, shopOwners: 2, superAdmins: 1 });
  });

  it('filters by role membership and sorts by email or join date', () => {
    expect(filterAndSortRoleUsers(users, { q: '', role: 'shop_owner', sort: 'newest' }).map((user) => user.id)).toEqual(['owner', 'admin']);
    expect(filterAndSortRoleUsers(users, { q: 'BUYER', role: 'all', sort: 'email' }).map((user) => user.id)).toEqual(['buyer']);
    expect(filterAndSortRoleUsers(users, { q: '', role: 'all', sort: 'oldest' }).map((user) => user.id)).toEqual(['buyer', 'admin', 'owner', 'founder']);
  });

  it('paginates loaded users and clamps out-of-range pages', () => {
    const result = paginateRoleUsers(users, 8, 2);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(2);
    expect(result.items.map((user) => user.id)).toEqual(['admin', 'founder']);
  });

  it('round-trips known query values while preserving unrelated parameters', () => {
    const search = new URLSearchParams('keep=1&q=owner&role=shop_owner&sort=email&page=3');
    expect(roleQueryFromSearch(search)).toEqual({ q: 'owner', role: 'shop_owner', sort: 'email', page: 3 });
    const merged = mergeRoleQuery(search, DEFAULT_ROLE_QUERY);
    expect(merged.toString()).toBe('keep=1');
  });

  it('keeps founders, self elevated access, and unmanaged super admins protected', () => {
    expect(getUserProtection(users[3], 'manager', true)).toBe('founder');
    expect(getUserProtection(users[2], 'admin', true)).toBe('own_elevated_access');
    expect(getUserProtection(users[2], 'manager', false)).toBe('super_admin_manager_only');
    expect(getUserProtection(users[1], 'manager', false)).toBeNull();
  });
});

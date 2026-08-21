export type RoleFilter = 'all' | 'buyer_only' | 'shop_owner' | 'super_admin' | 'founder';
export type RoleSort = 'newest' | 'oldest' | 'email';
export type RoleAction = 'grant_super_admin' | 'grant_shop_owner' | 'remove_elevated_access';

export interface RoleRow {
  role: string;
  shop_id: string | null;
}

export interface AdminRoleUser {
  id: string;
  email: string | null;
  created_at: string;
  roles: RoleRow[];
}

export interface RoleQuery {
  q: string;
  role: RoleFilter;
  sort: RoleSort;
  page: number;
}

export interface RoleCounts {
  total: number;
  buyerOnly: number;
  shopOwners: number;
  superAdmins: number;
}

export type UserProtection =
  | 'founder'
  | 'own_elevated_access'
  | 'super_admin_manager_only'
  | null;

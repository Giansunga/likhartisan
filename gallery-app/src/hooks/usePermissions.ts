import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export type Role = 'super_admin' | 'shop_owner' | 'buyer';

export interface UserRole {
  role: Role;
  shopId?: string;
}

export function usePermissions() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    const fetchRoles = async () => {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role, shop_id')
          .eq('user_id', user.id);
        
        if (error) {
          console.error('Fetch roles error:', error);
          setRoles([]);
        } else {
          setRoles(data?.map(r => ({ 
            role: r.role as Role, 
            shopId: r.shop_id || undefined 
          })) || []);
        }
      } catch (e) {
        console.error('Fetch roles error:', e);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, [user, authLoading]);

  const isSuperAdmin = roles.some(r => r.role === 'super_admin');
  
  const isShopOwner = useCallback((shopId?: string) => {
    return roles.some(r => r.role === 'shop_owner' && (!shopId || r.shopId === shopId));
  }, [roles]);

  const isBuyer = roles.some(r => r.role === 'buyer');
  
  const shopId = roles.find(r => r.role === 'shop_owner')?.shopId;

  const can = useCallback((permission: string, context?: any) => {
    const { shopId: ctxShopId } = context || {};
    
    // Super admin can do everything
    if (isSuperAdmin) return true;

    switch (permission) {
      // Admin permissions
      case 'admin.access':
      case 'admin.users.view':
      case 'admin.users.manage':
      case 'admin.shops.view':
      case 'admin.shops.manage':
      case 'admin.products.view':
      case 'admin.products.manage':
      case 'admin.orders.view':
      case 'admin.orders.manage':
      case 'admin.artisans.view':
      case 'admin.artisans.manage':
      case 'admin.roles.manage':
        return isSuperAdmin;

      // Shop owner permissions (scoped to their shop)
      case 'shop.profile.view':
      case 'shop.profile.edit':
      case 'shop.products.view':
      case 'shop.products.manage':
      case 'shop.orders.view':
      case 'shop.orders.manage':
      case 'shop.artisans.view':
      case 'shop.artisans.manage':
        return isShopOwner(ctxShopId);

      // Buyer permissions
      case 'buyer.cart':
      case 'buyer.checkout':
      case 'buyer.orders.view':
      case 'buyer.orders.cancel':
      case 'buyer.favorites':
      case 'buyer.reviews':
      case 'buyer.chat':
      case 'buyer.freeform':
        return isBuyer;

      default:
        return false;
    }
  }, [isSuperAdmin, isShopOwner, isBuyer]);

  return { 
    isSuperAdmin, 
    isShopOwner, 
    isBuyer, 
    shopId, 
    roles, 
    loading: loading || authLoading, 
    can 
  };
}
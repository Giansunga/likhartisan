import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SHOP_EMAILS } from './constants';

export async function getAuthDestination(user: User): Promise<string> {
  if (user.email && SHOP_EMAILS.some((email: string) => email.toLowerCase() === user.email?.toLowerCase())) {
    return '/artisan-dashboard';
  }

  const { data, error } = await supabase.from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'shop_owner')
    .limit(1);

  return !error && data?.length ? '/artisan-dashboard' : '/';
}

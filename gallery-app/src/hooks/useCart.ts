import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getCart, onCartUpdate } from '../data/store';
export function useCart(userId: string | null | undefined) {
 const snapshot = useCallback(() => JSON.stringify(getCart(userId)), [userId]);
 const value = useSyncExternalStore(onCartUpdate, snapshot, () => '[]');
 return useMemo(() => JSON.parse(value) as ReturnType<typeof getCart>, [value]);
}

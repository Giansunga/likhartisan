import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem } from '@/types';

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variationId?: string) => void;
  updateQuantity: (productId: string, qty: number, variationId?: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === item.productId && i.variationId === item.variationId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId && i.variationId === item.variationId
                  ? { ...i, qty: i.qty + item.qty }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        });
      },

      removeItem: (productId, variationId) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.productId === productId && i.variationId === variationId)
          ),
        }));
      },

      updateQuantity: (productId, qty, variationId) => {
        if (qty <= 0) {
          get().removeItem(productId, variationId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId && i.variationId === variationId
              ? { ...i, qty }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => {
        return get().items.reduce((sum, item) => sum + item.price * item.qty, 0);
      },

      getItemCount: () => {
        return get().items.reduce((sum, item) => sum + item.qty, 0);
      },
    }),
    {
      name: 'likhartisan-cart',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

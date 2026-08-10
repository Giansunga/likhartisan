import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { ArtisanProduct, ArtisanShop } from '../../types/artisan';

export interface ArtisanContextValue {
  shop: ArtisanShop;
  products: ArtisanProduct[];
  productPrices: Record<string, number>;
  loadingProducts: boolean;
  loadingOrders: boolean;
  loadingMessages: boolean;
  buyerActiveMap: Record<string, boolean>;
  userId: string;
  setProducts: Dispatch<SetStateAction<ArtisanProduct[]>>;
  setShop: Dispatch<SetStateAction<ArtisanShop | null>>;
  setLoadingOrders: Dispatch<SetStateAction<boolean>>;
  setLoadingMessages: Dispatch<SetStateAction<boolean>>;
  refreshProducts: () => Promise<void>;
}

export const ArtisanContext = createContext<ArtisanContextValue | null>(null);

export function useArtisanPortal() {
  const value = useContext(ArtisanContext);
  if (!value) throw new Error('useArtisanPortal must be used inside ArtisanProvider');
  return value;
}

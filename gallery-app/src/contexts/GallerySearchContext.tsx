import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type GallerySearchBinding = { value: string; onChange: (value: string) => void };
const GallerySearchContext = createContext<{
  binding: GallerySearchBinding | null;
  setBinding: (binding: GallerySearchBinding | null) => void;
}>({ binding: null, setBinding: () => {} });

export function GallerySearchProvider({ children }: { children: ReactNode }) {
  const [binding, setBinding] = useState<GallerySearchBinding | null>(null);
  const value = useMemo(() => ({ binding, setBinding }), [binding]);
  return <GallerySearchContext.Provider value={value}>{children}</GallerySearchContext.Provider>;
}

// The page registers its existing search state; the navbar does not own another query.
// eslint-disable-next-line react-refresh/only-export-components
export function useGallerySearch() { return useContext(GallerySearchContext); }

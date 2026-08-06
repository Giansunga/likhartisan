import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { DecorationParams } from '../components/freeform/decor';

export type SavedDesign = {
  id: string;
  name: string;
  shop_id: string | null;
  model_name: string;
  model_file: string;
  model_id?: string | null;
  shape_params: { height: number; bodyWidth: number; neckWidth: number; rimSize: number; curvature: number };
  material_params: { finish: string; color: string };
  decor_params?: DecorationParams;
  attachment_params?: unknown;
  thumbnail: string;
  created_at: string;
  updated_at?: string;
  shops?: { id: string; name: string } | null;
  models_3d?: { id: string; category: string; thumbnail: string; file_url: string } | null;
};

export function useSavedDesigns(userId: string | undefined) {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDesigns = useCallback(async () => {
    if (!userId) {
      setDesigns([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('designs')
      .select(`*, shops(id, name), models_3d(id, category, thumbnail, file_url)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setDesigns((data as SavedDesign[]) || []);
    setLoading(false);
  }, [userId]);

  const renameDesign = useCallback(async (id: string, newName: string) => {
    if (!userId) return false;
    const { error } = await supabase.from('designs').update({ name: newName }).eq('id', id).eq('user_id', userId);
    if (error) return false;
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, name: newName } : d)));
    return true;
  }, [userId]);

  const deleteDesign = useCallback(async (id: string) => {
    if (!userId) return false;
    const { error } = await supabase.from('designs').delete().eq('id', id).eq('user_id', userId);
    if (error) return false;
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    return true;
  }, [userId]);

  return { designs, loading, fetchDesigns, renameDesign, deleteDesign };
}
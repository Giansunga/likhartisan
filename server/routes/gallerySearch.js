import { Router } from 'express';
import { recordGallerySearchClick, resetGalleryRecommendations, searchGallery } from '../services/gallerySearchService.js';

async function optionalUserId(req, res, supabase, required = false) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    if (required) res.status(401).json({ error: 'Missing authorization header' });
    return null;
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
  return user.id;
}

export function createGallerySearchRouter({ supabase, searchLimiter }) {
  const router = Router();
  router.post('/search', searchLimiter, async (req, res) => {
    if (process.env.AI_GALLERY_SEARCH_ENABLED !== 'true') {
      return res.status(503).json({ error: 'AI gallery search is disabled', code: 'AI_SEARCH_DISABLED' });
    }
    const userId = await optionalUserId(req, res, supabase);
    if (req.headers.authorization && !userId) return;
    try { res.json(await searchGallery(supabase, { ...req.body, userId })); }
    catch (error) {
      if (error instanceof Error && error.message === 'INVALID_QUERY') {
        return res.status(400).json({ error: 'Query must contain between 2 and 200 characters' });
      }
      console.error('Gallery search error:', error);
      res.status(500).json({ error: 'Gallery search is temporarily unavailable' });
    }
  });
  router.post('/search/click', async (req, res) => {
    const userId = await optionalUserId(req, res, supabase);
    if (req.headers.authorization && !userId) return;
    try {
      await recordGallerySearchClick(supabase, { searchId: req.body?.searchId, productId: req.body?.productId, userId });
      res.status(204).end();
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_CLICK') return res.status(400).json({ error: 'Invalid search click' });
      console.error('Gallery search click error:', error);
      res.status(500).json({ error: 'Unable to record search click' });
    }
  });
  router.post('/search/reset', async (req, res) => {
    const userId = await optionalUserId(req, res, supabase, true);
    if (!userId) return;
    try {
      await resetGalleryRecommendations(supabase, userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Gallery recommendation reset error:', error);
      res.status(500).json({ error: 'Unable to reset recommendation history' });
    }
  });
  return router;
}

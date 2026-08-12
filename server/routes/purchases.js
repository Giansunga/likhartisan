import { Router } from 'express';
import {
  cancelBuyerOrder, completeReturnEvidence, createReturnDraft, getAdminReturnForOrder, getBuyerPurchase, listBuyerPurchases,
  presignReturnEvidence, receiveBuyerOrder, reorderPlan, reviewReturnRequest,
  submitReturnRequest,
} from '../services/purchaseService.js';

function errorResponse(res, error) {
  const status = Number(error?.status) || 500;
  const code = error instanceof Error ? error.message : 'PURCHASE_ERROR';
  const messages = {
    ORDER_NOT_FOUND: 'Order not found', ORDER_NOT_CANCELLABLE: 'This order can no longer be cancelled',
    ORDER_NOT_DELIVERED: 'This order is not ready for receipt confirmation', ORDER_CHANGED: 'The order changed; refresh and try again',
    RETURN_NOT_ELIGIBLE: 'This order is outside the return window', RETURN_EXISTS: 'This order already has an active return request',
    EVIDENCE_REQUIRED: 'Add at least one supporting image', EVIDENCE_LIMIT: 'A maximum of three images is allowed',
    RETURN_NOT_FOUND: 'Return request not found',
  };
  if (status >= 500) console.error('Purchases API error:', error);
  res.status(status).json({ error: messages[code] || (status >= 500 ? 'Purchase service is temporarily unavailable' : 'Invalid request'), code });
}

export function createPurchasesRouter({ supabase, verifyAuth, requireSuperAdmin }) {
  const router = Router();
  router.use(async (req, res, next) => {
    const userId = await verifyAuth(req, res);
    if (!userId) return;
    req.verifiedUserId = userId;
    next();
  });
  router.get('/', async (req, res) => {
    try { res.json(await listBuyerPurchases(supabase, req.verifiedUserId, req.query)); }
    catch (error) { errorResponse(res, error); }
  });
  router.get('/:orderId', async (req, res) => {
    try {
      const detail = await getBuyerPurchase(supabase, req.params.orderId, req.verifiedUserId);
      if (!detail) return res.status(404).json({ error: 'Order not found', code: 'ORDER_NOT_FOUND' });
      res.json(detail);
    } catch (error) { errorResponse(res, error); }
  });
  router.post('/:orderId/cancel', async (req, res) => {
    try { res.json(await cancelBuyerOrder(supabase, req.params.orderId, req.verifiedUserId)); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/:orderId/receive', async (req, res) => {
    try { res.json(await receiveBuyerOrder(supabase, req.params.orderId, req.verifiedUserId)); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/:orderId/reorder-plan', async (req, res) => {
    try { res.json(await reorderPlan(supabase, req.params.orderId, req.verifiedUserId)); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/:orderId/returns', async (req, res) => {
    try { res.status(201).json(await createReturnDraft(supabase, req.params.orderId, req.verifiedUserId, req.body ?? {})); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/returns/:requestId/evidence/presign', async (req, res) => {
    try { res.json(await presignReturnEvidence(supabase, req.params.requestId, req.verifiedUserId, req.body ?? {})); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/returns/:requestId/evidence/complete', async (req, res) => {
    try { res.json(await completeReturnEvidence(supabase, req.params.requestId, req.verifiedUserId, req.body ?? {})); }
    catch (error) { errorResponse(res, error); }
  });
  router.post('/returns/:requestId/submit', async (req, res) => {
    try { res.json(await submitReturnRequest(supabase, req.params.requestId, req.verifiedUserId)); }
    catch (error) { errorResponse(res, error); }
  });
  router.patch('/admin/returns/:requestId', async (req, res) => {
    try {
      if (!(await requireSuperAdmin(req.verifiedUserId))) return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
      res.json(await reviewReturnRequest(supabase, req.params.requestId, req.verifiedUserId, req.body ?? {}));
    } catch (error) { errorResponse(res, error); }
  });
  router.get('/admin/returns/order/:orderId', async (req, res) => {
    try {
      if (!(await requireSuperAdmin(req.verifiedUserId))) return res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
      res.json({ returnRequest: await getAdminReturnForOrder(supabase, req.params.orderId) });
    } catch (error) { errorResponse(res, error); }
  });
  return router;
}

import { Router } from 'express';
import { handleGetQuote, handleGetCityInfo } from '../controllers/lalamoveController.js';

const router = Router();

router.post('/quote', handleGetQuote);
router.get('/city-info', handleGetCityInfo);

export default router;

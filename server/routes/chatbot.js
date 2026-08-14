import { Router } from 'express';
import { handleChat, handleFeedback } from '../controllers/chatbotController.js';

const router = Router();

router.post('/', handleChat);
router.post('/feedback', handleFeedback);

export default router;

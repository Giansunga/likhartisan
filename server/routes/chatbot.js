import { Router } from 'express';
import { handleChat } from '../controllers/chatbotController.js';

const router = Router();

router.post('/', handleChat);

export default router;

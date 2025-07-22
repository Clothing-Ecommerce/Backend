import { Router } from 'express';
import { getCategories } from '../controllers/categoryController';

const router = Router();

router.get('/all', getCategories);

export default router;
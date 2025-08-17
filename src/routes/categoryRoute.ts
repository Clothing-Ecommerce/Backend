import { Router } from 'express';
import { getCategoriesController } from '../controllers/categoryController';

const router = Router();

router.get('/', getCategoriesController);

export default router;
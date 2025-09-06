import { Router } from 'express';
import { getCategoriesController, getCategoryTreeController } from '../controllers/categoryController';

const router = Router();

router.get("/", getCategoriesController);
router.get("/tree", getCategoryTreeController);

export default router;
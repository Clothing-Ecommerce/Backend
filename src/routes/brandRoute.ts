import { Router } from 'express';
import { getBrands } from '../controllers/brandController';

const router = Router();

router.get('/all', getBrands);

export default router;
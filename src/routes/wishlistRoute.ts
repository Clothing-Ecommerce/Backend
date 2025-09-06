import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import { getWishlistCountController } from "../controllers/wishlistController";

const router = Router();

router.use(authenticateJWT);

router.get("/count", getWishlistCountController);

export default router;
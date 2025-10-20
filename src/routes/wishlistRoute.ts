import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import {
  addProductToWishlistController,
  getWishlistCountController,
  getWishlistItemsController,
  removeProductFromWishlistController,
} from "../controllers/wishlistController";

const router = Router();

router.use(authenticateJWT);

router.get("/count", getWishlistCountController);
router
  .route("/")
  .get(getWishlistItemsController)
  .post(addProductToWishlistController);
router.delete("/:productId", removeProductFromWishlistController);

export default router;
import { Router } from "express";
import {
  addItemToCartController,
  applyPromoController,
  getAvailablePromosController,
  getCartItemsController,
  removeCartItemController,
  removePromoController,
  updateCartItemController,
} from "../controllers/cartController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateJWT);

router
  .route("/")
  .get(getCartItemsController)
  .post(addItemToCartController);

router
  .route("/items/:itemId")
  .patch(updateCartItemController)
  .delete(removeCartItemController);

router.get("/promos/available", getAvailablePromosController);

router
  .route("/promos/apply")
  .post(applyPromoController)
  .delete(removePromoController);

export default router;
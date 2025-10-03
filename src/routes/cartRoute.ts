import { Router } from "express";
import {
  addItemToCartController,
  applyPromoController,
  getAvailablePromosController,
  getCartCountController,
  getCartItemsController,
  getPaymentMethodsController,
  removeCartItemController,
  removePromoController,
  updateCartItemController,
  updatePaymentMethodController,
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

router.get("/count", getCartCountController);

router.get("/payment-methods", getPaymentMethodsController);
router.patch("/payment-method", updatePaymentMethodController);

export default router;
import { Router } from "express";
import {
  addItemToCartController,
  getCartItemsController,
  removeCartItemController,
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

export default router;
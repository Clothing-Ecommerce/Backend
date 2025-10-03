import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import { orderMomoRetryController, orderPaymentsListController, placeOrderController } from "../controllers/orderController";

const router = Router();

router.use(authenticateJWT);

router.get("/:orderId/payments", orderPaymentsListController);
router.post("/:orderId/payments/momo/retry", orderMomoRetryController);
router.post("/checkout", placeOrderController);

export default router;
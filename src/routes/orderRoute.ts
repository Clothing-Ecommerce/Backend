import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import { orderMomoRetryController, orderPaymentsListController } from "../controllers/orderController";

const router = Router();

router.get("/:orderId/payments", authenticateJWT, orderPaymentsListController);
router.post("/:orderId/payments/momo/retry", authenticateJWT, orderMomoRetryController);

export default router;
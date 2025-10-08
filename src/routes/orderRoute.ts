import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import {
  cancelOrderController,
  getOrderDetailController,
  listOrdersController,
  orderMomoRetryController,
  orderPaymentsListController,
  placeOrderController,
  reorderOrderController,
} from "../controllers/orderController";

const router = Router();

router.use(authenticateJWT);

router.get("/list", listOrdersController);
router.post("/checkout", placeOrderController);

router.get("/:orderId/payments", orderPaymentsListController); // xem lịch sử thanh toán
router.post("/:orderId/payments/momo/retry", orderMomoRetryController);
router.get("/:orderId", getOrderDetailController);
router.post("/:orderId/cancel", cancelOrderController);
router.post("/:orderId/reorder", reorderOrderController);

export default router;
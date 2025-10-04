import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import {
  momoCreateController,
  momoWebhookController,
  paymentGetOneController,
  paymentSyncController,
  paymentRefundController,
} from "../controllers/paymentController";

const router = Router();

// Webhook PUBLIC (MoMo gọi trực tiếp) — không dùng auth
router.post("/momo/webhook", momoWebhookController);

// Protected
router.post("/momo/create", authenticateJWT, momoCreateController);
router.post("/:paymentId/sync", authenticateJWT, paymentSyncController);

// === NEW P1 endpoints ===
router.get("/:paymentId", authenticateJWT, paymentGetOneController);
router.post("/:paymentId/refund", authenticateJWT, paymentRefundController);

export default router;

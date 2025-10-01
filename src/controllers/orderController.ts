import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  listPaymentsOfOrder,
  retryMomoPayment,
} from "../services/orderService";

// GET /orders/:orderId/payments (protected)
export const orderPaymentsListController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const orderId = Number(req.params.orderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ code: "INVALID_ORDER_ID" });
    }

    const items = await listPaymentsOfOrder(userId, orderId);
    return res.status(200).json({ items });

  } catch (err: any) {
    const code = err?.message || "SERVER_ERROR";
    if (code === "ORDER_NOT_FOUND_OR_FORBIDDEN") {
      return res.status(404).json({ code, message: "Không tìm thấy đơn hoặc không thuộc về bạn" });
    }
    console.error("orderPaymentsListController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

// POST /orders/:orderId/payments/momo/retry (protected)
export const orderMomoRetryController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const orderId = Number(req.params.orderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ code: "INVALID_ORDER_ID" });
    }

    const { orderInfo, extraData, autoCapture, lang } = req.body || {};
    const data = await retryMomoPayment(userId, orderId, { orderInfo, extraData, autoCapture, lang });

    return res.status(201).json({
      paymentId: data.paymentId,
      payUrl: data.payUrl,
      gateway: data.result,
    });

  } catch (err: any) {
    const code = err?.message || "SERVER_ERROR";
    if (code === "ORDER_ALREADY_PAID") {
      return res.status(409).json({ code, message: "Đơn đã thanh toán" });
    }
    if (code === "ORDER_NOT_FOUND_OR_FORBIDDEN") {
      return res.status(404).json({ code, message: "Không tìm thấy đơn hoặc không thuộc về bạn" });
    }
    if (code === "ORDER_CANCELLED") {
      return res.status(409).json({ code, message: "Đơn đã bị hủy" });
    }
    console.error("orderMomoRetryController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};
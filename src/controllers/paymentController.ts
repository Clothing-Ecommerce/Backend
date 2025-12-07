import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  createAttemptMomo,
  getPaymentById,
  handleMomoIpn,
  refundPayment,
  syncPaymentStatus,
} from "../services/paymentService";

export const momoCreateController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const { orderId, orderInfo, extraData, autoCapture, lang } = req.body || {};
    const id = Number(orderId);
    if (!Number.isSafeInteger(id) || id <= 0)
      return res.status(400).json({ code: "INVALID_ORDER_ID" });

    const data = await createAttemptMomo(userId, id, {
      orderInfo,
      extraData,
      autoCapture,
      lang,
    });
    return res
      .status(201)
      .json({
        paymentId: data.paymentId,
        payUrl: data.payUrl,
        gateway: data.result,
      });
  } catch (err: any) {
    const code = err?.message || "SERVER_ERROR";
    if (code === "ORDER_ALREADY_PAID")
      return res.status(409).json({ code, message: "Đơn đã thanh toán" });
    if (code === "ORDER_NOT_FOUND_OR_FORBIDDEN")
      return res
        .status(404)
        .json({ code, message: "Không tìm thấy đơn hoặc không thuộc về bạn" });
    console.error("momoCreateController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

export const momoWebhookController = async (req: any, res: Response) => {
  try {
    const result = await handleMomoIpn(req.body);
    if (!result.ok)
      return res.status(200).json({ resultCode: 1, message: "invalid" });
    // return res.status(200).json({ resultCode: 0, message: "success" });
    return res.sendStatus(204);
  } catch (err) {
    console.error("momoWebhookController", err);
    return res.status(200).json({ resultCode: 1, message: "error" });
  }
};

export const paymentSyncController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const paymentId = Number(req.params.paymentId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ code: "INVALID_PAYMENT_ID" });
    }

    const { success, momoResp } = await syncPaymentStatus(userId, paymentId);
    return res.status(200).json({ success, momoResp });

  } catch (err: any) {
    const code = err?.message || "SERVER_ERROR";

    if (code === "PAYMENT_NOT_FOUND_OR_FORBIDDEN") {
      return res.status(404).json({ code, message: "Không tìm thấy payment hoặc không thuộc về bạn" });
    }
    if (code === "MISSING_PROVIDER_IDS") {
      return res.status(400).json({ code, message: "Payment thiếu providerRequestId/orderId, không thể sync" });
    }
    if (code === "GATEWAY_ERROR") {
      return res.status(502).json({ code, message: "MoMo gateway trả lỗi", detail: err?.data ?? null });
    }

    console.error("paymentSyncController SERVER_ERROR", err?.stack || err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

// GET /payment/:paymentId (protected)
export const paymentGetOneController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const paymentId = Number(req.params.paymentId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ code: "INVALID_PAYMENT_ID" });
    }

    const data = await getPaymentById(userId, paymentId);
    return res.status(200).json(data);

  } catch (err: any) {
    const code = err?.message || "SERVER_ERROR";
    if (code === "PAYMENT_NOT_FOUND_OR_FORBIDDEN") {
      return res.status(404).json({ code, message: "Không tìm thấy payment hoặc không thuộc về bạn" });
    }
    console.error("paymentGetOneController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

export const paymentRefundController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ code: "UNAUTHENTICATED" });

    const paymentId = Number(req.params.paymentId);
    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ code: "INVALID_PAYMENT_ID" });
    }

    const { amount, reason } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ code: "INVALID_AMOUNT" });
    }

    const data = await refundPayment(userId, paymentId, amount, reason || null);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error("paymentRefundController", err);
    return res.status(500).json({ code: err.message || "SERVER_ERROR" });
  }
};

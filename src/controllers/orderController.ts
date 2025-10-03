import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  listPaymentsOfOrder,
  placeOrderFromCart,
  retryMomoPayment,
} from "../services/orderService";
import { PaymentMethod } from ".prisma/client";
import { ServiceError } from "../services/cartService";

const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    return null;
  }
  return userId;
};

export const placeOrderController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const addressId = Number(req.body?.addressId ?? req.body?.address_id);
  if (!Number.isInteger(addressId) || addressId <= 0) {
    return res
      .status(400)
      .json({ code: "INVALID_ADDRESS", message: "Địa chỉ giao hàng không hợp lệ" });
  }

  const rawMethod = req.body?.paymentMethod ?? req.body?.method;
  const normalizedMethod = rawMethod != null ? String(rawMethod).trim().toUpperCase() : "";
  const method = (normalizedMethod
    ? (Object.values(PaymentMethod).find((value) => value === normalizedMethod) as
        | PaymentMethod
        | undefined)
    : PaymentMethod.COD) as PaymentMethod | undefined;

  if (!method) {
    return res
      .status(400)
      .json({ code: "INVALID_PAYMENT_METHOD", message: "Phương thức thanh toán không hợp lệ" });
  }

  const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
  const momoRaw = req.body?.momo ?? req.body?.momoOptions ?? null;
  const momoOptions =
    momoRaw && typeof momoRaw === "object"
      ? {
          orderInfo:
            typeof momoRaw.orderInfo === "string" ? momoRaw.orderInfo : undefined,
          extraData:
            momoRaw.extraData && typeof momoRaw.extraData === "object"
              ? (momoRaw.extraData as Record<string, any>)
              : undefined,
          autoCapture:
            typeof momoRaw.autoCapture === "boolean" ? momoRaw.autoCapture : undefined,
          lang:
            momoRaw.lang === "vi" || momoRaw.lang === "en"
              ? (momoRaw.lang as "vi" | "en")
              : undefined,
        }
      : undefined;

  try {
    const result = await placeOrderFromCart(userId, {
      addressId,
      paymentMethod: method,
      notes,
      momo: momoOptions,
    });
    return res.status(201).json(result);
  } catch (err: any) {
    console.error("Error placing order from cart:", err);
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi tạo đơn hàng" });
  }
};

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
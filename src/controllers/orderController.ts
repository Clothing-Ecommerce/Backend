import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  cancelOrder,
  getOrderDetail,
  listPaymentsOfOrder,
  listUserOrders,
  placeOrderFromCart,
  reorderOrder,
  retryMomoPayment,
  type ListOrdersOptions,
} from "../services/orderService";
import { OrderStatus, PaymentMethod } from ".prisma/client";
import { ServiceError } from "../services/cartService";

const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    return null;
  }
  return userId;
};

const parseNumericQuery = (value: unknown): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseDateQuery = (value: unknown): Date | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const parseStatusQuery = (value: unknown): OrderStatus[] | undefined => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(",")
    : [];

  const normalized = rawValues
    .map((status) =>
      typeof status === "string" ? status.trim().toUpperCase() : ""
    )
    .filter((status): status is string => status.length > 0)
    .map((status) => status as OrderStatus)
    .filter((status) =>
      (Object.values(OrderStatus) as string[]).includes(status)
    );

  if (!normalized.length) return undefined;
  return Array.from(new Set(normalized)) as OrderStatus[];
};

export const listOrdersController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const options: ListOrdersOptions = {};

  const page = parseNumericQuery(req.query.page);
  if (page !== undefined) options.page = page;

  const pageSize = parseNumericQuery(req.query.pageSize ?? req.query.limit);
  if (pageSize !== undefined) options.pageSize = pageSize;

  const statuses = parseStatusQuery(req.query.status);
  if (statuses) options.statuses = statuses;

  const from = parseDateQuery(req.query.from ?? req.query.start);
  if (from) options.from = from;

  const to = parseDateQuery(req.query.to ?? req.query.end);
  if (to) options.to = to;

  try {
    const result = await listUserOrders(userId, options);
    const { pagination } = result;
    const { page, pageSize, totalPages } = pagination;

    const buildPageLink = (targetPage: number): string => {
      const host = req.get("host");
      const origin = `${req.protocol}://${host ?? "localhost"}`;
      const url = new URL(req.originalUrl, origin);
      url.searchParams.set("page", String(targetPage));
      url.searchParams.set("pageSize", String(pageSize));
      return host ? url.toString() : `${url.pathname}${url.search}`;
    };

    const hasPages = totalPages > 0;
    const previousLink = hasPages && page > 1 ? buildPageLink(page - 1) : null;
    const nextLink = hasPages && page < totalPages ? buildPageLink(page + 1) : null;

    return res.status(200).json({
      ...result,
      pagination: {
        ...pagination,
        previousLink,
        nextLink,
      },
    });
  } catch (err) {
    console.error("listOrdersController", err);
    return res
      .status(500)
      .json({ code: "SERVER_ERROR", message: "Không thể tải danh sách đơn hàng" });
  }
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

export const getOrderDetailController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ code: "INVALID_ORDER_ID" });
  }

  try {
    const order = await getOrderDetail(userId, orderId);
    return res.status(200).json(order);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    console.error("getOrderDetailController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

export const cancelOrderController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ code: "INVALID_ORDER_ID" });
  }

  const reason =
    typeof req.body?.reason === "string" ? req.body.reason : undefined;

  try {
    const order = await cancelOrder(userId, orderId, reason);
    return res.status(200).json(order);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    console.error("cancelOrderController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
  }
};

export const reorderOrderController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const orderId = Number(req.params.orderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ code: "INVALID_ORDER_ID" });
  }

  try {
    const result = await reorderOrder(userId, orderId);
    return res.status(200).json(result);
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    console.error("reorderOrderController", err);
    return res.status(500).json({ code: "SERVER_ERROR" });
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
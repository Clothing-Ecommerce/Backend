import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  addItemToCart,
  computeCart,
  removeCartItem,
  updateCartItemQuantity,
  updateCartItemVariant,
  ServiceError,
  listAvailableCouponsForCart,
  applyPromoToCart,
  removePromoFromCart,
  getCartCounts,
  getPaymentMethods,
  updatePaymentMethod,
} from "../services/cartService";
import { PaymentMethod } from ".prisma/client";

/** Helper: get userId from auth and send 401 if missing */
const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res.status(401).json({ code: "UNAUTHORIZED", message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    return null;
  }
  return userId;
};

/** GET /cart – full cart + summary */
export const getCartItemsController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  try {
    const cart = await computeCart(userId);
    return res.status(200).json(cart);
  } catch (err) {
    console.error("Error getting cart:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy giỏ hàng" });
  }
};

/** POST /cart/items – add item then return full cart */
export const addItemToCartController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  try {
    const rawVariantId = req.body?.variantId;
    const rawQty = req.body?.quantity;

    const variantId = Number(rawVariantId);
    if (!Number.isInteger(variantId) || variantId <= 0) {
      return res.status(400).json({ code: "INVALID_INPUT", message: "variantId không hợp lệ" });
    }

    const quantity = Number(rawQty);
    const qtySafe = Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1;

    await addItemToCart(userId, variantId, qtySafe);
    const cart = await computeCart(userId);
    return res.status(201).json(cart);
  } catch (err: any) {
    console.error("Error adding item to cart:", err);
    if (err instanceof ServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message, data: err.data });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi thêm sản phẩm vào giỏ hàng" });
  }
};

/** PATCH /cart/items/:itemId – update quantity or variant */
export const updateCartItemController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ code: "INVALID_INPUT", message: "itemId không hợp lệ" });
  }

  try {
    const { quantity, variantId } = req.body ?? {};

    if (typeof variantId === "number") {
      await updateCartItemVariant(userId, itemId, Number(variantId));
    }
    if (typeof quantity === "number") {
      await updateCartItemQuantity(userId, itemId, Number(quantity));
    }

    const cart = await computeCart(userId);
    return res.status(200).json(cart);
  } catch (err: any) {
    console.error("Error updating cart item:", err);
    if (err instanceof ServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message, data: err.data });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi cập nhật giỏ hàng" });
  }
};

/** DELETE /cart/items/:itemId – remove item and return cart */
export const removeCartItemController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return res.status(400).json({ code: "INVALID_INPUT", message: "itemId không hợp lệ" });
  }

  try {
    await removeCartItem(userId, itemId);
    const cart = await computeCart(userId);
    return res.status(200).json(cart);
  } catch (err: any) {
    console.error("Error removing cart item:", err);
    if (err instanceof ServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message, data: err.data });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi xoá sản phẩm khỏi giỏ hàng" });
  }
};

/** GET /cart/promos/available */
export const getAvailablePromosController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const coupons = await listAvailableCouponsForCart(userId);
    return res.status(200).json({ coupons });
  } catch (err) {
    console.error("Error listing promos:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy danh sách mã" });
  }
};

/** POST /cart/promos/apply  { code } */
export const applyPromoController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ code: "INVALID_INPUT", message: "Thiếu code" });
  try {
    const cart = await applyPromoToCart(userId, code);
    return res.status(200).json(cart);
  } catch (err: any) {
    console.error("Error applying promo:", err);
    if (err instanceof ServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message, data: err.data });
    }
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi áp mã" });
  }
};

/** DELETE /cart/promos/apply */
export const removePromoController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const cart = await removePromoFromCart(userId);
    return res.status(200).json(cart);
  } catch (err) {
    console.error("Error removing promo:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi gỡ mã" });
  }
};

export const getCartCountController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const counts = await getCartCounts(userId);
    return res.status(200).json(counts);
  } catch (err) {
    console.error("Error get cart counts:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy số lượng giỏ" });
  }
};

export const getPaymentMethodsController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const data = await getPaymentMethods(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error getting cart payment methods:", err);
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy phương thức thanh toán" });
  }
};

export const updatePaymentMethodController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const rawMethod = String(req.body?.method ?? "").trim();
  if (!rawMethod) {
    return res
      .status(400)
      .json({ code: "INVALID_INPUT", message: "Thiếu phương thức thanh toán" });
  }

  const normalized = rawMethod.toUpperCase();
  const method = Object.values(PaymentMethod).find((value) => value === normalized);

  if (!method) {
    return res
      .status(400)
      .json({ code: "INVALID_PAYMENT_METHOD", message: "Phương thức thanh toán không hợp lệ" });
  }

  try {
    const data = await updatePaymentMethod(userId, method);
    return res.status(200).json(data);
  } catch (err: any) {
    console.error("Error updating cart payment method:", err);
    if (err instanceof ServiceError) {
      return res
        .status(err.httpStatus)
        .json({ code: err.code, message: err.message, data: err.data });
    }
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi cập nhật phương thức thanh toán" });
  }
};
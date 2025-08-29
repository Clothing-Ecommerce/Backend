// import { Response } from "express";
// import { AuthenticatedRequest } from "../middleware/authMiddleware";
// import { addItemToCart, getCartItems } from "../services/cartService";

// const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
//   const userId = req.user?.userId;
//   if (typeof userId !== "number") {
//     res
//       .status(401)
//       .json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
//     return null;
//   }
//   return userId;
// };

// export const getCartItemsController = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   try {
//     const userId = getUserId(req, res);
//     if (!userId) return;

//     const items = await getCartItems(userId);
//     return res.status(200).json({ items });
//   } catch (err) {
//     console.error("Error fetching cart items:", err);
//     return res
//       .status(500)
//       .json({ message: "Lỗi máy chủ khi lấy thông tin giỏ hàng" });
//   }
// };

// export const addItemToCartController = async (
//   req: AuthenticatedRequest,
//   res: Response
// ) => {
//   try {
//     const userId = getUserId(req, res);
//     if (!userId) return;

//     const { variantId, quantity = 1 } = req.body || {};
//     const vId = Number(variantId);
//     const qty = Number(quantity);

//     if (!Number.isSafeInteger(vId) || vId <= 0) {
//       return res.status(400).json({ message: "variantId không hợp lệ" });
//     }
//     const qtySafe = Number.isSafeInteger(qty) && qty > 0 ? qty : 1;

//     const item = await addItemToCart(userId, vId, qtySafe);
//     return res.status(201).json(item);
//   } catch (err) {
//     console.error("Error adding item to cart:", err);
//     if (err instanceof Error && err.message === "VARIANT_NOT_FOUND") {
//       return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
//     }
//     return res
//       .status(500)
//       .json({ message: "Lỗi máy chủ khi thêm sản phẩm vào giỏ hàng" });
//   }
// };

import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  addItemToCart,
  computeCart,
  removeCartItem,
  updateCartItemQuantity,
  updateCartItemVariant,
  ServiceError,
} from "../services/cartService";

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

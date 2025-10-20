import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  addProductToWishlist,
  getWishlistCount,
  getWishlistItems,
  removeProductFromWishlist,
  WishlistServiceError,
} from "../services/wishlistService";

const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res.status(401).json({
      code: "UNAUTHENTICATED",
      message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
    });
    return null;
  }
  return userId;
};

export const getWishlistCountController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const data = await getWishlistCount(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error get wishlist count:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy wishlist count" });
  }
};

export const getWishlistItemsController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;
  try {
    const data = await getWishlistItems(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error get wishlist items:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy wishlist" });
  }
};

export const addProductToWishlistController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const productId = Number(req.body?.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ code: "INVALID_INPUT", message: "productId không hợp lệ" });
  }

  try {
    const result = await addProductToWishlist(userId, productId);
    const status = result.isNew ? 201 : 200;
    return res.status(status).json(result);
  } catch (err) {
    console.error("Error add wishlist item:", err);
    if (err instanceof WishlistServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message });
    }
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi thêm sản phẩm vào wishlist" });
  }
};

export const removeProductFromWishlistController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = getUserId(req, res);
  if (userId === null) return;

  const productId = Number(req.params.productId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ code: "INVALID_INPUT", message: "productId không hợp lệ" });
  }

  try {
    await removeProductFromWishlist(userId, productId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error remove wishlist item:", err);
    if (err instanceof WishlistServiceError) {
      return res.status(err.httpStatus).json({ code: err.code, message: err.message });
    }
    return res
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi xoá sản phẩm khỏi wishlist" });
  }
};
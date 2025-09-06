import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { getWishlistCount } from "../services/wishlistService";


export const getWishlistCountController = async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    return res.status(401).json({ code: "UNAUTHORIZED", message: "Chưa đăng nhập" });
  }
  try {
    const data = await getWishlistCount(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error get wishlist count:", err);
    return res.status(500).json({ code: "INTERNAL_ERROR", message: "Lỗi máy chủ khi lấy wishlist count" });
  }
};
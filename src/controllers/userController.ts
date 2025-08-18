import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { getUserProfile, updateUserProfile } from "../services/userService";


export const getProfileController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Đảm bảo rằng req.user tồn tại và có userId
    if (!req.user || typeof req.user.userId === "undefined") {
      return res.status(401).json({
        message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
      });
    }

    const userId = req.user.userId;
    const userProfile = await getUserProfile(userId);
    return res.status(200).json(userProfile);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    return res
      .status(500)
      .json({ message: "Lỗi máy chủ khi lấy thông tin profile" });
  }
};

export const updateProfileController = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user || typeof req.user.userId === "undefined") {
      return res.status(401).json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    }

    // Chỉ lấy các field cho phép từ body
    const {
      username,
      email,
      phone,
      gender,
      dateOfBirth,  // "yyyy-mm-dd" hoặc null để xoá
    } = req.body || {};

    const updated = await updateUserProfile(req.user.userId, {
      username,
      email,
      phone: typeof phone === "string" || phone === null ? phone : undefined,
      gender: typeof gender === "string" || gender === null ? gender : undefined,
      dateOfBirth: typeof dateOfBirth === "string" || dateOfBirth === null ? dateOfBirth : undefined,
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error("Error updating user profile:", err);
    if (err instanceof Error) {
      if (err.message === "EMAIL_TAKEN") {
        return res.status(409).json({ message: "Email đã được sử dụng bởi tài khoản khác" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
    }
    return res.status(500).json({ message: "Lỗi máy chủ khi cập nhật profile" });
  }
};
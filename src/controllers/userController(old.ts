import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import {
  createUserAddress,
  deleteUserAddress,
  getUserAddresses,
  getUserProfile,
  setDefaultAddress,
  updateUserAddress,
  updateUserProfile,
} from "../services/userService";

const getUserId = (req: AuthenticatedRequest, res: Response): number | null => {
  const userId = req.user?.userId;
  if (typeof userId !== "number") {
    res
      .status(401)
      .json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    return null;
  }
  return userId;
};

export const getProfileController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // // Đảm bảo rằng req.user tồn tại và có userId
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res.status(401).json({
    //     message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
    //   });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // const userId = req.user.userId;
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

export const updateProfileController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res
    //     .status(401)
    //     .json({
    //       message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
    //     });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // Chỉ lấy các field cho phép từ body
    const {
      username,
      email,
      phone,
      gender,
      dateOfBirth, // "yyyy-mm-dd" hoặc null để xoá
    } = req.body || {};

    const updated = await updateUserProfile(userId, {
      username,
      email,
      phone: typeof phone === "string" || phone === null ? phone : undefined,
      gender:
        typeof gender === "string" || gender === null ? gender : undefined,
      dateOfBirth:
        typeof dateOfBirth === "string" || dateOfBirth === null
          ? dateOfBirth
          : undefined,
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error("Error updating user profile:", err);
    if (err instanceof Error) {
      if (err.message === "EMAIL_TAKEN") {
        return res
          .status(409)
          .json({ message: "Email đã được sử dụng bởi tài khoản khác" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
    }
    return res
      .status(500)
      .json({ message: "Lỗi máy chủ khi cập nhật profile" });
  }
};

export const getAddressesController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res
    //     .status(401)
    //     .json({
    //       message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ",
    //     });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    const data = await getUserAddresses(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching addresses:", err);
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    return res
      .status(500)
      .json({ message: "Lỗi máy chủ khi lấy danh sách địa chỉ" });
  }
};

export const createAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res
    //     .status(401)
    //     .json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // const userId = req.user.userId;
    const payload = req.body;

    const data = await createUserAddress(userId, payload);
    return res.status(201).json(data);
  } catch (err) {
    console.error("Error creating address:", err);
    if (err instanceof Error) {
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
      if (err.message === "RECIPIENT_REQUIRED") {
        return res.status(400).json({ message: "Vui lòng nhập người nhận (recipient)" });
      }
    }
    return res.status(500).json({ message: "Lỗi máy chủ khi tạo địa chỉ" });
  }
};

export const updateAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res.status(401).json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // const userId = req.user.userId;
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId)) {
      return res.status(400).json({ message: "addressId không hợp lệ" });
    }

    const payload = req.body;
    const data = await updateUserAddress(userId, addressId, payload);

    return res.status(200).json(data);
  } catch (err) {
    console.error("Error updating address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res.status(404).json({ message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
    }
    return res.status(500).json({ message: "Lỗi máy chủ khi cập nhật địa chỉ" });
  }
};

export const deleteAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res
    //     .status(401)
    //     .json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // const userId = req.user.userId;
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId)) {
      return res.status(400).json({ message: "addressId không hợp lệ" });
    }

    const result = await deleteUserAddress(userId, addressId);

    return res.status(200).json({
      message: "Xoá địa chỉ thành công",
      ...result,
    });
  } catch (err) {
    console.error("Error deleting address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res
          .status(404)
          .json({ message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
    }
    return res
      .status(500)
      .json({ message: "Lỗi máy chủ khi xoá địa chỉ" });
  }
};

export const setDefaultAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    // if (!req.user || typeof req.user.userId === "undefined") {
    //   return res
    //     .status(401)
    //     .json({ message: "Người dùng chưa xác thực hoặc thông tin không đầy đủ" });
    // }
    const userId = getUserId(req, res);
    if (!userId) return;

    // const userId = req.user.userId;
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId)) {
      return res.status(400).json({ message: "addressId không hợp lệ" });
    }

    const result = await setDefaultAddress(userId, addressId);

    return res.status(200).json({
      message: result.changed
        ? "Đã đặt địa chỉ làm mặc định"
        : "Địa chỉ đã là mặc định",
      previousDefaultAddressId: result.previousDefaultAddressId,
      newDefaultAddressId: result.newDefaultAddressId,
      changed: result.changed,
    });
  } catch (err) {
    console.error("Error set default address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res
          .status(404)
          .json({ message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ message: "Không tìm thấy người dùng" });
      }
    }
    return res.status(500).json({ message: "Lỗi máy chủ khi đặt địa chỉ mặc định" });
  }
};
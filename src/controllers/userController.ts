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

// ---------------- Helpers ----------------
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

const parseIdParam = (raw: string, res: Response, name = "id"): number | null => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ code: "INVALID_ID", message: `${name} không hợp lệ` });
    return null;
  }
  return id;
};

const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isValidPhone = (p: string) => /^[0-9+\-\s]{6,20}$/.test(p);
const isValidDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isValidGender = (g: string) =>
  ["Male", "Female", "Other", "Prefer-not-to-say"].includes(g);

const isValidLabel = (l: unknown) =>
  l === "HOME" || l === "WORK" || l === "OTHER" || l === null || l === undefined;

const toBool = (v: any) => v === true || v === "true" || v === "1";

// ---------------- Controllers ----------------

export const getProfileController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const userProfile = await getUserProfile(userId);
    return res.status(200).json(userProfile);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi lấy thông tin profile" });
  }
};

export const updateProfileController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { username, email, phone, gender, dateOfBirth } = req.body || {};

    // Validate nhẹ ở controller (service vẫn kiểm tra trùng email)
    if (email !== undefined && email !== null) {
      if (typeof email !== "string" || !isValidEmail(email.trim())) {
        return res.status(400).json({ code: "INVALID_EMAIL", message: "Email không hợp lệ" });
      }
    }
    if (phone !== undefined && phone !== null) {
      if (typeof phone !== "string" || (phone.trim() && !isValidPhone(phone.trim()))) {
        return res.status(400).json({ code: "INVALID_PHONE", message: "Số điện thoại không hợp lệ" });
      }
    }
    if (gender !== undefined && gender !== null) {
      if (typeof gender !== "string" || !isValidGender(gender)) {
        return res.status(400).json({ code: "INVALID_GENDER", message: "Giới tính không hợp lệ" });
      }
    }
    if (dateOfBirth !== undefined && dateOfBirth !== null) {
      if (typeof dateOfBirth !== "string" || !isValidDateOnly(dateOfBirth)) {
        return res.status(400).json({ code: "INVALID_DOB", message: "dateOfBirth phải là chuỗi 'YYYY-MM-DD' hoặc null" });
      }
    }

    const updated = await updateUserProfile(userId, {
      username: typeof username === "string" ? username : undefined,
      email: typeof email === "string" ? email : undefined,
      phone: typeof phone === "string" || phone === null ? phone : undefined,
      gender: typeof gender === "string" || gender === null ? gender : undefined,
      dateOfBirth: typeof dateOfBirth === "string" || dateOfBirth === null ? dateOfBirth : undefined,
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error("Error updating user profile:", err);
    if (err instanceof Error) {
      if (err.message === "EMAIL_TAKEN") {
        return res.status(409).json({ code: "EMAIL_TAKEN", message: "Email đã được sử dụng bởi tài khoản khác" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
      }
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi cập nhật profile" });
  }
};

export const getAddressesController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const data = await getUserAddresses(userId);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching addresses:", err);
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi lấy danh sách địa chỉ" });
  }
};

export const createAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const payload = { ...(req.body || {}) };

    // Validate tối thiểu
    if (!payload || typeof payload.recipient !== "string" || payload.recipient.trim() === "") {
      return res.status(400).json({ code: "RECIPIENT_REQUIRED", message: "Vui lòng nhập người nhận (recipient)" });
    }
    if (payload.label !== undefined && !isValidLabel(payload.label)) {
      return res.status(400).json({ code: "INVALID_LABEL", message: "label chỉ nhận HOME/WORK/OTHER hoặc null" });
    }
    if (payload.phone !== undefined && payload.phone !== null) {
      if (typeof payload.phone !== "string" || (payload.phone.trim() && !isValidPhone(payload.phone.trim()))) {
        return res.status(400).json({ code: "INVALID_PHONE", message: "Số điện thoại không hợp lệ" });
      }
    }
    payload.setDefault = toBool(payload.setDefault);

    const data = await createUserAddress(userId, payload);

    return res.status(201).json(data);
  } catch (err) {
    console.error("Error creating address:", err);
    if (err instanceof Error) {
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
      }
      if (err.message === "RECIPIENT_REQUIRED") {
        return res.status(400).json({ code: "RECIPIENT_REQUIRED", message: "Vui lòng nhập người nhận (recipient)" });
      }
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi tạo địa chỉ" });
  }
};

export const updateAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const addressId = parseIdParam(String(req.params.addressId), res, "addressId");
    if (!addressId) return;

    const payload = { ...(req.body || {}) };
    if (payload.label !== undefined && !isValidLabel(payload.label)) {
      return res.status(400).json({ code: "INVALID_LABEL", message: "label chỉ nhận HOME/WORK/OTHER hoặc null" });
    }
    if (payload.phone !== undefined && payload.phone !== null) {
      if (typeof payload.phone !== "string" || (payload.phone.trim() && !isValidPhone(payload.phone.trim()))) {
        return res.status(400).json({ code: "INVALID_PHONE", message: "Số điện thoại không hợp lệ" });
      }
    }
    if (payload.dateOfBirth !== undefined) {
      // đề phòng client gửi nhầm field
      delete payload.dateOfBirth;
    }
    if (payload.setDefault !== undefined) {
      payload.setDefault = toBool(payload.setDefault);
    }

    const data = await updateUserAddress(userId, addressId, payload);
    return res.status(200).json(data);
  } catch (err) {
    console.error("Error updating address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res.status(404).json({ code: "ADDRESS_NOT_FOUND_OR_FORBIDDEN", message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi cập nhật địa chỉ" });
  }
};

export const deleteAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const addressId = parseIdParam(String(req.params.addressId), res, "addressId");
    if (!addressId) return;

    const result = await deleteUserAddress(userId, addressId);
    return res.status(200).json({
      message: "Address deleted successfully.",
      ...result,
    });
  } catch (err) {
    console.error("Error deleting address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res.status(404).json({ code: "ADDRESS_NOT_FOUND_OR_FORBIDDEN", message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
      }
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi xoá địa chỉ" });
  }
};

export const setDefaultAddressController = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const addressId = parseIdParam(String(req.params.addressId), res, "addressId");
    if (!addressId) return;

    const result = await setDefaultAddress(userId, addressId);
    return res.status(200).json({
      message: result.changed ? "Đã đặt địa chỉ làm mặc định" : "Địa chỉ đã là mặc định",
      previousDefaultAddressId: result.previousDefaultAddressId,
      newDefaultAddressId: result.newDefaultAddressId,
      changed: result.changed,
    });
  } catch (err) {
    console.error("Error set default address:", err);
    if (err instanceof Error) {
      if (err.message === "ADDRESS_NOT_FOUND_OR_FORBIDDEN") {
        return res.status(404).json({ code: "ADDRESS_NOT_FOUND_OR_FORBIDDEN", message: "Không tìm thấy địa chỉ hoặc không thuộc về bạn" });
      }
      if (err.message === "USER_NOT_FOUND") {
        return res.status(404).json({ code: "USER_NOT_FOUND", message: "Không tìm thấy người dùng" });
      }
    }
    return res.status(500).json({ code: "SERVER_ERROR", message: "Lỗi máy chủ khi đặt địa chỉ mặc định" });
  }
};

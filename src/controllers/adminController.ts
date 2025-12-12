import { Request, Response } from "express";
import {
  getProvinces,
  getDistrictsByProvince,
  getWardsByDistrict,
  getDashboardOverview,
  DashboardTimeRange,
  getDashboardInventory,
  listAdminOrders,
  getAdminOrderDetail,
  updateAdminOrderStatus,
  AdminOrderActionError,
  type AdminOrderStatus,
  listAdminProducts,
  type AdminProductStockStatus,
  createAdminProduct,
  updateAdminProduct,
  listAdminCategories,
  getAdminCategoryTree,
  getAdminCategoryDetail,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  getAdminProductDetail,
  deleteAdminProduct,
  AdminProductActionError,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  updateAdminUserStatus,
  softDeleteAdminUser,
  AdminUserActionError,
  type AdminUserDto,
  type AdminUserUpdatePayload,
} from "../services/adminService";
import { Prisma, Role, UserStatus } from "@prisma/client";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";

const DASHBOARD_RANGES = new Set<DashboardTimeRange>(["today", "week", "month", "quarter", "year"]);
const ADMIN_ORDER_STATUSES = new Set<AdminOrderStatus>([
  "pending",
  "processing",
  "packed",
  "shipping",
  "completed",
  "cancelled",
  "refunded",
]);

const ADMIN_PRODUCT_STATUSES = new Set<AdminProductStockStatus>([
  "in-stock",
  "low-stock",
  "out-of-stock",
]);

const ADMIN_ROLES: Record<string, Role> = {
  admin: Role.ADMIN,
  staff: Role.STAFF,
  customer: Role.CUSTOMER,
};

const ADMIN_USER_STATUS: Record<string, UserStatus> = {
  active: UserStatus.ACTIVE,
  suspended: UserStatus.SUSPENDED,
};

const parseNumeric = (value: unknown): number | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseStatusQuery = (value: unknown): AdminOrderStatus[] | undefined => {
  if (Array.isArray(value)) {
    const statuses = value
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter((item): item is AdminOrderStatus => ADMIN_ORDER_STATUSES.has(item as AdminOrderStatus));
    return statuses.length ? Array.from(new Set(statuses)) : undefined;
  }
  if (typeof value === "string" && value.trim().length) {
    const statuses = value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is AdminOrderStatus => ADMIN_ORDER_STATUSES.has(item as AdminOrderStatus));
    return statuses.length ? Array.from(new Set(statuses)) : undefined;
  }
  return undefined;
};

const normalizeOrderIdParam = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits.length) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseRoleValue = (value: unknown): Role | null => {
  if (typeof value !== "string") return null;
  return ADMIN_ROLES[value.trim().toLowerCase()] ?? null;
};

const parseUserStatusValue = (value: unknown): UserStatus | null => {
  if (typeof value !== "string") return null;
  return ADMIN_USER_STATUS[value.trim().toLowerCase()] ?? null;
};

const formatRole = (role: Role) => {
  switch (role) {
    case Role.ADMIN:
      return "Admin";
    case Role.STAFF:
      return "Staff";
    case Role.CUSTOMER:
      return "Customer";
    default:
      return role;
  }
};

const formatUserStatus = (status: UserStatus) => (status === UserStatus.ACTIVE ? "active" : "suspended");

const mapAdminUserResponse = (user: AdminUserDto) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: formatRole(user.role),
  status: formatUserStatus(user.status),
  lastActive: user.lastActiveAt ? user.lastActiveAt.toISOString() : null,
});

export const listAdminUsersController = async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const role = parseRoleValue(req.query.role);

  try {
    const users = await listAdminUsers({ search, role });
    return res.status(200).json(users.map(mapAdminUserResponse));
  } catch (error) {
    console.error("Failed to list admin users", error);
    return res.status(500).json({ message: "Không thể tải danh sách nhân sự" });
  }
};

export const createAdminUserController = async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = parseRoleValue(body.role);

  if (!name || !email || !role) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
  }

  try {
    const user = await createAdminUser({ name, email, role });
    return res.status(201).json(mapAdminUserResponse(user));
  } catch (error) {
    if (error instanceof AdminUserActionError) {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    console.error("Failed to create admin user", error);
    return res.status(500).json({ message: "Không thể tạo nhân sự" });
  }
};

export const updateAdminUserController = async (req: Request, res: Response) => {
  const userId = parseNumeric(req.params.userId ?? req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Mã nhân sự không hợp lệ" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const payload: AdminUserUpdatePayload = {};

  if (typeof body.name === "string") payload.name = body.name.trim();
  if (typeof body.email === "string") payload.email = body.email.trim();
  const role = parseRoleValue(body.role);
  if (role) payload.role = role;

  if (!Object.keys(payload).length) {
    return res.status(400).json({ message: "Không có thay đổi nào được cung cấp" });
  }

  try {
    const user = await updateAdminUser(userId, payload);
    return res.status(200).json(mapAdminUserResponse(user));
  } catch (error) {
    if (error instanceof AdminUserActionError) {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    console.error("Failed to update admin user", error);
    return res.status(500).json({ message: "Không thể cập nhật nhân sự" });
  }
};

export const updateAdminUserStatusController = async (req: Request, res: Response) => {
  const userId = parseNumeric(req.params.userId ?? req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Mã nhân sự không hợp lệ" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const status = parseUserStatusValue(body.status ?? req.query.status);
  if (!status) {
    return res.status(400).json({ message: "Trạng thái không hợp lệ" });
  }

  try {
    const user = await updateAdminUserStatus(userId, status);
    return res.status(200).json(mapAdminUserResponse(user));
  } catch (error) {
    if (error instanceof AdminUserActionError) {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    console.error("Failed to update admin user status", error);
    return res.status(500).json({ message: "Không thể cập nhật trạng thái" });
  }
};

export const deleteAdminUserController = async (req: Request, res: Response) => {
  const userId = parseNumeric(req.params.userId ?? req.params.id);
  if (!userId) {
    return res.status(400).json({ message: "Mã nhân sự không hợp lệ" });
  }

  try {
    await softDeleteAdminUser(userId);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof AdminUserActionError) {
      return res.status(error.status).json({ message: error.message, code: error.code });
    }
    console.error("Failed to delete admin user", error);
    return res.status(500).json({ message: "Không thể xoá nhân sự" });
  }
};

export const listProvincesController = async (_req: Request, res: Response) => {
  try {
    const data = await getProvinces();
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách tỉnh/thành" });
  }
};

export const listDistrictsController = async (req: Request, res: Response) => {
  const provinceCode = String(req.query.provinceCode || "");
  if (!provinceCode) return res.status(400).json({ message: "Thiếu provinceCode" });
  try {
    const data = await getDistrictsByProvince(provinceCode);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách quận/huyện" });
  }
};

export const listWardsController = async (req: Request, res: Response) => {
  const districtCode = String(req.query.districtCode || "");
  if (!districtCode) return res.status(400).json({ message: "Thiếu districtCode" });
  try {
    const data = await getWardsByDistrict(districtCode);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách phường/xã" });
  }
};

export const getDashboardOverviewController = async (req: Request, res: Response) => {
  const rangeParam = String(req.query.range || "week") as DashboardTimeRange;
  if (!DASHBOARD_RANGES.has(rangeParam)) {
    return res.status(400).json({ message: "Khoảng thời gian không hợp lệ" });
  }

  try {
    const overview = await getDashboardOverview(rangeParam);
    return res.status(200).json(overview);
  } catch (error) {
    console.error("Failed to get dashboard overview", error);
    return res.status(500).json({ message: "Không thể lấy số liệu dashboard" });
  }
};

export const getDashboardInventoryController = async (req: Request, res: Response) => {
  const rangeParam = String(req.query.range || "week") as DashboardTimeRange;
  if (!DASHBOARD_RANGES.has(rangeParam)) {
    return res.status(400).json({ message: "Khoảng thời gian không hợp lệ" });
  }

  const limitParam = Number(req.query.limit ?? 3);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : undefined;

  try {
    const inventory = await getDashboardInventory(rangeParam, limit);
    return res.status(200).json(inventory);
  } catch (error) {
    console.error("Failed to get dashboard inventory", error);
    return res.status(500).json({ message: "Không thể lấy dữ liệu tồn kho" });
  }
};

export const listAdminCategoriesController = async (_req: Request, res: Response) => {
  try {
    const categories = await listAdminCategories();
    return res.status(200).json(categories);
  } catch (error) {
    console.error("Failed to list admin categories", error);
    return res.status(500).json({ message: "Không thể tải danh mục" });
  }
};

export const getAdminCategoryTreeController = async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  try {
    const categories = await getAdminCategoryTree(search);
    return res.status(200).json(categories);
  } catch (error) {
    console.error("Failed to get admin category tree", error);
    return res.status(500).json({ message: "Không thể tải cây danh mục" });
  }
};

export const getAdminCategoryDetailController = async (req: Request, res: Response) => {
  const categoryId = parseNumeric(req.params.categoryId ?? req.params.id);
  if (!categoryId || categoryId <= 0) {
    return res.status(400).json({ message: "Mã danh mục không hợp lệ" });
  }

  try {
    const detail = await getAdminCategoryDetail(categoryId);
    if (!detail) {
      return res.status(404).json({ message: "Không tìm thấy danh mục" });
    }
    return res.status(200).json(detail);
  } catch (error) {
    console.error("Failed to get admin category detail", error);
    return res.status(500).json({ message: "Không thể tải thông tin danh mục" });
  }
};

export const createAdminCategoryController = async (req: AuthenticatedRequest, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name : "";
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const description = typeof body.description === "string" ? body.description : null;
  const parentId = parseNumeric(body.parentId);

  try {
    const category = await createAdminCategory({
      name,
      slug,
      description,
      parentId,
    });
    return res.status(201).json(category);
  } catch (error) {
    if (error instanceof AdminProductActionError) {
      return res.status(error.httpStatus ?? 400).json({ message: error.message, code: error.code });
    }
    console.error("Failed to create admin category", error);
    return res.status(500).json({ message: "Không thể tạo danh mục" });
  }
};

export const updateAdminCategoryController = async (req: AuthenticatedRequest, res: Response) => {
  const categoryId = parseNumeric(req.params.categoryId ?? req.params.id);
  if (!categoryId || categoryId <= 0) {
    return res.status(400).json({ message: "Mã danh mục không hợp lệ" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name : undefined;
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const description = typeof body.description === "string" ? body.description : undefined;
  const parentId = body.parentId === null ? null : parseNumeric(body.parentId);

  try {
    const category = await updateAdminCategory(categoryId, {
      name,
      slug,
      description,
      parentId,
    });
    return res.status(200).json(category);
  } catch (error) {
    if (error instanceof AdminProductActionError) {
      return res.status(error.httpStatus ?? 400).json({ message: error.message, code: error.code });
    }
    console.error("Failed to update admin category", error);
    return res.status(500).json({ message: "Không thể cập nhật danh mục" });
  }
};

export const deleteAdminCategoryController = async (req: AuthenticatedRequest, res: Response) => {
  const categoryId = parseNumeric(req.params.categoryId ?? req.params.id);
  if (!categoryId || categoryId <= 0) {
    return res.status(400).json({ message: "Mã danh mục không hợp lệ" });
  }

  try {
    await deleteAdminCategory(categoryId);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof AdminProductActionError) {
      return res.status(error.httpStatus ?? 400).json({ message: error.message, code: error.code });
    }
    console.error("Failed to delete admin category", error);
    return res.status(500).json({ message: "Không thể xóa danh mục" });
  }
};

export const listAdminProductsController = async (req: Request, res: Response) => {
  const page = parseNumeric(req.query.page);
  const pageSize = parseNumeric(req.query.pageSize ?? req.query.limit);
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const categoryId = parseNumeric(req.query.categoryId ?? req.query.category);

  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : undefined;
  const status = statusRaw && ADMIN_PRODUCT_STATUSES.has(statusRaw as AdminProductStockStatus)
    ? (statusRaw as AdminProductStockStatus)
    : undefined;

  try {
    const result = await listAdminProducts({
      page: page && page > 0 ? Math.floor(page) : undefined,
      pageSize: pageSize && pageSize > 0 ? Math.floor(pageSize) : undefined,
      search,
      categoryId,
      status,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to list admin products", error);
    return res.status(500).json({ message: "Không thể tải danh sách sản phẩm" });
  }
};

export const getAdminProductDetailController = async (req: Request, res: Response) => {
  const rawId = req.params.productId ?? req.params.id;
  const productId = Number.parseInt(String(rawId ?? ""), 10);

  if (!Number.isFinite(productId) || productId <= 0) {
    return res.status(400).json({ message: "Mã sản phẩm không hợp lệ" });
  }

  try {
    const product = await getAdminProductDetail(productId);
    if (!product) {
      return res.status(404).json({ message: "Không tìm thấy sản phẩm" });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("Failed to get admin product detail", error);
    return res.status(500).json({ message: "Không thể tải thông tin sản phẩm" });
  }
};

export const createAdminProductController = async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const basePrice = parseNumeric(body.basePrice);
  const categoryId = parseNumeric(body.categoryId);
  const brandIdRaw = parseNumeric(body.brandId);
  const description = typeof body.description === "string" ? body.description : undefined;

  if (!name) return res.status(400).json({ message: "Thiếu tên sản phẩm" });
  if (!slug) return res.status(400).json({ message: "Thiếu slug sản phẩm" });
  if (!basePrice || basePrice <= 0) {
    return res.status(400).json({ message: "Giá sản phẩm không hợp lệ" });
  }
  if (!categoryId || categoryId <= 0) {
    return res.status(400).json({ message: "Danh mục không hợp lệ" });
  }

  const safeBasePrice = basePrice as number;
  const safeCategoryId = categoryId as number;
  const normalizedBrandId = typeof brandIdRaw === "number" ? brandIdRaw : undefined;

  const features = body.features as Prisma.InputJsonValue | undefined;
  const specifications = body.specifications as Prisma.InputJsonValue | undefined;

  const images = Array.isArray(body.images)
    ? body.images
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          url: typeof item.url === "string" ? item.url : "",
          alt: typeof item.alt === "string" ? item.alt : null,
          isPrimary: typeof item.isPrimary === "boolean" ? item.isPrimary : undefined,
          sortOrder: parseNumeric(item.sortOrder),
        }))
        .filter((item) => item.url.trim().length)
    : undefined;

  const variants = Array.isArray(body.variants)
    ? body.variants
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          sku: typeof item.sku === "string" ? item.sku : undefined,
          price: parseNumeric(item.price),
          stock: parseNumeric(item.stock),
          sizeId: parseNumeric(item.sizeId),
          colorId: parseNumeric(item.colorId),
          isActive: typeof item.isActive === "boolean" ? item.isActive : undefined,
        }))
    : undefined;

  try {
    const product = await createAdminProduct({
      name,
      slug,
      description,
      basePrice: safeBasePrice,
      categoryId: safeCategoryId,
      brandId: normalizedBrandId,
      features,
      specifications,
      images,
      variants,
    });

    return res.status(201).json({
      message: "Create a successful product.",
      product,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ message: "Slug đã tồn tại, vui lòng chọn slug khác" });
    }
    console.error("Failed to create admin product", error);
    return res.status(500).json({ message: "Không thể tạo sản phẩm" });
  }
};

export const updateAdminProductController = async (req: Request, res: Response) => {
  const rawId = req.params.productId ?? req.params.id;
  const productId = Number.parseInt(String(rawId ?? ""), 10);

  if (!Number.isFinite(productId) || productId <= 0) {
    return res.status(400).json({ message: "Mã sản phẩm không hợp lệ" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const basePrice = parseNumeric(body.basePrice);
  const categoryId = parseNumeric(body.categoryId);
  const brandIdRaw = parseNumeric(body.brandId);
  const description = typeof body.description === "string" ? body.description : undefined;

  if (!name) return res.status(400).json({ message: "Thiếu tên sản phẩm" });
  if (!slug) return res.status(400).json({ message: "Thiếu slug sản phẩm" });
  if (!basePrice || basePrice <= 0) {
    return res.status(400).json({ message: "Giá sản phẩm không hợp lệ" });
  }
  if (!categoryId || categoryId <= 0) {
    return res.status(400).json({ message: "Danh mục không hợp lệ" });
  }

  const safeBasePrice = basePrice as number;
  const safeCategoryId = categoryId as number;
  const normalizedBrandId = typeof brandIdRaw === "number" ? brandIdRaw : undefined;

  const features = body.features as Prisma.InputJsonValue | undefined;
  const specifications = body.specifications as Prisma.InputJsonValue | undefined;

  const images = Array.isArray(body.images)
    ? body.images
        .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
        .map((item) => ({
          url: typeof item.url === "string" ? item.url : "",
          alt: typeof item.alt === "string" ? item.alt : null,
          isPrimary: typeof item.isPrimary === "boolean" ? item.isPrimary : undefined,
          sortOrder: parseNumeric(item.sortOrder),
        }))
        .filter((item) => item.url.trim().length)
    : undefined;

  try {
    const product = await updateAdminProduct(productId, {
      name,
      slug,
      description,
      basePrice: safeBasePrice,
      categoryId: safeCategoryId,
      brandId: normalizedBrandId,
      features,
      specifications,
      images,
    });

    return res.status(200).json({
      message: "Product update successful",
      product,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ message: "Slug đã tồn tại, vui lòng chọn slug khác" });
    }
    if (error instanceof AdminProductActionError) {
      return res.status(error.httpStatus).json({ message: error.message, code: error.code });
    }
    console.error("Failed to update admin product", error);
    return res.status(500).json({ message: "Không thể cập nhật sản phẩm" });
  }
};

export const deleteAdminProductController = async (req: Request, res: Response) => {
  const rawId = req.params.productId ?? req.params.id;
  const productId = Number.parseInt(String(rawId ?? ""), 10);

  if (!Number.isFinite(productId) || productId <= 0) {
    return res.status(400).json({ message: "Mã sản phẩm không hợp lệ" });
  }

  try {
    await deleteAdminProduct(productId);
    return res.status(204).send();
  } catch (error) {
    if (error instanceof AdminProductActionError) {
      return res.status(error.httpStatus).json({ message: error.message, code: error.code });
    }
    console.error("Failed to delete admin product", error);
    return res.status(500).json({ message: "Không thể xóa sản phẩm" });
  }
};

export const listAdminOrdersController = async (req: Request, res: Response) => {
  const page = parseNumeric(req.query.page);
  const pageSize = parseNumeric(req.query.pageSize ?? req.query.limit);
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const statuses = parseStatusQuery(req.query.status);

  try {
    const result = await listAdminOrders({
      page: page && page > 0 ? Math.floor(page) : undefined,
      pageSize: pageSize && pageSize > 0 ? Math.floor(pageSize) : undefined,
      search,
      statuses,
    });
    const { pagination } = result;
    const { page: currentPage, pageSize: currentPageSize, totalPages } = pagination;

    const buildPageLink = (targetPage: number): string => {
      const host = req.get("host");
      const origin = `${req.protocol}://${host ?? "localhost"}`;
      const url = new URL(req.originalUrl, origin);
      url.searchParams.set("page", String(targetPage));
      url.searchParams.set("pageSize", String(currentPageSize));
      return host ? url.toString() : `${url.pathname}${url.search}`;
    };

    const hasPages = totalPages > 0;
    const previousLink = hasPages && currentPage > 1 ? buildPageLink(currentPage - 1) : null;
    const nextLink = hasPages && currentPage < totalPages ? buildPageLink(currentPage + 1) : null;

    return res.status(200).json({
      ...result,
      pagination: {
        ...pagination,
        previousLink,
        nextLink,
      },
    });
  } catch (error) {
    console.error("Failed to list admin orders", error);
    return res.status(500).json({ message: "Không thể tải danh sách đơn hàng" });
  }
};

export const getAdminOrderDetailController = async (req: Request, res: Response) => {
  const rawId = String(req.params.orderId || "");
  const orderId = normalizeOrderIdParam(rawId);
  if (!orderId) {
    return res.status(400).json({ message: "orderId không hợp lệ" });
  }
  
  try {
    const order = await getAdminOrderDetail(orderId);
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }
    return res.status(200).json(order);
  } catch (error) {
    console.error("Failed to get admin order detail", error);
    return res.status(500).json({ message: "Không thể tải chi tiết đơn hàng" });
  }
};

export const updateAdminOrderStatusController = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  const rawId = String(req.params.orderId || "");
  const orderId = normalizeOrderIdParam(rawId);
  if (!orderId) {
    return res.status(400).json({ message: "orderId không hợp lệ" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const statusRaw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";

  if (!statusRaw || !ADMIN_ORDER_STATUSES.has(statusRaw as AdminOrderStatus)) {
    return res.status(400).json({ message: "Trạng thái không hợp lệ" });
  }

  const note = typeof body.note === "string" ? body.note : undefined;
  const actorId =
    typeof req.user?.userId === "number" ? (req.user.userId as number) : undefined;

  try {
    const result = await updateAdminOrderStatus({
      orderId,
      status: statusRaw as AdminOrderStatus,
      note,
      actorId,
    });

    return res.status(200).json({
      message: "Status update successful",
      order: result.detail,
      summary: result.summary,
      status: result.status,
      rawStatus: result.rawStatus,
      changed: result.changed,
    });
  } catch (error) {
    if (error instanceof AdminOrderActionError) {
      return res
        .status(error.httpStatus)
        .json({ message: error.message, code: error.code });
    }
    console.error("Failed to update admin order status", error);
    return res
      .status(500)
      .json({ message: "Không thể cập nhật trạng thái đơn hàng" });
  }
};
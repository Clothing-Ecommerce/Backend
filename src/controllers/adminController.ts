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
  listAdminCategories,
} from "../services/adminService";
import { Prisma } from "@prisma/client";
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
      message: "Tạo sản phẩm thành công",
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
      message: "Cập nhật trạng thái thành công",
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
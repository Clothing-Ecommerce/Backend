import { Router } from "express";
import { Role } from "@prisma/client";
import {
  listProvincesController,
  listDistrictsController,
  listWardsController,
  getDashboardOverviewController,
  getDashboardInventoryController,
  listAdminOrdersController,
  getAdminOrderDetailController,
  updateAdminOrderStatusController,
  listAdminProductsController,
  createAdminProductController,
  listAdminCategoriesController,
  getAdminProductDetailController,
  deleteAdminProductController,
  updateAdminProductController,
  getAdminCategoryTreeController,
  getAdminCategoryDetailController,
  createAdminCategoryController,
  updateAdminCategoryController,
  deleteAdminCategoryController,
  listAdminUsersController,
  createAdminUserController,
  updateAdminUserController,
  updateAdminUserStatusController,
  deleteAdminUserController,
} from "../controllers/adminController";
import {
  categoryAnalyticsController,
  inventoryAnalyticsController,
  locationAnalyticsController,
  paymentAnalyticsController,
  reportOverviewController,
  vipCustomersController,
} from "../controllers/reportController";
import { authenticateJWT, authorizeRoles } from "../middleware/authMiddleware";

const router = Router();

// 1. Áp dụng xác thực đăng nhập cho TẤT CẢ các route trong file này
router.use(authenticateJWT);

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController);
router.get("/wards", listWardsController);

// ==================================================================
// NHÓM 1: STAFF & ADMIN CÙNG TRUY CẬP ĐƯỢC
// (Dashboard cơ bản, Đơn hàng, Kho)
// ==================================================================

// Dashboard & Inventory (Staff cần xem kho và tổng quan đơn hàng)
router.get("/dashboard/overview", authorizeRoles(Role.STAFF, Role.ADMIN), getDashboardOverviewController);
router.get("/dashboard/inventory", authorizeRoles(Role.STAFF, Role.ADMIN), getDashboardInventoryController);

// Quản lý Đơn hàng (Staff cần xử lý đơn)
router.get("/orders", authorizeRoles(Role.STAFF, Role.ADMIN), listAdminOrdersController);
router.get("/orders/:orderId", authorizeRoles(Role.STAFF, Role.ADMIN), getAdminOrderDetailController);
router.patch("/orders/:orderId/status", authorizeRoles(Role.STAFF, Role.ADMIN), updateAdminOrderStatusController);

// ==================================================================
// NHÓM 2: CHỈ ADMIN MỚI ĐƯỢC TRUY CẬP (Rất quan trọng)
// (Báo cáo doanh thu, Quản lý User, Sản phẩm, Danh mục)
// ==================================================================

// Báo cáo & Phân tích (Thường Staff không được xem doanh thu chi tiết)
router.get("/reports/overview", authorizeRoles(Role.ADMIN), reportOverviewController);
router.get("/reports/categories", authorizeRoles(Role.ADMIN), categoryAnalyticsController);
router.get("/reports/locations", authorizeRoles(Role.ADMIN), locationAnalyticsController);
router.get("/reports/payments", authorizeRoles(Role.ADMIN), paymentAnalyticsController);
router.get("/reports/inventory", authorizeRoles(Role.ADMIN), inventoryAnalyticsController);
router.get("/reports/vip-customers", authorizeRoles(Role.ADMIN), vipCustomersController);

// Quản lý Danh mục (Chỉ Admin)
router.get("/categories", authorizeRoles(Role.ADMIN), listAdminCategoriesController);
router.get("/categories/tree", authorizeRoles(Role.ADMIN), getAdminCategoryTreeController);
router.get("/categories/:categoryId", authorizeRoles(Role.ADMIN), getAdminCategoryDetailController);
router.post("/categories", authorizeRoles(Role.ADMIN), createAdminCategoryController);
router.patch("/categories/:categoryId", authorizeRoles(Role.ADMIN), updateAdminCategoryController);
router.delete("/categories/:categoryId", authorizeRoles(Role.ADMIN), deleteAdminCategoryController);

// Quản lý Sản phẩm (Chỉ Admin - hoặc Staff nếu bạn muốn cho phép Staff sửa sp)
// Theo báo cáo thì chỉ Admin quản lý Products
router.get("/products", authorizeRoles(Role.ADMIN), listAdminProductsController);
router.get("/products/:productId", authorizeRoles(Role.ADMIN), getAdminProductDetailController);
router.post("/products", authorizeRoles(Role.ADMIN), createAdminProductController);
router.patch("/products/:productId", authorizeRoles(Role.ADMIN), updateAdminProductController);
router.delete("/products/:productId", authorizeRoles(Role.ADMIN), deleteAdminProductController);

// Quản lý User (Tuyệt đối chỉ Admin)
router.get("/users", authorizeRoles(Role.ADMIN), listAdminUsersController);
router.post("/users", authorizeRoles(Role.ADMIN), createAdminUserController);
router.patch("/users/:userId", authorizeRoles(Role.ADMIN), updateAdminUserController);
router.patch("/users/:userId/status", authorizeRoles(Role.ADMIN), updateAdminUserStatusController);
router.delete("/users/:userId", authorizeRoles(Role.ADMIN), deleteAdminUserController);

export default router;

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

router.use(authenticateJWT);

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController);
router.get("/wards", listWardsController);

router.get("/dashboard/overview", authorizeRoles(Role.STAFF, Role.ADMIN), getDashboardOverviewController);
router.get("/dashboard/inventory", authorizeRoles(Role.STAFF, Role.ADMIN), getDashboardInventoryController);

router.get("/orders", authorizeRoles(Role.STAFF, Role.ADMIN), listAdminOrdersController);
router.get("/orders/:orderId", authorizeRoles(Role.STAFF, Role.ADMIN), getAdminOrderDetailController);
router.patch("/orders/:orderId/status", authorizeRoles(Role.STAFF, Role.ADMIN), updateAdminOrderStatusController);

router.get("/reports/overview", authorizeRoles(Role.ADMIN), reportOverviewController);
router.get("/reports/categories", authorizeRoles(Role.ADMIN), categoryAnalyticsController);
router.get("/reports/locations", authorizeRoles(Role.ADMIN), locationAnalyticsController);
router.get("/reports/payments", authorizeRoles(Role.ADMIN), paymentAnalyticsController);
router.get("/reports/inventory", authorizeRoles(Role.ADMIN), inventoryAnalyticsController);
router.get("/reports/vip-customers", authorizeRoles(Role.ADMIN), vipCustomersController);

// Category Management
router.get("/categories", authorizeRoles(Role.ADMIN), listAdminCategoriesController);
router.get("/categories/tree", authorizeRoles(Role.ADMIN), getAdminCategoryTreeController);
router.get("/categories/:categoryId", authorizeRoles(Role.ADMIN), getAdminCategoryDetailController);
router.post("/categories", authorizeRoles(Role.ADMIN), createAdminCategoryController);
router.patch("/categories/:categoryId", authorizeRoles(Role.ADMIN), updateAdminCategoryController);
router.delete("/categories/:categoryId", authorizeRoles(Role.ADMIN), deleteAdminCategoryController);

// Product Management
router.get("/products", authorizeRoles(Role.STAFF, Role.ADMIN), listAdminProductsController);
router.get("/products/:productId", authorizeRoles(Role.STAFF,Role.ADMIN), getAdminProductDetailController);
router.post("/products", authorizeRoles(Role.ADMIN), createAdminProductController);
router.patch("/products/:productId", authorizeRoles(Role.ADMIN), updateAdminProductController);
router.delete("/products/:productId", authorizeRoles(Role.ADMIN), deleteAdminProductController);

// User Management
router.get("/users", authorizeRoles(Role.ADMIN), listAdminUsersController);
router.post("/users", authorizeRoles(Role.ADMIN), createAdminUserController);
router.patch("/users/:userId", authorizeRoles(Role.ADMIN), updateAdminUserController);
router.patch("/users/:userId/status", authorizeRoles(Role.ADMIN), updateAdminUserStatusController);
router.delete("/users/:userId", authorizeRoles(Role.ADMIN), deleteAdminUserController);

export default router;

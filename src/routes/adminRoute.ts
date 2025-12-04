import { Router } from "express";
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

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController);
router.get("/wards", listWardsController);

router.get("/users", listAdminUsersController);
router.post("/users", createAdminUserController);
router.patch("/users/:userId", updateAdminUserController);
router.patch("/users/:userId/status", updateAdminUserStatusController);
router.delete("/users/:userId", deleteAdminUserController);

router.get("/dashboard/overview", getDashboardOverviewController);
router.get("/dashboard/inventory", getDashboardInventoryController);

router.get("/reports/overview", reportOverviewController);
router.get("/reports/categories", categoryAnalyticsController);
router.get("/reports/locations", locationAnalyticsController);
router.get("/reports/payments", paymentAnalyticsController);
router.get("/reports/inventory", inventoryAnalyticsController);
router.get("/reports/vip-customers", vipCustomersController);

router.get("/categories", listAdminCategoriesController);
router.get("/categories/tree", getAdminCategoryTreeController);
router.get("/categories/:categoryId", getAdminCategoryDetailController);
router.post("/categories", createAdminCategoryController);
router.patch("/categories/:categoryId", updateAdminCategoryController);
router.delete("/categories/:categoryId", deleteAdminCategoryController);

router.get("/orders", listAdminOrdersController);
router.get("/orders/:orderId", getAdminOrderDetailController);
router.patch("/orders/:orderId/status", updateAdminOrderStatusController);

router.get("/products", listAdminProductsController);
router.get("/products/:productId", getAdminProductDetailController);
router.post("/products", createAdminProductController);
router.patch("/products/:productId", updateAdminProductController);
router.delete("/products/:productId", deleteAdminProductController);

export default router;

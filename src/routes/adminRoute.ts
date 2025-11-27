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
} from "../controllers/adminController";

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController);
router.get("/wards", listWardsController);

router.get("/dashboard/overview", getDashboardOverviewController);
router.get("/dashboard/inventory", getDashboardInventoryController);

router.get("/categories", listAdminCategoriesController);
router.get("/categories/tree", getAdminCategoryTreeController);
router.get("/categories/:categoryId", getAdminCategoryDetailController);
router.post("/categories", createAdminCategoryController);
router.patch("/categories/:categoryId", updateAdminCategoryController);

router.get("/orders", listAdminOrdersController);
router.get("/orders/:orderId", getAdminOrderDetailController);
router.patch("/orders/:orderId/status", updateAdminOrderStatusController);

router.get("/products", listAdminProductsController);
router.get("/products/:productId", getAdminProductDetailController);
router.post("/products", createAdminProductController);
router.patch("/products/:productId", updateAdminProductController);
router.delete("/products/:productId", deleteAdminProductController);

export default router;

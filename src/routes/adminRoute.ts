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
} from "../controllers/adminController";

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController); 
router.get("/wards", listWardsController);

router.get("/dashboard/overview", getDashboardOverviewController);
router.get("/dashboard/inventory", getDashboardInventoryController);

router.get("/categories", listAdminCategoriesController);

router.get("/orders", listAdminOrdersController);
router.get("/orders/:orderId", getAdminOrderDetailController);
router.patch("/orders/:orderId/status", updateAdminOrderStatusController);

router.get("/products", listAdminProductsController);
router.get("/products/:productId", getAdminProductDetailController);
router.post("/products", createAdminProductController);

export default router;

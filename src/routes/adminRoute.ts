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
} from "../controllers/adminController";

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController); 
router.get("/wards", listWardsController);

router.get("/dashboard/overview", getDashboardOverviewController);
router.get("/dashboard/inventory", getDashboardInventoryController);

router.get("/orders", listAdminOrdersController);
router.get("/orders/:orderId", getAdminOrderDetailController);
router.patch("/orders/:orderId/status", updateAdminOrderStatusController);

router.get("/products", listAdminProductsController);

export default router;

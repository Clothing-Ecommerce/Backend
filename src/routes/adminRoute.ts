import { Router } from "express";
import {
  listProvincesController,
  listDistrictsController,
  listWardsController,
  getDashboardOverviewController,
  getDashboardInventoryController,
} from "../controllers/adminController";

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController); 
router.get("/wards", listWardsController);         
router.get("/dashboard/overview", getDashboardOverviewController);
router.get("/dashboard/inventory", getDashboardInventoryController);

export default router;

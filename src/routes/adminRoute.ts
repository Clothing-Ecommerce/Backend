import { Router } from "express";
import {
  listProvincesController,
  listDistrictsController,
  listWardsController,
  getDashboardOverviewController,
} from "../controllers/adminController";

const router = Router();

router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController); 
router.get("/wards", listWardsController);         
router.get("/dashboard/overview", getDashboardOverviewController);

export default router;

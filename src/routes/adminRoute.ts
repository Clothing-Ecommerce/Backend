import { Router } from "express";
import { listProvincesController, listDistrictsController, listWardsController } from "../controllers/adminController";

const router = Router();

// Public endpoints (thường không cần auth)
router.get("/provinces", listProvincesController);
router.get("/districts", listDistrictsController); // ?provinceCode=79
router.get("/wards", listWardsController);         // ?districtCode=760

export default router;

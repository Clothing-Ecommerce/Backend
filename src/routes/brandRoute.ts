import { Router } from "express";
import { getBrandsController } from "../controllers/brandController";

const router = Router();

router.get("/", getBrandsController);

export default router;

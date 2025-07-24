import { Router } from "express";
import {
  getProductByIdController,
  getAllProductsController,
  getRelatedProductsController,
} from "../controllers/productController";

const router = Router();

router.get("/all", getAllProductsController);
router.get("/related", getRelatedProductsController);
router.get("/:id", getProductByIdController);

export default router;

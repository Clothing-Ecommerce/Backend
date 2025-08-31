import { Router } from "express";
import {
  getProductByIdController,
  getProductsController,
  getRelatedProductsController,
  getProductVariantsController,
} from "../controllers/productController";

const router = Router();

router.get("/", getProductsController);
router.get("/related", getRelatedProductsController);
router.get("/:id", getProductByIdController);
router.get("/:id/variants", getProductVariantsController);

export default router;

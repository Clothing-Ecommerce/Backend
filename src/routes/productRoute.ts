import { Router } from "express";
import {
  getProductByIdController,
  getProductsController,
  getRelatedProductsController,
  getProductVariantsController,
  searchSuggestController,
  getBestSellingProductsController,
} from "../controllers/productController";

const router = Router();

router.get("/", getProductsController);
router.get("/suggest", searchSuggestController);
router.get("/related", getRelatedProductsController);
router.get("/best-sellers", getBestSellingProductsController);
router.get("/:id", getProductByIdController);
router.get("/:id/variants", getProductVariantsController);

export default router;

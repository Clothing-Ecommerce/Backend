import { Router } from "express";
import {
  getProductByIdController,
  getProductsController,
} from "../controllers/productController";
// import {
//   getProductByIdController,
//   getAllProductsController,
//   getRelatedProductsController,
// } from "../controllers/productController";

const router = Router();

router.get("/", getProductsController);
// router.get("/related", getRelatedProductsController);
router.get("/:id", getProductByIdController);

export default router;

import { Router } from "express";
import { authenticateJWT } from "../middleware/authMiddleware";
import {
  deleteReviewController,
  updateReviewController,
} from "../controllers/reviewController";

const router = Router();

router.use(authenticateJWT);

router
  .route("/:reviewId")
  .patch(updateReviewController)
  .delete(deleteReviewController);

export default router;
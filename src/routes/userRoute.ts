import { Router } from "express";
import { getProfileController, updateProfileController } from "../controllers/userController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

router.get("/profile", authenticateJWT, getProfileController);
router.patch("/profile", authenticateJWT, updateProfileController);

export default router;
import { Router } from "express";
import {
  createAddressController,
  deleteAddressController,
  getAddressesController,
  getProfileController,
  setDefaultAddressController,
  updateAddressController,
  updateProfileController,
} from "../controllers/userController";
import { authenticateJWT } from "../middleware/authMiddleware";

const router = Router();

router.get("/profile", authenticateJWT, getProfileController);
router.patch("/profile", authenticateJWT, updateProfileController);
router.get("/addresses", authenticateJWT, getAddressesController);
router.post("/addresses", authenticateJWT, createAddressController);
router.post("/addresses/:addressId/default", authenticateJWT, setDefaultAddressController);
router.patch("/addresses/:addressId", authenticateJWT, updateAddressController);
router.delete("/addresses/:addressId", authenticateJWT, deleteAddressController);

export default router;

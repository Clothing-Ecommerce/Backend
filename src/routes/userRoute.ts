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

router.use(authenticateJWT);

router
  .route("/profile")
  .get(getProfileController)
  .patch(updateProfileController);

router
  .route("/addresses")
  .get(getAddressesController)
  .post(createAddressController);

router.post(
  "/addresses/:addressId/default",
  setDefaultAddressController
);

router
  .route("/addresses/:addressId")
  .patch(updateAddressController)
  .delete(deleteAddressController);

// router.get("/profile", authenticateJWT, getProfileController);
// router.patch("/profile", authenticateJWT, updateProfileController);
// router.get("/addresses", authenticateJWT, getAddressesController);
// router.post("/addresses", authenticateJWT, createAddressController);
// router.post("/addresses/:addressId/default", authenticateJWT, setDefaultAddressController);
// router.patch("/addresses/:addressId", authenticateJWT, updateAddressController);
// router.delete("/addresses/:addressId", authenticateJWT, deleteAddressController);

export default router;

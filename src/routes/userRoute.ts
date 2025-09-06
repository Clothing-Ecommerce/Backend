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

export default router;

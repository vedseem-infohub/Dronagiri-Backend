import express from "express";
import isAdmin from "../middlewares/isAdmin.js";
import {
  getAllCouponsAdmin,
  createCouponAdmin,
  updateCouponAdmin,
  toggleCouponAdmin,
  deleteCouponAdmin,
  validateCoupon,
  getActiveCouponsPublic,
} from "../controllers/coupon.controllers.js";

const couponRouter = express.Router();

// Public / Customer routes
couponRouter.post("/validate", validateCoupon);
couponRouter.get("/active", getActiveCouponsPublic);

// Admin routes (Protected by isAdmin)
couponRouter.get("/admin", isAdmin, getAllCouponsAdmin);
couponRouter.post("/admin", isAdmin, createCouponAdmin);
couponRouter.put("/admin/:id", isAdmin, updateCouponAdmin);
couponRouter.patch("/admin/:id/toggle", isAdmin, toggleCouponAdmin);
couponRouter.delete("/admin/:id", isAdmin, deleteCouponAdmin);

export default couponRouter;

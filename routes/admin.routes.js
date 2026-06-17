import express from "express";
import isAdmin from "../middlewares/isAdmin.js";
import {
  getAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  getCustomers,
} from "../controllers/admin.controllers.js";

const adminRouter = express.Router();

// Protect all admin endpoints with isAdmin middleware
adminRouter.get("/", isAdmin, getAdmins);
adminRouter.get("/customers", isAdmin, getCustomers);
adminRouter.post("/", isAdmin, createAdmin);
adminRouter.put("/:id", isAdmin, updateAdmin);
adminRouter.delete("/:id", isAdmin, deleteAdmin);

export default adminRouter;

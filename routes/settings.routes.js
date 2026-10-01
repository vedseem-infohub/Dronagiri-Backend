import express from "express";
import {
  getSettings,
  updateSettings,
  uploadImageDirect,
} from "../controllers/settings.controllers.js";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";

const router = express.Router();

// Public route to fetch site settings
router.get("/", getSettings);

// Admin-protected routes
router.put("/", isAuth, isAdmin, updateSettings);
router.post("/upload", isAuth, isAdmin, uploadImageDirect);

export default router;

import express from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controllers.js";
import isAdmin from "../middlewares/isAdmin.js";

const categoryRouter = express.Router();

categoryRouter.get("/", getCategories);
categoryRouter.post("/", isAdmin, createCategory);
categoryRouter.put("/:id", isAdmin, updateCategory);
categoryRouter.delete("/:id", isAdmin, deleteCategory);

export default categoryRouter;
